<script setup lang="ts">
// Generic confirmation dialog. Per docs/09-wireframes.md "Delete
// transaction": names the exact thing being affected, states the
// consequence, and never default-focuses the destructive action —
// Cancel should be easier to hit by accident than the destructive button.
withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
    busy: false,
  },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4" @click.self="emit('cancel')">
      <div class="w-full max-w-sm rounded-md bg-white p-5 shadow-lg" role="alertdialog" aria-modal="true">
        <h2 class="mb-2 text-h3 font-semibold text-neutral-900">{{ title }}</h2>
        <p class="mb-5 text-body-sm text-neutral-600">{{ description }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            autofocus
            class="rounded-sm border border-neutral-200 px-4 py-2 text-body-sm font-medium text-neutral-700 hover:bg-neutral-100"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            :disabled="busy"
            class="rounded-sm px-4 py-2 text-body-sm font-semibold text-white disabled:opacity-60"
            :class="danger ? 'bg-negative-600 hover:bg-negative-700' : 'bg-accent-500 hover:bg-accent-600'"
            @click="emit('confirm')"
          >
            {{ busy ? 'Working…' : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
