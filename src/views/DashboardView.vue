<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

const { user } = useAuth()
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <header class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-h1 font-semibold text-neutral-900">Dashboard</h1>
        <p class="text-body-sm text-neutral-500">Signed in as {{ user?.email }}</p>
      </div>
    </header>

    <section class="rounded-md border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions yet</h2>
      <p class="text-body-sm text-neutral-500">
        Dashboard totals, revenue by platform, and recent transactions appear here once Phase 2
        (configuration) and Phase 3 (transactions) are built — see
        <code>docs/06-development-roadmap.md</code>. This screen currently confirms that
        authentication, routing, and the app shell work end to end.
      </p>
    </section>
  </div>
</template>
