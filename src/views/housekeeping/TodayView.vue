<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { useAuth } from '@/composables/useAuth'
import { useHousekeepingToday, type RoomToday, type TodayTask } from '@/composables/useHousekeepingToday'
import { useWorkforce } from '@/composables/useWorkforce'
import { useMembers } from '@/composables/useMembers'
import { useRoomBookings } from '@/composables/useRoomBookings'
import { useLocale } from '@/composables/useLocale'
import { useToastStore } from '@/stores/toastStore'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import LanguageToggle from '@/components/ui/LanguageToggle.vue'
import { Check, LogOut } from 'lucide-vue-next'

const { t } = useI18n()
const { localizedName } = useLocale()

// Shared by two routes — housekeeping-today (a staff account's own rooms,
// no reassign controls) and housekeeping-schedule (administrator/manager,
// every room, with the reassign picker). Same underlying data and actions,
// just filtered and gated differently — mirrors
// docs/housekeeping-in-app-prototype.html's renderTodayOrSchedule(mode).
const route = useRoute()
const router = useRouter()
const mode = computed<'today' | 'schedule'>(() => (route.name === 'housekeeping-today' ? 'today' : 'schedule'))

const { workspaceId, user, membershipId, role, signOut } = useAuth()
const { rooms, loading, error, revision: todayRevision, load, complete, uncomplete, markInspected } = useHousekeepingToday()
const {
  members,
  revision: wfRevision,
  list: listMembers,
  loadDaysOff,
  loadAssignments,
  setAssignment,
  computeAssignments,
} = useWorkforce()
const { items: bookings, load: loadBookings } = useRoomBookings()
// Resolves an auth user id (task.completedBy/inspectedBy — see migration
// 0012, both reference auth.users) to a display name. workforce_members'
// own `id` is a different UUID space entirely (its PK, not an auth user
// id) — matching completedBy against it directly, as this used to,
// silently never matches and falls through to "Someone" for anyone but the
// viewer themself. The real chain is completedBy (auth uid) ->
// workspace_memberships.user_id -> workspace_memberships.id ->
// workforce_members.membership_id -> workforce_members.name (2026-08-26,
// bug caught by Jalie testing the staff account).
const { members: accounts, list: listAccounts } = useMembers()
const toast = useToastStore()

const todayIso = dayjs().format('YYYY-MM-DD')
const todayLabel = dayjs().format('dddd, MMMM D')

async function loadAll() {
  if (!workspaceId.value) return
  await Promise.all([
    load(workspaceId.value),
    listMembers(workspaceId.value),
    listAccounts(workspaceId.value),
    loadDaysOff(workspaceId.value, todayIso, todayIso),
    loadAssignments(workspaceId.value, todayIso),
    loadBookings(workspaceId.value, todayIso, todayIso),
  ])
}

watch(workspaceId, loadAll, { immediate: true })
watch(todayRevision, loadAll)
watch(wfRevision, loadAll)

// Kiosk mode (a staff/caretaker account, AppShell.vue's isKiosk) renders no
// chrome at all around this view, so it's the only place a caretaker can
// reach a sign-out control — 2026-08-25 fix, this was in the original
// prototype's header (docs/housekeeping-in-app-prototype.html's
// #signOutBtn, shown only for the Jane persona) but never carried into the
// real build.
const isKioskHeader = computed(() => mode.value === 'today' && role.value === 'staff')
const signingOut = ref(false)
async function onSignOut() {
  signingOut.value = true
  await signOut()
  router.push({ name: 'sign-in' })
}

