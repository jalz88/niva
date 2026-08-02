<script setup lang="ts">
import dayjs from 'dayjs'
import type { PeriodSelection, ReportPeriod } from '@/lib/period'

// allowAllTime shows the "All time" option — only the Transactions filter
// panel wants that; Dashboard/Reports always show a bounded period so their
// totals stay well-defined.
withDefaults(defineProps<{ allowAllTime?: boolean }>(), { allowAllTime: false })
const selection = defineModel<PeriodSelection>({ required: true })

// Switching into 'month'/'range' needs *some* value to show immediately —
// default to the current month (and the two months before it, for range)
// rather than leaving the extra inputs empty until the user picks.
function setMode(mode: ReportPeriod) {
  if (mode === 'month') {
    selection.value = { period: mode, month: selection.value.month ?? dayjs().format('YYYY-MM') }
  } else if (mode === 'range') {
    selection.value = {
      period: mode,
      rangeFrom: selection.value.rangeFrom ?? dayjs().subtract(2, 'month').format('YYYY-MM'),
      rangeTo: selection.value.rangeTo ?? dayjs().format('YYYY-MM'),
    }
  } else {
    selection.value = { period: mode }
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <select
      :value="selection.period"
      aria-label="Period"
      class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm"
      @change="setMode(($event.target as HTMLSelectElement).value as ReportPeriod)"
    >
      <option v-if="allowAllTime" value="all">All time</option>
      <option value="this_month">This month</option>
      <option value="last_month">Last month</option>
      <option value="this_year">This year</option>
      <option value="last_year">Last year</option>
      <option value="month">Specific month…</option>
      <option value="range">Custom range…</option>
    </select>

    <input
      v-if="selection.period === 'month'"
      type="month"
      :value="selection.month"
      aria-label="Month"
      class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm"
      @change="selection = { period: 'month', month: ($event.target as HTMLInputElement).value }"
    />

    <template v-if="selection.period === 'range'">
      <input
        type="month"
        :value="selection.rangeFrom"
        aria-label="From month"
        class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm"
        @change="selection = { period: 'range', rangeFrom: ($event.target as HTMLInputElement).value, rangeTo: selection.rangeTo }"
      />
      <span class="text-body-sm text-neutral-500" aria-hidden="true">–</span>
      <input
        type="month"
        :value="selection.rangeTo"
        aria-label="To month"
        class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm"
        @change="selection = { period: 'range', rangeFrom: selection.rangeFrom, rangeTo: ($event.target as HTMLInputElement).value }"
      />
    </template>
  </div>
</template>
