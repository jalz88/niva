<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import dayjs, { type Dayjs } from 'dayjs'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useWorkforce, type WorkforceMemberPayload } from '@/composables/useWorkforce'
import { useMembers } from '@/composables/useMembers'
import { useRecurringPayments } from '@/composables/useRecurringPayments'
import { useRoomBookings } from '@/composables/useRoomBookings'
import { useToastStore } from '@/stores/toastStore'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { NivaError } from '@/lib/errors'
import type { WorkforceMember, CrewRole } from '@/types/database'

const { t, tm } = useI18n()
const { workspaceId } = useAuth()
const {
  members,
  loading,
  error,
  revision: wfRevision,
  list: listMembers,
  create: createMember,
  update: updateMember,
  setActive,
  loadDaysOff,
  isOff,
  toggleDayOff,
} = useWorkforce()
const { members: accounts, list: listAccounts } = useMembers()
const { items: recurringPayments, list: listRecurringPayments } = useRecurringPayments()
const { isBooked, load: loadRoomBookings } = useRoomBookings()
const toast = useToastStore()

watch(
  workspaceId,
  (id) => {
    if (!id) return
    listMembers(id)
    listAccounts(id)
    listRecurringPayments(id)
  },
  { immediate: true },
)
watch(wfRevision, () => {
  if (workspaceId.value) listMembers(workspaceId.value)
})

const ROLE_LABELS = computed<Record<CrewRole, string>>(() => ({
  housekeeper: t('hk.staff.role.housekeeper'),
  gardener: t('hk.staff.role.gardener'),
  maintenance: t('hk.staff.role.maintenance'),
  other: t('hk.staff.role.other'),
}))

const activeTab = ref<'calendar' | 'roster'>('calendar')

// ---- Roster --------------------------------------------------------------

const showForm = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formRole = ref<CrewRole>('housekeeper')
const formActive = ref(true)
const formMembershipId = ref<string | null>(null)
const formRecurringPaymentId = ref<string | null>(null)
const submitting = ref(false)
const submitError = ref<NivaError | null>(null)

// A membership can back at most one active roster entry — offer accounts
// that aren't already linked, plus whichever one this entry is currently
// linked to (so editing doesn't drop the existing link off the list).
const availableAccounts = computed(() => {
  const linked = new Set(members.value.filter((m) => m.membership_id && m.id !== editingId.value).map((m) => m.membership_id))
  return accounts.value.filter((a) => !linked.has(a.membershipId))
})

function openAddMember() {
  editingId.value = null
  formName.value = ''
  formRole.value = 'housekeeper'
  formActive.value = true
  formMembershipId.value = null
  formRecurringPaymentId.value = null
  submitError.value = null
  showForm.value = true
}
function openEditMember(m: WorkforceMember) {
  editingId.value = m.id
  formName.value = m.name
  formRole.value = m.crew_role
  formActive.value = m.is_active
  formMembershipId.value = m.membership_id
  formRecurringPaymentId.value = m.recurring_payment_id
  submitError.value = null
  showForm.value = true
}

async function submitForm() {
  if (!workspaceId.value) return
  if (!formName.value.trim()) {
    submitError.value = { code: 'validation_error', message: t('hk.staff.validationName'), retryable: false }
    return
  }

  const payload: WorkforceMemberPayload = {
    name: formName.value.trim(),
    crewRole: formRole.value,
    isActive: formActive.value,
    membershipId: formMembershipId.value,
    recurringPaymentId: formRecurringPaymentId.value,
  }

  submitting.value = true
  submitError.value = null
  const err = editingId.value ? await updateMember(editingId.value, workspaceId.value, payload) : await createMember(workspaceId.value, payload)
  submitting.value = false

  if (err) {
    submitError.value = err
    return
  }
  toast.show(editingId.value ? t('hk.staff.toastUpdated') : t('hk.staff.toastAdded', { name: payload.name }))
  showForm.value = false
}

