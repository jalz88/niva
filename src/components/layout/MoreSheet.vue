<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'

// Bottom sheet for the mobile "More" nav slot — houses every destination
// that doesn't fit in the always-visible bottom bar. Grouped (Money,
// Account, …) rather than a flat list once Reports + Recurring payments +
// Administration + Account all landed in here together — mirrors the
// grouping in docs/housekeeping-in-app-prototype.html's moreGroups() /
// the Screen access sheet's SCREEN_GROUPS (same shape, different job).
// Decided 2026-08-04 after a 3-pattern visual comparison (bottom nav +
// More hub vs. bottom nav + swipe-up vs. side drawer) — see
// docs/09-wireframes.md "Navigation chrome".
defineProps<{
  open: boolean
  groups: { label: string | null; items: { name: string; label: string; icon: Component }[] }[]
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="sheet-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-end bg-neutral-900/30 md:hidden print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="More"
      @click.self="emit('close')"
    >
      <div class="w-full rounded-t-2xl bg-white p-4" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))">
        <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-neutral-200" />
        <template v-for="group in groups" :key="group.label ?? 'ungrouped'">
          <p v-if="group.label" class="mt-3 mb-1 px-2 text-caption font-semibold tracking-wide text-neutral-400 uppercase first:mt-0">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.name"
            :to="{ name: item.name }"
            class="flex items-center gap-3 rounded-sm px-2 py-3 text-body font-medium text-neutral-800 hover:bg-neutral-100"
            @click="emit('close')"
          >
            <component :is="item.icon" :size="20" class="text-neutral-500" />
            {{ item.label }}
          </RouterLink>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.15s ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}
</style>
