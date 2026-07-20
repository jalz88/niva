<script setup lang="ts">
import { ref, watch } from 'vue'
import { Star } from 'lucide-vue-next'
import { useCurrencies } from '@/composables/useCurrencies'
import { useAuth } from '@/composables/useAuth'
import type { NivaError } from '@/lib/errors'

const { workspaceId } = useAuth()
const currencies = useCurrencies()
const savingCode = ref<string | null>(null)
const rowError = ref<NivaError | null>(null)

watch(
  workspaceId,
  (id) => {
    if (id) currencies.list(id)
  },
  { immediate: true },
)

async function toggle(code: string, enabled: boolean) {
  if (!workspaceId.value) return
  savingCode.value = code
  rowError.value = null
  const result = enabled ? await currencies.enable(workspaceId.value, code) : await currencies.disable(workspaceId.value, code)
  savingCode.value = null
  if (result) rowError.value = result
}

async function makeDefault(code: string) {
  if (!workspaceId.value) return
  savingCode.value = code
  rowError.value = null
  const result = await currencies.setDefault(workspaceId.value, code)
  savingCode.value = null
  if (result) rowError.value = result
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <h1 class="text-h1 font-semibold text-neutral-900">Currencies</h1>
    <p class="mb-4 text-body-sm text-neutral-500">
      Every monetary value keeps its own currency — NIVA never converts or combines currencies into one total
      without an explicit policy. Enable the currencies this workspace uses and pick one default.
    </p>

    <div v-if="currencies.loading.value" class="space-y-2">
      <div v-for="n in 4" :key="n" class="h-12 rounded-md bg-neutral-200" />
    </div>

    <div
      v-else-if="currencies.error.value"
      class="rounded-md border border-negative-600/30 bg-negative-600/5 p-4 text-body-sm text-negative-600"
      role="alert"
    >
      {{ currencies.error.value.message }}
    </div>

    <ul v-else class="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white shadow-sm">
      <li v-for="row in currencies.rows.value" :key="row.code" class="flex items-center gap-3 px-4 py-3">
        <div class="flex-1">
          <span class="text-body font-medium text-neutral-900">{{ row.code }}</span>
          <span class="ml-2 text-body-sm text-neutral-500">{{ row.name }}</span>
        </div>

        <button
          v-if="row.enabled"
          type="button"
          :aria-label="row.isDefault ? `${row.code} is the default currency` : `Set ${row.code} as default`"
          :disabled="row.isDefault || savingCode === row.code"
          class="flex items-center gap-1 rounded-sm px-2 py-1 text-caption"
          :class="row.isDefault ? 'text-accent-600' : 'text-neutral-400 hover:bg-neutral-100'"
          @click="makeDefault(row.code)"
        >
          <Star :size="14" :fill="row.isDefault ? 'currentColor' : 'none'" />
          {{ row.isDefault ? 'Default' : 'Set default' }}
        </button>

        <label class="flex items-center gap-2 text-body-sm text-neutral-700">
          <input
            type="checkbox"
            :checked="row.enabled"
            :disabled="row.isDefault || savingCode === row.code"
            class="h-4 w-4 rounded-sm border-neutral-300 text-accent-500 focus:ring-accent-500/40"
            @change="toggle(row.code, !row.enabled)"
          />
          Enabled
        </label>
      </li>
    </ul>
    <p v-if="rowError" class="mt-2 text-body-sm text-negative-600" role="alert">{{ rowError.message }}</p>
    <p class="mt-2 text-caption text-neutral-500">
      The default currency can't be disabled — set a different one as default first.
    </p>
  </div>
</template>