const pendingDeactivate = ref<WorkforceMember | null>(null)
function requestDeactivate() {
  if (!editingId.value) return
  pendingDeactivate.value = members.value.find((m) => m.id === editingId.value) ?? null
  showForm.value = false
}
async function confirmDeactivate() {
  if (!pendingDeactivate.value || !workspaceId.value) return
  const err = await setActive(pendingDeactivate.value.id, workspaceId.value, false)
  if (err) toast.show(err.message, { tone: 'error' })
  else toast.show(t('hk.staff.toastRemoved'))
  pendingDeactivate.value = null
}

// ---- Work calendar ---------------------------------------------------------

const calendarMonth = ref<Dayjs>(dayjs().startOf('month'))
const selectedMemberId = ref<string | null>(null)

watch(
  members,
  (list) => {
    if (selectedMemberId.value && list.some((m) => m.id === selectedMemberId.value)) return
    selectedMemberId.value = list.find((m) => m.is_active)?.id ?? null
  },
  { immediate: true },
)

async function loadCalendarRange() {
  if (!workspaceId.value) return
  const start = calendarMonth.value.startOf('month').format('YYYY-MM-DD')
  const end = calendarMonth.value.endOf('month').format('YYYY-MM-DD')
  await Promise.all([loadDaysOff(workspaceId.value, start, end), loadRoomBookings(workspaceId.value, start, end)])
}
watch(calendarMonth, loadCalendarRange)
watch(workspaceId, loadCalendarRange, { immediate: true })

function prevMonth() {
  calendarMonth.value = calendarMonth.value.subtract(1, 'month')
}
function nextMonth() {
  calendarMonth.value = calendarMonth.value.add(1, 'month')
}

const activeMembers = computed(() => members.value.filter((m) => m.is_active))
const todayIso = dayjs().format('YYYY-MM-DD')

const calendarCells = computed(() => {
  const start = calendarMonth.value.startOf('month')
  const lead = start.day()
  const total = calendarMonth.value.daysInMonth()
  const cells: Array<{ iso: string; day: number } | null> = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push({ iso: start.date(d).format('YYYY-MM-DD'), day: d })
  return cells
})

const offCountThisMonth = computed(() => {
  if (!selectedMemberId.value) return 0
  return calendarCells.value.filter((c) => c && isOff(selectedMemberId.value!, c.iso)).length
})

async function onToggleDay(iso: string) {
  if (!workspaceId.value || !selectedMemberId.value) return
  const wasOff = isOff(selectedMemberId.value, iso)
  const err = await toggleDayOff(workspaceId.value, selectedMemberId.value, iso)
  if (err) toast.show(err.message, { tone: 'error' })
  else toast.show(wasOff ? t('hk.staff.toastMarkedWorking') : t('hk.staff.toastMarkedOff'))
}

