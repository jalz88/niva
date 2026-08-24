<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

// Administrator/manager landing (route meta gates staff out entirely — a
// staff account goes straight to housekeeping-today instead, see
// AppShell.vue). Mirrors docs/housekeeping-in-app-prototype.html's
// renderHub().
const rows = [
  { to: 'housekeeping-schedule', title: "Today's schedule", sub: "What's due today, and who it's assigned to" },
  { to: 'housekeeping-rooms', title: 'Rooms', sub: 'Spaces, checklists, booking sync' },
  { to: 'housekeeping-staff', title: 'Staff', sub: 'Roster and the work calendar' },
]
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <header class="mb-4">
      <h1 class="text-h1 font-semibold text-neutral-900">Housekeeping</h1>
    </header>

    <div class="flex flex-col gap-2">
      <RouterLink
        v-for="row in rows"
        :key="row.to"
        :to="{ name: row.to }"
        class="flex items-center justify-between gap-3 rounded-md bg-white p-4 shadow-sm hover:shadow-md"
      >
        <div>
          <p class="text-body font-semibold text-neutral-900">{{ row.title }}</p>
          <p class="text-caption text-neutral-500">{{ row.sub }}</p>
        </div>
        <ChevronRight :size="18" class="shrink-0 text-neutral-400" />
      </RouterLink>
    </div>
  </div>
</template>
