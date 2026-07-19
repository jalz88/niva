<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <h1 class="mb-4 text-h1 font-semibold text-neutral-900">Administration</h1>
    <ul class="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white shadow-sm">
      <li v-for="area in ['Properties', 'Platforms', 'Categories', 'Payment methods', 'Currencies', 'Users']"
          :key="area"
          class="px-4 py-3 text-body text-neutral-700">
        {{ area }}
      </li>
    </ul>
  </div>
</template>
