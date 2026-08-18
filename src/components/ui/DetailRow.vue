<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

// Minimalist optional-field row — docs/08-design-system.md §5.1.
// "Optional fields collapse to one line ... only expand into their real
// control when tapped." Collapsed state keeps a small chevron since the
// tap affordance is otherwise ambiguous on a plain row (unlike the
// chevron-free chip "More" trigger — that one already reads as a control).
defineProps<{
  label: string
  open: boolean
  valueText?: string
  placeholder: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <div class="border-b border-neutral-200 py-3.5 last:border-b-0">
    <button v-if="!open" type="button" class="flex w-full items-center justify-between gap-3 text-left" @click="emit('toggle')">
      <span class="text-body-sm text-neutral-500">{{ label }}</span>
      <span
        class="flex min-w-0 items-center gap-1 text-body-sm"
        :class="valueText ? 'text-neutral-900' : 'text-neutral-400'"
      >
        <span class="truncate">{{ valueText || placeholder }}</span>
        <ChevronRight :size="14" class="shrink-0 text-neutral-400" />
      </span>
    </button>
    <div v-else>
      <p class="mb-2 text-body-sm text-neutral-500">{{ label }}</p>
      <slot />
    </div>
  </div>
</template>
