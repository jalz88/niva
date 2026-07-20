<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'

const areas = [
  { name: 'administration-properties', label: 'Properties', description: 'Business locations and accommodation operations' },
  { name: 'administration-platforms', label: 'Platforms', description: 'Revenue sources such as Airbnb or Agoda' },
  { name: 'administration-categories', label: 'Categories', description: 'Income and expense classifications' },
  { name: 'administration-payment-methods', label: 'Payment methods', description: 'Cash, bank transfer, card, and so on' },
  { name: 'administration-currencies', label: 'Currencies', description: 'Which currencies this workspace uses' },
  { name: 'administration-users', label: 'Users', description: 'Who has access, and their role' },
]
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <h1 class="mb-4 text-h1 font-semibold text-neutral-900">Administration</h1>
    <ul class="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white shadow-sm">
      <li v-for="area in areas" :key="area.name">
        <RouterLink
          :to="{ name: area.name }"
          class="flex items-center justify-between gap-2 px-4 py-3 hover:bg-neutral-100"
        >
          <div>
            <div class="text-body text-neutral-900">{{ area.label }}</div>
            <div class="text-body-sm text-neutral-500">{{ area.description }}</div>
          </div>
          <ChevronRight :size="18" class="shrink-0 text-neutral-400" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
