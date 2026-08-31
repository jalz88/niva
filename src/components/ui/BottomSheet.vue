<script setup lang="ts">
import { X } from 'lucide-vue-next'

// Shared sheet/dialog chrome — per docs/08-design-system.md §5.1. On mobile
// this is a bottom sheet (slides up, pinned to the bottom edge). On desktop
// it's a true centered modal, not a bottom sheet parked lower on the page —
// fixed 2026-08-24 after it kept reading as "the mobile sheet, just moved,"
// including the enter/leave animation still sliding vertically instead of a
// centered fade/scale. Positioning is plain flexbox (items-end → items-
// center at md), not translate-based centering, so it can't fight the
// transition's own transform.
// `dirty` lets a consumer opt in to an unsaved-changes guard (2026-08-31,
// real-user feedback: tapping the backdrop or the X silently discarded
// in-progress Quick Add/Edit transaction input with no warning). Default
// false keeps every other existing usage of this component byte-for-byte
// the same — attemptClose() falls straight through to `close` unless a
// consumer explicitly passes `dirty`. When it is true, `close-blocked` is
// emitted instead so the consumer can show its own "discard changes?"
// confirm dialog and only then set `open` to false itself.
const props = defineProps<{ open: boolean; title: string; dirty?: boolean }>()
const emit = defineEmits<{ close: []; 'close-blocked': [] }>()
function attemptClose() {
  if (props.dirty) emit('close-blocked')
  else emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 flex items-end justify-center bg-neutral-900/40 md:items-center md:p-4"
        @click.self="attemptClose"
      >
        <Transition name="sheet">
          <div v-if="open" class="max-h-[90vh] w-full overflow-y-auto rounded-t-lg bg-neutral-100 shadow-lg md:max-w-md md:rounded-md">
            <div class="sticky top-0 bg-neutral-100 px-5 pt-2 pb-1">
              <div class="mx-auto mb-3 h-1 w-9 rounded-pill bg-neutral-300 md:hidden" />
              <div class="flex items-center justify-between">
                <h2 class="text-h3 font-semibold text-neutral-900">{{ title }}</h2>
                <button
                  type="button"
                  aria-label="Close"
                  class="rounded-sm p-1 text-neutral-500 hover:bg-neutral-200/60"
                  @click="attemptClose"
                >
                  <X :size="20" />
                </button>
              </div>
            </div>
            <div class="px-5 pt-2 pb-5">
              <slot />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
/* Desktop: a centered modal fades/scales in, it never slides up from the
   bottom edge like the mobile sheet does. */
@media (min-width: 768px) {
  .sheet-enter-from,
  .sheet-leave-to {
    transform: scale(0.96);
    opacity: 0;
  }
}
</style>
