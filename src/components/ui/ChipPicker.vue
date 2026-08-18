<script setup lang="ts">
// Minimalist chip picker — favorites row + a borderless "More" overflow
// list. Shared by Category and Payment method in TransactionForm, per
// docs/08-design-system.md §5.1 "Minimalist form language". No stroke
// anywhere — selection reads via fill color, elevation via shadow-sm/-md.
// The "More" chip deliberately carries no chevron/arrow (§5.1) — the label
// alone, or the picked value once one is chosen from overflow, is enough.
interface ChipOption {
  id: string
  name: string
}

const props = defineProps<{
  favorites: ChipOption[]
  moreOptions: ChipOption[]
  selectedId: string
  // Name of the currently selected item when it's NOT one of the favorites
  // (i.e. it came from "More"). Drives the More chip's label + active
  // state. Pass null/'' when the selection is a favorite or nothing.
  moreSelectedLabel?: string | null
  open: boolean
  // Groups the chip row for assistive tech (and Playwright's getByRole
  // group scoping) — the visible field-label sits just above this
  // component in the form, so this mirrors that text rather than
  // duplicating a visible label. Named groupLabel rather than ariaLabel —
  // Vue's template compiler treats `aria-*`/`data-*` attributes as
  // always-fallthrough, so they never resolve to a matching camelCase prop.
  groupLabel: string
}>()

const emit = defineEmits<{
  'select-favorite': [id: string]
  'select-more': [id: string]
  'toggle-more': []
}>()
</script>

<template>
  <div class="relative" role="group" :aria-label="props.groupLabel">
    <div class="flex flex-wrap gap-2">
      <button
        v-for="f in props.favorites"
        :key="f.id"
        type="button"
        :aria-pressed="props.selectedId === f.id"
        class="rounded-pill bg-white px-4 py-2.5 text-body-sm font-medium text-neutral-700 shadow-sm"
        :class="props.selectedId === f.id ? 'bg-accent-50 text-accent-700 shadow-none' : ''"
        @click="emit('select-favorite', f.id)"
      >
        {{ f.name }}
      </button>
      <button
        v-if="props.moreOptions.length || props.moreSelectedLabel"
        type="button"
        :aria-pressed="!!props.moreSelectedLabel"
        class="rounded-pill bg-white px-4 py-2.5 text-body-sm font-medium text-neutral-700 shadow-sm"
        :class="props.moreSelectedLabel ? 'bg-accent-50 text-accent-700 shadow-none' : ''"
        @click="emit('toggle-more')"
      >
        {{ props.moreSelectedLabel || 'More' }}
      </button>
    </div>

    <div v-if="props.open && props.moreOptions.length" class="mt-2 overflow-hidden rounded-md bg-white shadow-md">
      <button
        v-for="o in props.moreOptions"
        :key="o.id"
        type="button"
        class="block w-full px-4 py-3 text-left text-body text-neutral-900 hover:bg-neutral-50"
        @click="emit('select-more', o.id)"
      >
        {{ o.name }}
      </button>
    </div>
  </div>
</template>
