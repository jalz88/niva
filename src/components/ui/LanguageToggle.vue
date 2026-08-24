<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'

// Small EN/SI switch — used in the Housekeeping hub header (admin/manager)
// and the Today kiosk header (staff), the only two entry points into the
// module. Not a form control, just a two-way pill toggle, same visual
// language as the reassign chip row in TodayView.vue.
const { locale, setLocale } = useLocale()
</script>

<template>
  <div class="flex items-center gap-0.5 rounded-pill bg-neutral-100 p-0.5" role="group" aria-label="Language">
    <button
      type="button"
      class="rounded-pill px-2 py-0.5 text-caption font-semibold"
      :class="locale === 'en' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'"
      @click="setLocale('en')"
    >
      EN
    </button>
    <button
      type="button"
      class="rounded-pill px-2 py-0.5 text-caption font-semibold"
      :class="locale === 'si' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'"
      @click="setLocale('si')"
    >
      සිං
    </button>
  </div>
</template>
