<script setup lang="ts">
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-vue-next'
import { useToastStore } from '@/stores/toastStore'

const toastStore = useToastStore()

function runAction(id: string, onAction?: () => void) {
  onAction?.()
  toastStore.dismiss(id)
}
</script>

<template>
  <!-- aria-live region so confirmations reach assistive tech, per
       docs/04-ui-ux-principles.md §7 -->
  <div
    aria-live="polite"
    role="status"
    class="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col gap-2 md:inset-x-auto md:bottom-8 md:right-8 md:w-80"
  >
    <div
      v-for="toast in toastStore.toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-2 rounded-md border bg-white p-3 shadow-md"
      :class="{
        'border-positive-600/30': toast.tone === 'success',
        'border-negative-600/30': toast.tone === 'error',
        'border-info-600/30': toast.tone === 'info',
      }"
    >
      <CheckCircle2 v-if="toast.tone === 'success'" :size="18" class="mt-0.5 shrink-0 text-positive-600" />
      <AlertCircle v-else-if="toast.tone === 'error'" :size="18" class="mt-0.5 shrink-0 text-negative-600" />
      <Info v-else :size="18" class="mt-0.5 shrink-0 text-info-600" />

      <p class="flex-1 text-body-sm text-neutral-900">{{ toast.message }}</p>

      <button
        v-if="toast.actionLabel"
        type="button"
        class="shrink-0 text-body-sm font-semibold text-accent-600 hover:text-accent-700"
        @click="runAction(toast.id, toast.onAction)"
      >
        {{ toast.actionLabel }}
      </button>

      <button
        type="button"
        aria-label="Dismiss"
        class="shrink-0 rounded-sm p-0.5 text-neutral-400 hover:bg-neutral-100"
        @click="toastStore.dismiss(toast.id)"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>
