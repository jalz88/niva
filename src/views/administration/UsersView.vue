<script setup lang="ts">
import { ref, watch } from 'vue'
import { Trash2, Pencil, Check, X } from 'lucide-vue-next'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import { useMembers } from '@/composables/useMembers'
import { useAuth } from '@/composables/useAuth'
import type { NivaError } from '@/lib/errors'
import type { Role } from '@/types/database'

const { workspaceId, user } = useAuth()
const members = useMembers()

const roles: Role[] = ['administrator', 'manager', 'staff', 'viewer']

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
  </div>
</template>