const weekdayInitials = computed<string[]>(() => tm('hk.staff.weekdayInitials') as unknown as string[])
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <RouterLink :to="{ name: 'housekeeping' }" class="mb-2 inline-flex items-center gap-1 text-body-sm font-medium text-neutral-500 hover:text-accent-600">
          <ChevronLeft :size="16" />
          {{ $t('hk.staff.backToHub') }}
        </RouterLink>
        <h1 class="text-h1 font-semibold text-neutral-900">{{ $t('hk.staff.title') }}</h1>
        <p class="text-body-sm text-neutral-500">{{ $t('hk.staff.subtitle') }}</p>
      </div>
      <button v-if="activeTab === 'roster'" type="button" class="flex items-center gap-1.5 rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm" @click="openAddMember">
        <Plus :size="16" />
        {{ $t('hk.staff.listAdd') }}
      </button>
    </div>

    <div class="mb-4 flex gap-1 rounded-pill bg-neutral-100 p-1">
      <button
        type="button"
        class="flex-1 rounded-pill py-2 text-body-sm font-semibold"
        :class="activeTab === 'calendar' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'"
        @click="activeTab = 'calendar'"
      >
        {{ $t('hk.staff.tabCalendar') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-pill py-2 text-body-sm font-semibold"
        :class="activeTab === 'roster' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'"
        @click="activeTab = 'roster'"
      >
        {{ $t('hk.staff.tabRoster') }}
      </button>
    </div>

    <!-- Work calendar -->
    <section v-if="activeTab === 'calendar'">
      <div v-if="!activeMembers.length" class="rounded-md bg-white p-6 text-center shadow-sm">
        <p class="text-body-sm text-neutral-500">{{ $t('hk.staff.calendarEmpty') }}</p>
      </div>
      <template v-else>
        <div class="mb-3.5 flex flex-wrap gap-2">
          <button
            v-for="m in activeMembers"
            :key="m.id"
            type="button"
            class="rounded-pill px-3.5 py-2 text-body-sm"
            :class="selectedMemberId === m.id ? 'bg-accent-100 font-semibold text-accent-700' : 'bg-white font-medium text-neutral-700 shadow-sm'"
            @click="selectedMemberId = m.id"
          >
            {{ m.name }}
          </button>
        </div>

        <div class="rounded-md bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <button type="button" class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100" @click="prevMonth">
              <ChevronLeft :size="18" />
            </button>
            <p class="text-body font-semibold text-neutral-900">{{ calendarMonth.format('MMMM YYYY') }}</p>
            <button type="button" class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100" @click="nextMonth">
              <ChevronRight :size="18" />
            </button>
          </div>
          <div class="mb-1 grid grid-cols-7 text-center text-caption font-semibold text-neutral-400">
            <span v-for="(d, i) in weekdayInitials" :key="i">{{ d }}</span>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <template v-for="(cell, idx) in calendarCells" :key="idx">
              <div v-if="!cell" />
              <button
                v-else
                type="button"
                class="relative aspect-square rounded-sm text-body-sm font-medium"
                :class="[
                  cell.iso === todayIso ? 'ring-2 ring-accent-500' : '',
                  selectedMemberId && isOff(selectedMemberId, cell.iso) ? 'bg-negative-600/10 text-negative-600' : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100',
                ]"
                @click="onToggleDay(cell.iso)"
              >
                {{ cell.day }}
                <span v-if="isBooked(cell.iso)" class="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent-500" :aria-label="$t('hk.staff.bookedDot')" />
              </button>
            </template>
          </div>
          <p class="mt-3 text-caption text-neutral-500">
            {{
              $t('hk.staff.offCountLabel', {
                count: offCountThisMonth,
                dayNoun: offCountThisMonth === 1 ? $t('hk.staff.dayNounOne') : $t('hk.staff.dayNounMany'),
                month: calendarMonth.format('MMMM'),
              })
            }}
          </p>
        </div>
        <p class="mt-3 text-caption text-neutral-400">
          {{ $t('hk.staff.tapHint') }}
          <span class="inline-flex items-center gap-1"><span class="inline-block h-1.5 w-1.5 rounded-full bg-accent-500" /> {{ $t('hk.staff.bookedLegend') }}</span>
          {{ $t('hk.staff.yearlyLeaveNote') }}
        </p>
      </template>
    </section>

    <!-- Roster -->
    <section v-else>
      <div v-if="loading && !members.length" class="flex flex-col gap-2">
        <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-md bg-neutral-100" />
      </div>
      <div v-else-if="error" class="flex items-center justify-between gap-3 rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600">
        <span>{{ error.message }}</span>
        <button type="button" class="font-medium underline" @click="workspaceId && listMembers(workspaceId)">{{ $t('hk.staff.tryAgain') }}</button>
      </div>
      <section v-else-if="!members.length" class="rounded-md bg-white p-6 text-center shadow-sm">
        <h2 class="mb-1 text-h3 font-semibold text-neutral-900">{{ $t('hk.staff.rosterEmptyTitle') }}</h2>
        <p class="mb-4 text-body-sm text-neutral-500">{{ $t('hk.staff.rosterEmptyBody') }}</p>
        <button type="button" class="rounded-sm bg-accent-500 px-4 py-2 text-body-sm font-medium text-white hover:bg-accent-600" @click="openAddMember">{{ $t('hk.staff.rosterEmptyCta') }}</button>
      </section>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="m in members"
          :key="m.id"
          class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-white p-3.5 shadow-sm hover:shadow-md"
          :class="{ 'opacity-50': !m.is_active }"
          @click="openEditMember(m)"
        >
          <div class="min-w-0">
            <p class="truncate text-body font-semibold text-neutral-900">{{ m.name }}</p>
            <p class="truncate text-caption text-neutral-500">
              {{ ROLE_LABELS[m.crew_role] }}
              <span :class="m.membership_id ? 'text-positive-600' : 'text-neutral-400'"> · {{ m.membership_id ? $t('hk.staff.appAccessYes') : $t('hk.staff.appAccessNo') }}</span>
              <span v-if="!m.is_active"> · {{ $t('hk.staff.inactiveSuffix') }}</span>
            </p>
          </div>
          <ChevronRight :size="18" class="shrink-0 text-neutral-400" />
        </div>
      </div>
    </section>

    <!-- Add/Edit person sheet -->
    <BottomSheet :open="showForm" :title="editingId ? $t('hk.staff.sheetEditPerson') : $t('hk.staff.sheetAddPerson')" @close="showForm = false">
      <form class="flex flex-col" @submit.prevent="submitForm">
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">{{ $t('hk.staff.fieldName') }}</p>
          <input v-model="formName" type="text" :placeholder="$t('hk.staff.namePlaceholder')" class="w-full rounded-md bg-white px-3.5 py-3 text-body text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400" />
        </div>
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">{{ $t('hk.staff.fieldRole') }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(label, value) in ROLE_LABELS"
              :key="value"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="formRole === value ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formRole = value as CrewRole"
            >
              {{ label }}
            </button>
          </div>
        </div>
        <div class="mb-4 flex items-center justify-between rounded-md bg-white p-3.5 shadow-sm">
          <div>
            <p class="text-body-sm font-medium text-neutral-900">{{ $t('hk.staff.activeTitle') }}</p>
            <p class="text-caption text-neutral-500">{{ $t('hk.staff.activeSub') }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="formActive"
            class="h-6 w-10 shrink-0 rounded-pill transition-colors"
            :class="formActive ? 'bg-accent-500' : 'bg-neutral-300'"
            @click="formActive = !formActive"
          >
            <span class="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform" :class="{ 'translate-x-[18px]': formActive }" />
          </button>
        </div>

        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">{{ $t('hk.staff.linkedAccountLabel') }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="!formMembershipId ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formMembershipId = null"
            >
              {{ $t('hk.staff.none') }}
            </button>
            <button
              v-for="a in availableAccounts"
              :key="a.membershipId"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="formMembershipId === a.membershipId ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formMembershipId = a.membershipId"
            >
              {{ a.displayName || a.email || $t('hk.staff.unnamed') }}
            </button>
          </div>
          <p class="mt-2 text-caption text-neutral-400">{{ $t('hk.staff.linkedAccountHint') }}</p>
        </div>

        <div class="mb-1">
          <p class="mb-2 text-body-sm text-neutral-500">{{ $t('hk.staff.paidVia') }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="!formRecurringPaymentId ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formRecurringPaymentId = null"
            >
              {{ $t('hk.staff.none') }}
            </button>
            <button
              v-for="p in recurringPayments"
              :key="p.id"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="formRecurringPaymentId === p.id ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formRecurringPaymentId = p.id"
            >
              {{ p.name }}
            </button>
          </div>
          <p class="mt-2 text-caption text-neutral-400">{{ $t('hk.staff.paidViaHint') }}</p>
        </div>

        <p v-if="submitError" class="mt-3 text-caption text-negative-600">{{ submitError.message }}</p>

        <button type="submit" :disabled="submitting" class="mt-4 rounded-lg bg-accent-500 py-3.5 text-body font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
          {{ submitting ? $t('hk.staff.saving') : $t('hk.staff.save') }}
        </button>
        <button
          v-if="editingId"
          type="button"
          class="mt-2.5 rounded-lg border border-negative-600/30 py-3 text-body-sm font-semibold text-negative-600 hover:bg-negative-600/5"
          @click="requestDeactivate"
        >
          {{ $t('hk.staff.removeFromStaff') }}
        </button>
      </form>
    </BottomSheet>

    <ConfirmDialog
      :open="!!pendingDeactivate"
      :title="$t('hk.staff.confirmRemoveTitle')"
      :description="pendingDeactivate ? $t('hk.staff.confirmRemoveDesc', { name: pendingDeactivate.name }) : ''"
      :confirm-label="$t('hk.staff.confirmRemove')"
      danger
      @confirm="confirmDeactivate"
      @cancel="pendingDeactivate = null"
    />
  </div>
</template>
