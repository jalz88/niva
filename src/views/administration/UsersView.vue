<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Trash2, Pencil, Check, X } from 'lucide-vue-next'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { useMembers, type MemberRow } from '@/composables/useMembers'
import { useAuth } from '@/composables/useAuth'
import { useToastStore } from '@/stores/toastStore'
import type { NivaError } from '@/lib/errors'
import type { Role } from '@/types/database'

const { workspaceId, user } = useAuth()
const members = useMembers()
const toast = useToastStore()

const roles: Role[] = ['administrator', 'manager', 'staff', 'viewer']

// Screen access — per docs/07-domain-model-and-schema.md §10: `null` means
// "sees everything their role permits" (default), an array narrows what
// their own nav shows. Role stays the real boundary via RLS; this only
// ever narrows, never widens, what the role already allows. Mirrors
// docs/housekeeping-in-app-prototype.html's SCREEN_GROUPS. Dashboard and
// Account aren't listed — both are always reachable regardless of role.
// "Work calendar" and "Roster & wages" are tabs of one Staff screen
// (StaffView.vue), not separate routes, but each stays independently
// toggleable — untick one and StaffView hides just that tab.
interface ScreenItem {
  id: string
  label: string
  roles: Role[]
}
interface ScreenGroup {
  label: string
  roles: Role[]
  items: ScreenItem[]
}
// 'staff' isn't listed on any item — a staff-role account is the
// caretaker/housekeeper case (decided 2026-08-24): AppShell.vue gives it no
// nav chrome at all and routes it straight to its own Today view,
// regardless of what's toggled here. Screen access is only ever adjustable
// for administrator/manager. Someone who needs bookkeeping access should be
// 'manager', not 'staff'.
const SCREEN_GROUPS: ScreenGroup[] = [
  {
    label: 'Money',
    roles: ['administrator', 'manager'],
    items: [
      { id: 'transactions', label: 'Transactions', roles: ['administrator', 'manager'] },
      { id: 'reports', label: 'Reports', roles: ['administrator', 'manager'] },
      { id: 'recurring-payments', label: 'Recurring payments', roles: ['administrator', 'manager'] },
    ],
  },
  {
    label: 'Housekeeping',
    roles: ['administrator', 'manager'],
    items: [
      { id: 'housekeeping-schedule', label: "Today's schedule", roles: ['administrator', 'manager'] },
      { id: 'housekeeping-calendar', label: 'Work calendar', roles: ['administrator', 'manager'] },
      { id: 'housekeeping-rooms', label: 'Rooms', roles: ['administrator', 'manager'] },
      { id: 'housekeeping-roster', label: 'Roster & wages', roles: ['administrator', 'manager'] },
    ],
  },
  {
    label: 'Account',
    roles: ['administrator'],
    items: [{ id: 'administration', label: 'Administration', roles: ['administrator'] }],
  },
]

function groupsForRole(role: Role): ScreenGroup[] {
  return SCREEN_GROUPS.filter((g) => g.roles.includes(role))
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length)
}

function accessSummary(m: MemberRow): string {
  if (m.userId === user.value?.id) return 'You'
  if (!m.visibleAreas) return 'Full access'
  return `${m.visibleAreas.length} screen${m.visibleAreas.length === 1 ? '' : 's'}`
}

const accessSheetOpen = ref(false)
const accessMemberId = ref<string | null>(null)
const accessSelections = ref<Record<string, boolean>>({})
const accessSaving = ref(false)
const accessError = ref<NivaError | null>(null)

const accessMember = computed(() => members.members.value.find((m) => m.membershipId === accessMemberId.value) ?? null)
const accessGroups = computed(() => (accessMember.value ? groupsForRole(accessMember.value.role) : []))

function openAccessSheet(m: MemberRow) {
  accessMemberId.value = m.membershipId
  accessError.value = null
  const sel: Record<string, boolean> = {}
  for (const group of groupsForRole(m.role)) {
    for (const item of group.items) sel[item.id] = !m.visibleAreas || m.visibleAreas.includes(item.id)
  }
  accessSelections.value = sel
  accessSheetOpen.value = true
}

