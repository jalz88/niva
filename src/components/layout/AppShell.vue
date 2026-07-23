<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { LayoutDashboard, Receipt, BarChart3, User, Settings, Plus } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useQuickAddStore } from '@/stores/quickAddStore'

const route = useRoute()
const { role, user, displayName } = useAuth()
const quickAdd = useQuickAddStore()

// Account is reachable by every role, not just administrator — signing out
// or setting your own name isn't an admin-only capability.
const navItems = computed(() =>
  [
    { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { name: 'transactions', label: 'Transactions', icon: Receipt },
    { name: 'reports', label: 'Reports', icon: BarChart3 },
    { name: 'account', label: 'Account', icon: User },
    { name: 'administration', label: 'More', icon: Settings, roles: ['administrator'] },
  ].filter((item) => !item.roles || (role.value && item.roles.includes(role.value))),
)

const identityLabel = computed(() => displayName.value ?? user.value?.email ?? '')
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-50 md:flex-row">
    <!-- Desktop sidebar -->
    <aside
      class="hidden w-56 shrink-0 border-r border-neutral-200 bg-white p-4 md:flex md:flex-col md:gap-1"
    >
      <div class="mb-4 flex items-center gap-2 px-2">
        <img src="/branding/niva-mark.svg" alt="" width="24" height="24" class="rounded-sm" />
        <span class="text-h3 font-semibold text-neutral-900">NIVA</span>
      </div>
      <RouterLink
        v-for="item in navItems"
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

      <!-- Floating Quick Add — action, not a destination, per docs/05-information-architecture.md §3 -->
      <button
        type="button"
        aria-label="Add transaction"
        class="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-md hover:bg-accent-600 md:bottom-8 md:right-8"
        @click="quickAdd.show()"
      >
        <Plus :size="26" />
      </button>

      <!-- Mobile bottom nav -->
      <nav
        class="fixed bottom-0 left-0 right-0 flex border-t border-neutral-200 bg-white md:hidden"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-caption text-neutral-500"
          :class="{ 'font-semibold text-accent-600': route.name === item.name }"
        >
          <component :is="item.icon" :size="20" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </div>
  </div>
</template>
