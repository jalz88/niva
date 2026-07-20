<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ChevronLeft } from 'lucide-vue-next'

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="mb-4">
    <RouterLink
      :to="{ name: 'administration' }"
      class="mb-2 inline-flex items-center gap-1 text-body-sm font-medium text-neutral-500 hover:text-accent-600"
    >
      <ChevronLeft :size="16" />
      Administration
    </RouterLink>
    <h1 class="text-h1 font-semibold text-neutral-900">{{ title }}</h1>
    <p v-if="description" class="text-body-sm text-neutral-500">{{ description }}</p>
  </div>
</template>