// "Checkout today" / "Stayover" badge for booking-linked rooms, sourced from
// room_bookings (migration 0013, populated by the iCal sync). A linked room
// with no booking today (vacant) gets no badge. Unlinked rooms (common
// areas) never get one — matches the original plan in
// docs/housekeeping-in-app-prototype.html: the badge is context, not a
// filter, so stayover rooms stay on the checklist (2026-08-25, confirmed
// with Jalie rather than assumed).
type BookingBadge = { label: string; tone: 'checkout' | 'stayover' } | null
function bookingBadge(room: RoomToday): BookingBadge {
  if (!room.linkedToBookings) return null
  const booking = bookings.value.find((b) => b.room_id === room.roomId && b.starts_on <= todayIso && todayIso <= b.ends_on)
  if (!booking) return null
  return booking.ends_on === todayIso
    ? { label: t('hk.today.checkoutToday'), tone: 'checkout' }
    : { label: t('hk.today.stayover'), tone: 'stayover' }
}
// Colors match the original prototype's .room-badge.checkout/.stayover
// (docs/housekeeping-in-app-prototype.html) — stayover had drifted to a dull
// neutral gray in this build, when the prototype uses info-blue, same as
// checkout's warn-orange. Fixed 2026-08-26: a badge meant to grab attention
// shouldn't blend into the neutral chrome around it.
const BOOKING_BADGE_CLASS: Record<'checkout' | 'stayover', string> = {
  checkout: 'bg-warn-50 text-warn-600',
  stayover: 'bg-info-50 text-info-600',
}

// Inspection is a manager-level action (matches room_inspections' RLS,
// migration 0012) — staff don't get the "Mark inspected" control at all,
// same shared screen either way.
const canInspect = computed(() => role.value === 'administrator' || role.value === 'manager')

const myWorkforceMemberId = computed(() => members.value.find((m) => m.membership_id === membershipId.value)?.id ?? null)
const dueRoomIds = computed(() => rooms.value.map((r) => r.roomId))
const dayAssignments = computed(() => computeAssignments(dueRoomIds.value, todayIso))
const onShiftHousekeepers = computed(() => members.value.filter((m) => m.crew_role === 'housekeeper' && m.is_active))

function roomProgress(room: RoomToday) {
  const done = room.tasks.filter((t) => t.isDone).length
  return { done, total: room.tasks.length, complete: room.tasks.length > 0 && done === room.tasks.length }
}

// Checkout-today rooms need to be ready before the next guest arrives, so
// they lead the list — ahead of stayovers, which lead everything else with
// no booking badge. Requested 2026-08-26: a checkout room buried at the
// bottom (alphabetically) is easy to miss until it's already late in the day.
const BOOKING_URGENCY_RANK: Record<'checkout' | 'stayover' | 'none', number> = { checkout: 0, stayover: 1, none: 2 }
function bookingUrgency(room: RoomToday): number {
  return BOOKING_URGENCY_RANK[bookingBadge(room)?.tone ?? 'none']
}

const visibleRooms = computed(() => {
  const filtered =
    mode.value === 'today' ? rooms.value.filter((r) => dayAssignments.value[r.roomId] === myWorkforceMemberId.value) : rooms.value
  return [...filtered].sort((a, b) => bookingUrgency(a) - bookingUrgency(b) || a.roomName.localeCompare(b.roomName))
})

const daySummary = computed(() => {
  const done = visibleRooms.value.filter((r) => roomProgress(r).complete).length
  const total = visibleRooms.value.length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 }
})

function memberName(id: string | null): string {
  if (!id) return ''
  if (id === user.value?.id) return t('hk.today.you')
  const membership = accounts.value.find((a) => a.userId === id)
  const workforceMember = membership ? members.value.find((m) => m.membership_id === membership.membershipId) : undefined
  return workforceMember?.name ?? membership?.displayName ?? membership?.email ?? t('hk.today.someone')
}

function lastUpdate(room: RoomToday) {
  const completed = room.tasks.filter((t) => t.isDone && t.completedAt)
  if (!completed.length) return null
  return completed.reduce((latest, t) => (!latest || t.completedAt! > latest.completedAt! ? t : latest))
}

// ---- Room checklist sheet --------------------------------------------------

const openRoomId = ref<string | null>(null)
const openRoom = computed(() => rooms.value.find((r) => r.roomId === openRoomId.value) ?? null)
function openRoomSheet(roomId: string) {
  openRoomId.value = roomId
}

