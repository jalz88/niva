<script setup lang="ts">
import { ref } from 'vue'
import { Pencil, Check, X, Archive, RotateCcw } from 'lucide-vue-next'
import type { NivaError } from '@/lib/errors'

interface Item {
  id: string
  name: string
  is_active: boolean
}

const props = defineProps<{
  // Optional section-level heading (h2, no back link) — used when more
  // than one ConfigItemList appears on the same page, e.g. Categories'
  // "Income categories" / "Expense categories" split. The page-level
  // title and back link live in AdminBackHeader instead.
  sectionTitle?: string
  sectionDescription?: string
  // The add button always displays "Add" — the section heading and input
  // already say what's being added, so repeating it in the button read as
  // redundant. This stays as the accessible name (aria-label) so screen
  // reader users still get the full context.
  addLabel: string
  namePlaceholder: string
  items: Item[]
  loading: boolean
  error: NivaError | null
  create: (name: string) => Promise<NivaError | null>
  rename: (id: string, name: string) => Promise<NivaError | null>
  setActive: (id: string, active: boolean) => Promise<NivaError | null>
}>()

const newName = ref('')
const creating = ref(false)
const createError = ref<NivaError | null>(null)

const editingId = ref<string | null>(null)
const editingName = ref('')
const savingId = ref<string | null>(null)
const rowError = ref<NivaError | null>(null)

async function onCreate() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  createError.value = null
  const result = await props.create(name)
  creating.value = false
  if (result) {
    createError.value = result
    return
  }
  newName.value = ''
}

function startEdit(item: Item) {
  editingId.value = item.id
  editingName.value = item.name
  rowError.value = null
}

function cancelEdit() {
  editingId.value = null
  rowError.value = null
}

async function confirmEdit(id: string) {
  const name = editingName.value.trim()
  if (!name) return
  savingId.value = id
  rowError.value = null
  const result = await props.rename(id, name)
  savingId.value = null
  if (result) {
    rowError.value = result
    return
  }
  editingId.value = null
}

async function toggleActive(item: Item) {
  savingId.value = item.id
  rowError.value = null
  const result = await props.setActive(item.id, !item.is_active)
  savingId.value = null
  if (result) rowError.value = result
}
</script>

<template>
  <div>
    <template v-if="sectionTitle">
      <h2 class="text-h3 font-semibold text-neutral-900">{{ sectionTitle }}</h2>
      <p v-if="sectionDescription" class="mb-3 text-body-sm text-neutral-500">{{ sectionDescription }}</p>
    </template>

    <!-- Add form -->
    <form class="mb-6 flex gap-2" @submit.prevent="onCreate">
      <input
        v-model="newName"
        type="text"
        :placeholder="namePlaceholder"
        class="flex-1 rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      />
      <button
        type="submit"
        :disabled="creating || !newName.trim()"
        :aria-label="creating ? undefined : addLabel"
        class="rounded-sm bg-accent-500 px-4 text-body font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        {{ creating ? 'Adding…' : 'Add' }}
      </button>
    </form>
    <p v-if="createError" class="-mt-4 mb-4 text-body-sm text-negative-600" role="alert">
      {{ createError.message }}
    </p>

    <!-- Loading (only shown on a true first load — see the composables' cache, which skips this on repeat visits) -->
    <div v-if="loading" class="space-y-2">
      <div v-for="n in 3" :key="n" class="h-12 rounded-md bg-neutral-200" />
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-md border border-negative-600/30 bg-negative-600/5 p-4 text-body-sm text-negative-600"
      role="alert"
    >
      {{ error.message }}
    </div>

    <!-- Empty -->
    <div
      v-else-if="items.length === 0"
      class="rounded-md border border-neutral-200 bg-white p-6 text-center shadow-sm"
    >
      <p class="text-body-sm text-neutral-500">Nothing here yet. Add your first one above.</p>
    </div>

    <!-- List -->
    <ul v-else class="mb-6 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white shadow-sm">
      <li v-for="item in items" :key="item.id" class="flex items-center gap-2 px-4 py-3">
        <template v-if="editingId === item.id">
          <input
            v-model="editingName"
            type="text"
            class="flex-1 rounded-sm border border-accent-500 p-1.5 text-body focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            @keyup.enter="confirmEdit(item.id)"
            @keyup.escape="cancelEdit"
          />
          <button
            type="button"
            aria-label="Save"
            :disabled="savingId === item.id"
            class="rounded-sm p-1.5 text-positive-600 hover:bg-neutral-100"
            @click="confirmEdit(item.id)"
          >
            <Check :size="18" />
          </button>
          <button type="button" aria-label="Cancel" class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100" @click="cancelEdit">
            <X :size="18" />
          </button>
        </template>
        <template v-else>
          <span class="flex-1 text-body" :class="{ 'text-neutral-400': !item.is_active }">{{ item.name }}</span>
          <span
            v-if="!item.is_active"
            class="rounded-pill bg-neutral-200 px-2 py-0.5 text-caption text-neutral-500"
          >
            Archived
          </span>
          <button
            type="button"
            aria-label="Rename"
            class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100"
            @click="startEdit(item)"
          >
            <Pencil :size="16" />
          </button>
          <button
            type="button"
            :aria-label="item.is_active ? 'Archive' : 'Restore'"
            :disabled="savingId === item.id"
            class="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100"
            @click="toggleActive(item)"
          >
            <Archive v-if="item.is_active" :size="16" />
            <RotateCcw v-else :size="16" />
          </button>
        </template>
      </li>
    </ul>
    <p v-if="rowError" class="mt-2 text-body-sm text-negative-600" role="alert">{{ rowError.message }}</p>
  </div>
</template>
