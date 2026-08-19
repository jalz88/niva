<script setup lang="ts">
import { X } from 'lucide-vue-next'

// Shared bottom-sheet chrome — overlay, drag handle, borderless header,
// close button — per docs/08-design-system.md §5.1. First built for Quick
// Add (QuickAddSheet.vue); Transactions' Filters sheet is the second user.
// Any future bottom sheet should reach for this rather than re-implementing
// the same overlay/transition markup again.
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 bg-neutral-900/40" @click.self="emit('close')">
        <Transition name="slide-up">
          <div
            v-if="open"
            class="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-lg bg-neutral-100 shadow-lg md:inset-x-auto md:bottom-8 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:rounded-md"
          >
            <div class="sticky top-0 bg-neutral-100 px-5 pt-2 pb-1">
              <div class="mx-auto mb-3 h-1 w-9 rounded-pill bg-neutral-300 md:hidden" />
              <div class="flex items-center justify-between">
                <h2 class="text-h3 font-semibold text-neutral-900">{{ title }}</h2>
                <button
                  type="button"
                  aria-label="Close"
                  class="rounded-sm p-1 text-neutral-500 hover:bg-neutral-200/60"
                  @click="emit('close')"
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
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
