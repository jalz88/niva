<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { LayoutDashboard, Receipt, BarChart3, User, Settings, Plus, Menu } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useQuickAddStore } from '@/stores/quickAddStore'
import MoreSheet from './MoreSheet.vue'

const route = useRoute()
const { role, user, displayName } = useAuth()
const quickAdd = useQuickAddStore()
const moreOpen = ref(false)

// Mobile bottom bar keeps only the 3 destinations used every day, with Add
// raised in the middle. Everything else — Account today, Recurring bills /
// Notifications / Housekeeping & Inventory later — lives in the "More"
// sheet so the bar never has to grow past 5 slots. Desktop has room to
// spare, so its sidebar keeps showing every destination inline (below).
// Decided 2026-08-04 — see docs/09-wireframes.md "Navigation chrome".
const leftItems = computed(() => [
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'transactions', label: 'Transactions', icon: Receipt },
])
const rightItems = computed(() => [{ name: 'reports', label: 'Reports', icon: BarChart3 }])

// Account is reachable by every role, not just administrator — signing out
// or setting your own name isn't an admin-only capability.
const moreItems = computed(() =>
  [
    { name: 'account', label: 'Account', icon: User },
    { name: 'administration', label: 'Administration', icon: Settings, roles: ['administrator'] },
  ].filter((item) => !item.roles || (role.value && item.roles.includes(role.value))),
)

const desktopItems = computed(() => [...leftItems.value, ...rightItems.value, ...moreItems.value])
const isMoreActive = computed(() => moreItems.value.some((item) => item.name === route.name))

const identityLabel = computed(() => displayName.value ?? user.value?.email ?? '')
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-50 md:flex-row">
    <!-- Desktop sidebar — hidden when printing (e.g. Reports' "Print / Save
         as PDF") so only the actual report content ends up on the page. -->
    <aside
      class="hidden w-56 shrink-0 border-r border-neutral-200 bg-white p-4 md:flex md:flex-col md:gap-1 print:hidden"
    >
      <div class="mb-4 flex items-center gap-2 px-2">
        <img src="/branding/niva-mark.svg" alt="" width="24" height="24" class="rounded-sm" />
        <span class="text-h3 font-semibold text-neutral-900">NIVA</span>
      </div>
      <RouterLink
        v-for="item in desktopItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="flex items-center gap-2 rounded-sm px-2 py-2 text-body-sm font-medium text-neutral-700 hover:bg-neutral-100"
        :class="{ 'bg-accent-50 text-accent-600': route.name === item.name }"
      >
        <component :is="item.icon" :size="18" />
        {{ item.label }}
      </RouterLink>
      <p class="mt-auto truncate px-2 pt-4 text-caption text-neutral-500">Signed in as {{ identityLabel }}</p>
    </aside>

    <div class="flex flex-1 flex-col">
      <main class="flex-1 pb-24 md:pb-8">
        <RouterView />
      </main>

      <!-- Desktop-only floating Quick Add. Mobile gets the raised button
           inside the bottom bar instead (below) — one Add affordance per
           viewport, not two. -->
      <button
        type="button"
        aria-label="Add transaction"
        class="fixed bottom-8 right-8 hidden h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-md hover:bg-accent-600 md:flex print:hidden"
        @click="quickAdd.show()"
      >
        <Plus :size="26" />
      </button>

      <!-- Mobile bottom nav: 2 destinations, raised Add, 1 destination, More. -->
      <nav
        class="fixed bottom-0 left-0 right-0 flex items-center border-t border-neutral-200 bg-white md:hidden print:hidden"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <RouterLink
          v-for="item in leftItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-caption text-neutral-500"
          :class="{ 'font-semibold text-accent-600': route.name === item.name }"
        >
          <component :is="item.icon" :size="20" />
          {{ item.label }}
        </RouterLink>

        <div class="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Add transaction"
            class="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-white shadow-md hover:bg-accent-600"
            @click="quickAdd.show()"
          >
            <Plus :size="22" />
          </button>
        </div>

        <RouterLink
          v-for="item in rightItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-caption text-neutral-500"
          :class="{ 'font-semibold text-accent-600': route.name === item.name }"
        >
          <component :is="item.icon" :size="20" />
          {{ item.label }}
        </RouterLink>

        <button
          type="button"
          class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-caption text-neutral-500"
          :class="{ 'font-semibold text-accent-600': isMoreActive }"
          @click="moreOpen = true"
        >
          <Menu :size="20" />
          More
        </button>
      </nav>

      <MoreSheet :open="moreOpen" :items="moreItems" @close="moreOpen = false" />
    </div>
  </div>
</template>
