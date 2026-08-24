<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import LanguageToggle from '@/components/ui/LanguageToggle.vue'

// Administrator/manager landing (route meta gates staff out entirely — a
// staff account goes straight to housekeeping-today instead, see
// AppShell.vue). Mirrors docs/housekeeping-in-app-prototype.html's
// renderHub(). Language toggle lives here (2026-08-26) since this is the
// module's entry point for admin/manager — the same preference then carries
// into Today's schedule/Rooms/Staff, all reading the shared locale.
const { t } = useI18n()
const rows = computed(() => [
  { to: 'housekeeping-schedule', title: t('hk.hub.schedule'), sub: t('hk.hub.scheduleSub') },
  { to: 'housekeeping-rooms', title: t('hk.hub.rooms'), sub: t('hk.hub.roomsSub') },
  { to: 'housekeeping-staff', title: t('hk.hub.staff'), sub: t('hk.hub.staffSub') },
])
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <header class="mb-4 flex items-center justify-between gap-3">
      <h1 class="text-h1 font-semibold text-neutral-900">{{ $t('hk.hub.title') }}</h1>
      <LanguageToggle />
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