const pendingUntick = ref<TodayTask | null>(null)

async function onToggleTask(task: TodayTask) {
  if (!workspaceId.value) return
  if (!task.isDone) {
    const err = await complete(workspaceId.value, task.taskId)
    if (err) toast.show(err.message, { tone: 'error' })
    return
  }
  const mine = task.completedBy === user.value?.id
  if (!mine && !canInspect.value) {
    toast.show(t('hk.today.undoOnlyOwner', { name: memberName(task.completedBy) }), { tone: 'error' })
    return
  }
  if (!mine) {
    pendingUntick.value = task
    return
  }
  const err = await uncomplete(task.taskId, task.dueOn)
  if (err) toast.show(err.message, { tone: 'error' })
}

async function confirmUntick() {
  if (!pendingUntick.value) return
  const err = await uncomplete(pendingUntick.value.taskId, pendingUntick.value.dueOn)
  if (err) toast.show(err.message, { tone: 'error' })
  pendingUntick.value = null
}

async function onMarkInspected(roomId: string) {
  if (!workspaceId.value) return
  const roomName = rooms.value.find((r) => r.roomId === roomId)?.roomName ?? ''
  const err = await markInspected(workspaceId.value, roomId)
  if (err) toast.show(err.message, { tone: 'error' })
  else toast.show(t('hk.today.inspectedToast', { room: roomName }))
}

// ---- Reassign (schedule mode only) -----------------------------------------

const reassignOpenFor = ref<string | null>(null)
async function onReassign(roomId: string, memberId: string) {
  if (!workspaceId.value) return
  const err = await setAssignment(workspaceId.value, roomId, todayIso, memberId)
  if (err) toast.show(err.message, { tone: 'error' })
  reassignOpenFor.value = null
}

const CADENCE_TAG_CLASS: Record<string, string> = {
  daily: 'bg-neutral-100 text-neutral-500',
  weekly: 'bg-info-50 text-info-600',
  monthly: 'bg-warn-50 text-warn-600',
  quarterly: 'bg-accent-100 text-accent-700',
}
</script>

