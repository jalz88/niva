<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import { useAuth } from '@/composables/useAuth'
import { formatMoney } from '@/lib/money'
import type { ApproxCombinedTotal } from '@/lib/currencyApprox'

const props = defineProps<{ approx: ApproxCombinedTotal }>()
const { role } = useAuth()

// Shown inline so the rate is visible right where the total is, instead of
// sending the reader back to Currencies admin to find out what was used
// (2026-08-02, Jalie's wife's feedback) — also read by the CSV export so a
// downloaded report is self-explanatory on its own.
const rateLines = computed(() =>
  props.approx.ratesUsed.map((r) => {
    const dated = r.updatedAt ? ` (set ${dayjs(r.updatedAt).format('D MMM YYYY')})` : ''
    return `1 ${r.code} ≈ ${r.rate.toFixed(2)} ${props.approx.currencyCode}${dated}`
  }),
)
</script>

<template>
  <div class="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 text-body-sm">
    <p class="text-neutral-700">
      <span class="font-semibold text-neutral-900">≈ {{ formatMoney(approx.net.toFixed(2), approx.currencyCode) }}</span>
      <span class="text-neutral-500"> approx. net across currencies</span>
    </p>
    <p v-if="rateLines.length" class="mt-0.5 text-caption text-neutral-500">
      Rates used: {{ rateLines.join(' · ') }}
    </p>
    <p class="mt-0.5 text-caption text-neutral-500">
      An estimate for a quick overall read — every other total in NIVA stays in its own exact currency.
    </p>
    <p v-if="approx.missingRateCodes.length" class="mt-1.5 text-caption text-negative-600">
      No rate set for {{ approx.missingRateCodes.join(', ') }}, so that activity isn't included above.
      <RouterLink v-if="role === 'administrator'" :to="{ name: 'administration-currencies' }" class="font-medium underline">
        Set it in Currencies
      </RouterLink>
    </p>
  </div>
</template>