async function saveAccess() {
  if (!accessMember.value || !workspaceId.value) return
  const eligible = accessGroups.value.flatMap((g) => g.items.map((i) => i.id))
  const onIds = eligible.filter((id) => accessSelections.value[id])
  // Only store an explicit array when it's a real restriction — leaving
  // every eligible item on means "unrestricted", stored as null, same
  // null-means-everything convention as the rest of this column.
  const areas = onIds.length === eligible.length ? null : onIds

  accessSaving.value = true
  accessError.value = null
  const err = await members.updateVisibleAreas(accessMember.value.membershipId, workspaceId.value, areas)
  accessSaving.value = false
  if (err) {
    accessError.value = err
    return
  }
  toast.show(`Screen access updated for ${accessMember.value.displayName || accessMember.value.email || 'this person'}.`)
  accessSheetOpen.value = false
}

const savingId = ref<string | null>(null)
const rowError = ref<NivaError | null>(null)

const newUserId = ref('')
const newRole = ref<Role>('staff')
const adding = ref(false)
const addError = ref<NivaError | null>(null)

const editingUserId = ref<string | null>(null)
const editingName = ref('')

watch(
  workspaceId,
  (id) => {
    if (id) members.list(id)
  },
  { immediate: true },
)

async function onRoleChange(membershipId: string, role: Role) {
  savingId.value = membershipId
  rowError.value = null
  const result = await members.updateRole(membershipId, role)
  savingId.value = null
  if (result) rowError.value = result
}

async function onRemove(membershipId: string) {
  if (!workspaceId.value) return
  savingId.value = membershipId
  rowError.value = null
  const result = await members.remove(workspaceId.value, membershipId)
  savingId.value = null
  if (result) rowError.value = result
}

function startEditName(userId: string, currentName: string | null) {
  editingUserId.value = userId
  editingName.value = currentName ?? ''
  rowError.value = null
}

function cancelEditName() {
  editingUserId.value = null
}

async function confirmEditName(userId: string) {
  if (!workspaceId.value) return
  savingId.value = userId
  rowError.value = null
  const result = await members.updateDisplayName(workspaceId.value, userId, editingName.value)
  savingId.value = null
  if (result) {
    rowError.value = result
    return
  }
  editingUserId.value = null
}