<template>
  <!-- Kiosk-only top bar: identity + sign out. This view otherwise has no
       surrounding chrome for a staff account (AppShell.vue renders it
       full-bleed), so this is the only sign-out affordance available. -->
  <div v-if="isKioskHeader" class="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
    <div class="flex items-center gap-2">
      <img src="/branding/niva-mark.svg" alt="" width="20" height="20" class="rounded-sm" />
      <span class="text-body-sm font-semibold text-neutral-900">NIVA</span>
    </div>
    <div class="flex items-center gap-2">
      <LanguageToggle />
      <button
        type="button"
        :disabled="signingOut"
        aria-label="Sign out"
        class="flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption font-medium text-neutral-500 hover:bg-neutral-100 disabled:opacity-60"
        @click="onSignOut"
      >
        <LogOut :size="15" />
        {{ signingOut ? $t('hk.today.signingOut') : $t('hk.today.signOut') }}
      </button>
    </div>
  </div>

  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <header class="mb-4">
      <h1 class="text-h1 font-semibold text-neutral-900">{{ mode === 'today' ? $t('hk.today.title') : $t('hk.today.schedule') }}</h1>
      <p class="text-body-sm text-neutral-500">
        {{ todayLabel }}
        <template v-if="mode === 'schedule'">
          · {{ onShiftHousekeepers.length ? $t('hk.today.onShift', { names: onShiftHousekeepers.map((m) => m.name).join(' & ') }) : $t('hk.today.noOneOnShift') }}
        </template>
      </p>
    </header>

    <div v-if="loading && !rooms.length" class="flex flex-col gap-2">
      <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-md bg-neutral-100" />
    </div>
    <div v-else-if="error" class="flex items-center justify-between gap-3 rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600">
      <span>{{ error.message }}</span>
      <button type="button" class="font-medium underline" @click="loadAll">{{ $t('hk.today.tryAgain') }}</button>
    </div>
    <section v-else-if="!visibleRooms.length" class="rounded-md bg-white p-6 text-center shadow-sm">
      <h2 class="mb-1 text-h3 font-semibold text-neutral-900">{{ mode === 'today' ? $t('hk.today.nothingDueTitle') : $t('hk.today.nothingAssignTitle') }}</h2>
      <p class="text-body-sm text-neutral-500">{{ mode === 'today' ? $t('hk.today.nothingDueBody') : $t('hk.today.nothingAssignBody') }}</p>
    </section>

    <template v-else>
      <!-- Single-glance rollup, same math as each room card below, just
           summed across the rooms shown here (07-domain-model-and-schema.md
           §8's housekeeping_completion_summary backs the Dashboard/Reports
           equivalent of this; this one's computed from what's already
           loaded, since it only needs today). -->
      <div class="mb-4 rounded-md bg-white p-3.5 shadow-sm">
        <div class="mb-1.5 flex items-baseline justify-between">
          <p class="text-caption font-semibold text-neutral-700">{{ mode === 'today' ? $t('hk.today.progressToday') : $t('hk.today.progressProperty') }}</p>
          <p class="text-body-sm font-bold" :class="daySummary.pct === 100 ? 'text-positive-600' : 'text-accent-600'">
            {{ $t('hk.today.roomsSummary', { done: daySummary.done, total: daySummary.total, pct: daySummary.pct }) }}
          </p>
        </div>
        <div class="h-1.5 overflow-hidden rounded-pill bg-neutral-100">
          <div class="h-full rounded-pill" :class="daySummary.pct === 100 ? 'bg-positive-600' : 'bg-accent-500'" :style="{ width: `${daySummary.pct}%` }" />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-for="room in visibleRooms"
          :key="room.roomId"
          class="cursor-pointer rounded-md bg-white p-3.5 shadow-sm hover:shadow-md"
          :class="{ 'opacity-65': roomProgress(room).complete && room.inspectedBy }"
          @click="openRoomSheet(room.roomId)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-body font-semibold text-neutral-900">{{ localizedName(room.roomName, room.roomNameSi) }}</p>
              <p class="truncate text-caption text-neutral-500">{{ room.roomType }}</p>
            </div>
            <span
              v-if="bookingBadge(room)"
              class="shrink-0 rounded-pill px-2 py-0.5 text-caption font-semibold"
              :class="BOOKING_BADGE_CLASS[bookingBadge(room)!.tone]"
            >
              {{ bookingBadge(room)!.label }}
            </span>
          </div>
          <div class="my-1.5 h-1.5 overflow-hidden rounded-pill bg-neutral-100">
            <div
              class="h-full rounded-pill"
              :class="roomProgress(room).complete ? 'bg-positive-600' : 'bg-accent-500'"
              :style="{ width: `${roomProgress(room).total ? Math.round((roomProgress(room).done / roomProgress(room).total) * 100) : 0}%` }"
            />
          </div>
          <p class="text-caption" :class="roomProgress(room).complete ? 'font-semibold text-positive-600' : 'text-neutral-500'">
            <template v-if="!roomProgress(room).complete">{{ $t('hk.today.tasksDone', { done: roomProgress(room).done, total: roomProgress(room).total }) }}</template>
            <template v-else-if="room.inspectedBy">{{ $t('hk.today.allDone') }}</template>
            <template v-else>{{ $t('hk.today.pendingInspection') }}</template>
          </p>
          <p v-if="lastUpdate(room)" class="mt-0.5 text-caption text-neutral-400">
            {{ $t('hk.today.lastUpdate', { name: memberName(lastUpdate(room)!.completedBy), time: dayjs(lastUpdate(room)!.completedAt).format('h:mm A') }) }}
          </p>

          <template v-if="mode === 'schedule'">
            <div class="mt-2 flex items-center justify-between" @click.stop>
              <span class="text-caption text-neutral-500">
                {{ dayAssignments[room.roomId] ? memberName(dayAssignments[room.roomId]!) : $t('hk.today.unassigned') }}
              </span>
              <button
                v-if="onShiftHousekeepers.length > 1"
                type="button"
                class="rounded-pill bg-neutral-100 px-2.5 py-1 text-caption font-medium text-neutral-700"
                @click="reassignOpenFor = reassignOpenFor === room.roomId ? null : room.roomId"
              >
                {{ $t('hk.today.reassign') }}
              </button>
            </div>
            <div v-if="reassignOpenFor === room.roomId" class="mt-2 flex flex-wrap gap-1.5" @click.stop>
              <button
                v-for="m in onShiftHousekeepers"
                :key="m.id"
                type="button"
                class="rounded-pill px-3 py-1.5 text-caption"
                :class="dayAssignments[room.roomId] === m.id ? 'bg-accent-100 font-semibold text-accent-700' : 'bg-neutral-50 font-medium text-neutral-500'"
                @click="onReassign(room.roomId, m.id)"
              >
                {{ m.name }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Room checklist sheet -->
    <BottomSheet :open="!!openRoom" :title="openRoom ? localizedName(openRoom.roomName, openRoom.roomNameSi) : ''" @close="openRoomId = null">
      <div v-if="openRoom" class="flex flex-col">
        <div v-for="task in openRoom.tasks" :key="task.taskId" class="flex items-start gap-3 border-b border-neutral-200 py-2.5 last:border-b-0" @click="onToggleTask(task)">
          <button
            type="button"
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2"
            :class="task.isDone ? 'border-positive-600 bg-positive-600' : 'border-neutral-300'"
          >
            <Check v-if="task.isDone" :size="13" class="text-white" />
          </button>
          <div class="min-w-0 flex-1 cursor-pointer">
            <p class="text-body-sm font-medium" :class="task.isDone ? 'text-neutral-400 line-through' : 'text-neutral-900'">{{ localizedName(task.name, task.nameSi) }}</p>
            <p v-if="task.isDone && task.completedBy" class="text-caption text-positive-600">{{ memberName(task.completedBy) }} · {{ dayjs(task.completedAt).format('h:mm A') }}</p>
          </div>
          <span class="shrink-0 self-start rounded-pill px-2 py-0.5 text-caption font-semibold" :class="CADENCE_TAG_CLASS[task.cadence]">{{ $t(`hk.today.cadence.${task.cadence}`) }}</span>
        </div>

        <template v-if="roomProgress(openRoom).complete">
          <button
            v-if="!openRoom.inspectedBy && canInspect"
            type="button"
            class="mt-3.5 w-full rounded-pill bg-accent-500 py-3 text-body-sm font-semibold text-white hover:bg-accent-600"
            @click="onMarkInspected(openRoom.roomId)"
          >
            {{ $t('hk.today.markInspected') }}
          </button>
          <div v-else-if="!openRoom.inspectedBy" class="mt-3.5 w-full rounded-pill bg-info-50 py-3 text-center text-body-sm font-semibold text-info-600">{{ $t('hk.today.pendingInspection') }}</div>
          <div v-else class="mt-3.5 w-full rounded-pill bg-positive-600/10 py-3 text-center text-body-sm font-semibold text-positive-600">
            {{ $t('hk.today.inspectedBy', { name: memberName(openRoom.inspectedBy) }) }}
          </div>
        </template>
      </div>
    </BottomSheet>

    <ConfirmDialog
      :open="!!pendingUntick"
      :title="$t('hk.today.undoTitle')"
      :description="pendingUntick ? $t('hk.today.undoDescription', { name: memberName(pendingUntick.completedBy), task: localizedName(pendingUntick.name, pendingUntick.nameSi) }) : ''"
      :confirm-label="$t('hk.today.undoConfirm')"
      danger
      @confirm="confirmUntick"
      @cancel="pendingUntick = null"
    />
  </div>
</template>
