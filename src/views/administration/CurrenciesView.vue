<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Star } from 'lucide-vue-next'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import { useCurrencies } from '@/composables/useCurrencies'
import { useAuth } from '@/composables/useAuth'
import type { NivaError } from '@/lib/errors'

const { workspaceId } = useAuth()
const currencies = useCurrencies()
const savingCode = ref<string | null>(null)
const rowError = ref<NivaError | null>(null)
const defaultCode = computed(() => currencies.rows.value.find((r) => r.isDefault)?.code ?? '')

// Draft text per currency code while the rate input is being typed —
// keeping this separate from the saved value means an in-progress edit
// never gets clobbered by a re-render, and lets an empty/invalid draft be
// rejected on blur without touching what's actually saved.
const rateDrafts = reactive<Record<string, string>>({})

async function saveRate(code: string) {
  const raw = rateDrafts[code]
  if (raw === undefined || !workspaceId.value) return
  delete rateDrafts[code]

  const parsed = Number(raw)
  if (!raw.trim() || !Number.isFinite(parsed) || parsed <= 0) {
    rowError.value = { code: 'validation_error', message: 'Enter a rate greater than 0.', retryable: false }
    return
  }

  savingCode.value = code
  rowError.value = null
  const result = await currencies.setReferenceRate(workspaceId.value, code, parsed)
  savingCode.value = null
  if (result) rowError.value = result
}

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
    <AdminBackHeader
      title="Currencies"
      description="Every monetary value keeps its own exact currency and total everywhere in NIVA. Enable the currencies this workspace uses, pick one default, and optionally set an approximate rate for each other currency — Dashboard and Reports use it to show one extra, clearly-labeled approximate combined total when a period has more than one currency in play."
    />

    <div v-if="currencies.loading.value" class="space-y-2">
      <div v-for="n in 4" :key="n" class="h-12 animate-pulse rounded-md bg-neutral-100" />
    </div>

    <div
      v-else-if="currencies.error.value"
      class="rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600"
      role="alert"
    >
      {{ currencies.error.value.message }}
    </div>

    <ul v-else class="divide-y divide-neutral-100 rounded-md bg-white shadow-sm">
      <li v-for="row in currencies.rows.value" :key="row.code" class="flex flex-col gap-2 px-4 py-3">
        <div class="flex items-center gap-3">
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
        </div>

        <!-- Reference rate — only meaningful for a non-default currency
             that's actually enabled. Purely for the approximate combined
             total on Dashboard/Reports; every real total everywhere else
             stays in its own exact currency regardless of this. -->
        <div v-if="row.enabled && !row.isDefault" class="flex flex-wrap items-center gap-2 pl-0.5">
          <label :for="`rate-${row.code}`" class="shrink-0 text-caption text-neutral-500">1 {{ row.code }} ≈</label>
          <input
            :id="`rate-${row.code}`"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            placeholder="not set"
            class="w-24 rounded-md bg-white px-2.5 py-1.5 text-body-sm text-neutral-900 shadow-sm outline-none"
            :value="rateDrafts[row.code] ?? row.referenceRateToDefault ?? ''"
            :disabled="savingCode === row.code"
            @input="rateDrafts[row.code] = ($event.target as HTMLInputElement).value"
            @blur="saveRate(row.code)"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
          />
          <span class="shrink-0 text-caption text-neutral-500">{{ defaultCode }}</span>
          <span v-if="row.referenceRateUpdatedAt" class="shrink-0 text-caption text-neutral-400">
            · set {{ dayjs(row.referenceRateUpdatedAt).format('D MMM YYYY') }}
          </span>
        </div>
      </li>
    </ul>
    <p v-if="rowError" class="mt-2 text-body-sm text-negative-600" role="alert">{{ rowError.message }}</p>
    <p class="mt-2 text-caption text-neutral-500">
      The default currency can't be disabled — set a different one as default first.
    </p>
  </div>
</template>