async function onAdd() {
  const id = newUserId.value.trim()
  if (!id || !workspaceId.value) return
  adding.value = true
  addError.value = null
  const result = await members.addByUserId(workspaceId.value, id, newRole.value)
  adding.value = false
  if (result) {
    addError.value = result
    return
  }
  newUserId.value = ''
  newRole.value = 'staff'
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader title="Users" description="Who can access this workspace, and what they're allowed to do." />

    <div class="mb-6 rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 class="mb-1 text-h3 font-semibold text-neutral-900">Add a member</h2>
      <p class="mb-3 text-body-sm text-neutral-500">
        The person needs a Supabase Auth account first (Supabase dashboard → Authentication → Users → Add user).
        Copy their User UID from that list and paste it below.
      </p>
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="onAdd">
        <input
          v-model="newUserId"
          type="text"
          placeholder="User UID"
          class="flex-1 rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
        <select
          v-model="newRole"
          class="rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        >
          <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
        </select>
        <button
          type="submit"
          :disabled="adding || !newUserId.trim()"
          :aria-label="adding ? undefined : 'Add member'"
          class="rounded-sm bg-accent-500 px-4 text-body font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
        >
          {{ adding ? 'Adding…' : 'Add' }}
        </button>
      </form>
      <p v-if="addError" class="mt-2 text-body-sm text-negative-600" role="alert">{{ addError.message }}</p>
    </div>

    <div v-if="members.loading.value" class="space-y-2">
      <div v-for="n in 2" :key="n" class="h-12 rounded-md bg-neutral-200" />
    </div>

    <div
      v-else-if="members.error.value"
      class="rounded-md border border-negative-600/30 bg-negative-600/5 p-4 text-body-sm text-negative-600"
      role="alert"
    >
      {{ members.error.value.message }}
    </div>

    <ul v-else class="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white shadow-sm">
      <li v-for="member in members.members.value" :key="member.membershipId" class="flex items-center gap-3 px-4 py-3">
        <div v-if="editingUserId === member.userId" class="flex flex-1 items-center gap-2">
          <input
            v-model="editingName"
            type="text"
            placeholder="Name"
            class="flex-1 rounded-sm border border-accent-500 p-1.5 text-body focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            @keyup.enter="confirmEditName(member.userId)"
            @keyup.escape="cancelEditName"
          />
          <button
            type="button"
            aria-label="Save name"
            :disabled="savingId === member.userId"
            class="rounded-sm p-1.5 text-positive-600 hover:bg-neutral-100"
            @click="confirmEditName(member.userId)"
          >
            <Check :size="18" />
          </button>
          <button type="button" aria-label="Cancel" class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100" @click="cancelEditName">
            <X :size="18" />
          </button>
        </div>
        <div v-else class="flex flex-1 items-center gap-1.5">
          <div>
            <div class="text-body text-neutral-900">{{ member.displayName ?? member.email ?? member.userId }}</div>
            <div v-if="member.userId === user?.id" class="text-caption text-neutral-500">You</div>
          </div>
          <button
            type="button"
            aria-label="Edit name"
            class="rounded-sm p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            @click="startEditName(member.userId, member.displayName)"
          >
            <Pencil :size="14" />
          </button>
        </div>

        <select
          :value="member.role"
          :disabled="member.userId === user?.id || savingId === member.membershipId"
          class="rounded-sm border border-neutral-200 bg-white p-1.5 text-body-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:bg-neutral-100 disabled:text-neutral-400"
          @change="onRoleChange(member.membershipId, ($event.target as HTMLSelectElement).value as Role)"
        >
          <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
        </select>

        <button
          v-if="member.userId !== user?.id"
          type="button"
          class="shrink-0 rounded-pill bg-neutral-100 px-3 py-1.5 text-caption font-medium text-neutral-600 hover:bg-neutral-200"
          @click="openAccessSheet(member)"
        >
          {{ accessSummary(member) }}
        </button>

        <button
          type="button"
          aria-label="Remove member"
          :disabled="member.userId === user?.id || savingId === member.membershipId"
          class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
          @click="onRemove(member.membershipId)"
        >
          <Trash2 :size="16" />
        </button>
      </li>
    </ul>
    <p v-if="rowError" class="mt-2 text-body-sm text-negative-600" role="alert">{{ rowError.message }}</p>

    <!-- Screen access sheet -->
    <BottomSheet :open="accessSheetOpen" :title="accessMember?.displayName || accessMember?.email || 'Screen access'" @close="accessSheetOpen = false">
      <div v-if="accessMember">
        <p class="mb-4 text-body-sm text-neutral-500">
          {{ accessMember.role.charAt(0).toUpperCase() + accessMember.role.slice(1) }} — untick anything they don't need day to day.
        </p>

        <div v-if="!accessGroups.length" class="rounded-md bg-neutral-50 p-4 text-body-sm text-neutral-500">No adjustable screens for this role.</div>

        <div v-for="group in accessGroups" :key="group.label" class="mb-4">
          <p class="mb-1.5 text-caption font-semibold tracking-wide text-neutral-400 uppercase">{{ group.label }}</p>
          <div class="rounded-md bg-white shadow-sm">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="flex items-center justify-between border-b border-neutral-100 px-3.5 py-3 last:border-b-0"
            >
              <p class="text-body-sm text-neutral-900">{{ item.label }}</p>
              <button
                type="button"
                role="switch"
                :aria-checked="accessSelections[item.id]"
                class="h-6 w-10 shrink-0 rounded-pill transition-colors"
                :class="accessSelections[item.id] ? 'bg-accent-500' : 'bg-neutral-300'"
                @click="accessSelections[item.id] = !accessSelections[item.id]"
              >
                <span class="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform" :class="{ 'translate-x-[18px]': accessSelections[item.id] }" />
              </button>
            </div>
          </div>
        </div>

        <p v-if="accessError" class="mb-3 text-caption text-negative-600">{{ accessError.message }}</p>

        <button
          v-if="accessGroups.length"
          type="button"
          :disabled="accessSaving"
          class="w-full rounded-lg bg-accent-500 py-3.5 text-body font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
          @click="saveAccess"
        >
          {{ accessSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
