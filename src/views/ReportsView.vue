<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import dayjs from 'dayjs'
import { TrendingUp, TrendingDown, Minus, Download, Printer } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCurrencies } from '@/composables/useCurrencies'
import { useReports } from '@/composables/useReports'
import { periodRange, periodLabel, periodQueryParams, previousPeriodRange, type PeriodSelection } from '@/lib/period'
import { formatMoney } from '@/lib/money'
import { approxCombinedTotal } from '@/lib/currencyApprox'
import { buildReportCsv, reportCsvFilename, downloadTextFile } from '@/lib/reportCsv'
import { buildReportInsight } from '@/lib/reportInsight'
import PeriodPicker from '@/components/shared/PeriodPicker.vue'
import ApproxTotalCard from '@/components/shared/ApproxTotalCard.vue'

const { workspaceId } = useAuth()
const properties = useConfigItems('properties')
const currencies = useCurrencies()
const { summary, platformRevenue, categoryExpenses, loading, error, load } = useReports()
// Second, independent instance — the insight line (below) needs the prior
// comparable period's numbers too, fetched via the same RPCs Reports
// already calls rather than a new endpoint. Its own loading/error state is
// deliberately not surfaced: the insight just quietly doesn't appear if
// this fetch is slow or fails, rather than blocking or erroring the report
// the person actually came here to see.
const { summary: previousSummary, categoryExpenses: previousCategoryExpenses, load: loadPrevious } = useReports()
const previousLabel = ref('')

const period = ref<PeriodSelection>({ period: 'this_month' })
// Same reasoning as the Dashboard: the property picker only appears once
// more than one active property exists.
const propertyId = ref('')
const activeProperties = computed(() => properties.items.value.filter((p) => p.is_active))

function fetchReports() {
  if (!workspaceId.value) return
  const { dateFrom, dateTo } = periodRange(period.value)
  // Reports never offers 'all' (see PeriodPicker's allowAllTime), so this is
  // always true in practice — the guard exists because periodRange()'s
  // return type is shared with Transactions, which does need it.
  if (!dateFrom || !dateTo) return
  load({ workspaceId: workspaceId.value, propertyId: propertyId.value || undefined, dateFrom, dateTo })

  const previous = previousPeriodRange(period.value)
  previousLabel.value = previous?.label ?? ''
  if (previous) {
    loadPrevious({ workspaceId: workspaceId.value, propertyId: propertyId.value || undefined, dateFrom: previous.dateFrom, dateTo: previous.dateTo })
  }
}

watch(
  workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    currencies.list(id)
    fetchReports()
  },
  { immediate: true },
)

const approxTotal = computed(() => approxCombinedTotal(summary.value, currencies.rows.value))
watch([period, propertyId], fetchReports)

const insight = computed(() =>
  previousLabel.value
    ? buildReportInsight(summary.value, previousSummary.value, categoryExpenses.value, previousCategoryExpenses.value, currencies.rows.value, previousLabel.value)
    : null,
)

const propertyLabel = computed(
  () => (propertyId.value ? (properties.items.value.find((p) => p.id === propertyId.value)?.name ?? 'Selected property') : 'All properties'),
)

// CSV is the raw numbers for further work (spreadsheet, accountant); "Print
// / Save as PDF" reuses the browser's own print dialog against the
// print:hidden/print:block rules below instead of a PDF-generation library
// — every modern browser can save that as a real PDF with no new
// dependency (2026-08-02, Jalie's wife asked for a downloadable report).
function handleDownloadCsv() {
  const generatedAt = new Date()
  const csv = buildReportCsv({
    periodLabel: periodLabel(period.value),
    propertyLabel: propertyLabel.value,
    generatedAt,
    summary: summary.value,
    approxTotal: approxTotal.value,
    platformRevenue: platformRevenue.value,
    categoryExpenses: categoryExpenses.value,
  })
  downloadTextFile(reportCsvFilename(periodLabel(period.value), generatedAt), csv, 'text/csv;charset=utf-8;')
}

function handlePrint() {
  window.print()
}

const hasAnyData = computed(
  () => summary.value.length > 0 || platformRevenue.value.length > 0 || categoryExpenses.value.length > 0,
)
const isInitialLoading = computed(() => loading.value && !hasAnyData.value)

// Bars are scaled within their own currency group so mixing currencies
// never implies a comparison that isn't meaningful — same reasoning as the
// Dashboard's "Revenue by platform".
function withBarPct<T extends { currencyCode: string; total: string }>(rows: T[]) {
  const byCurrency = new Map<string, T[]>()
  for (const row of rows) {
    const group = byCurrency.get(row.currencyCode) ?? []
    group.push(row)
    byCurrency.set(row.currencyCode, group)
  }
  return Array.from(byCurrency.entries()).map(([currencyCode, group]) => {
    const max = Math.max(...group.map((r) => Number(r.total)))
    return { currencyCode, rows: group.map((r) => ({ ...r, barPct: max > 0 ? (Number(r.total) / max) * 100 : 0 })) }
  })
}

const platformGroups = computed(() => withBarPct(platformRevenue.value))
const categoryGroups = computed(() => withBarPct(categoryExpenses.value))
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pb-24 md:pb-8">
    <!-- Print-only header — window.print() (the "Print / Save as PDF"
         button below) hides everything else on the page via print:hidden,
         so the printed/PDF output needs its own plain-text statement of
         what's being reported instead of the interactive controls. -->
    <div class="mb-4 hidden print:block">
      <h1 class="text-h1 font-semibold text-neutral-900">NIVA report</h1>
      <p class="text-body-sm text-neutral-600">{{ periodLabel(period) }} · {{ propertyLabel }}</p>
      <p class="text-caption text-neutral-500">Generated {{ dayjs().format('D MMM YYYY, HH:mm') }}</p>
    </div>

    <!-- Period/property selectors stay visible while scrolling, per
         docs/09-wireframes.md "Period and property selectors ... persistent
         while scrolling." Hidden when printing — see the print-only header
         above instead. -->
    <header class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-neutral-50 pb-3 pt-6 print:hidden">
      <h1 class="text-h1 font-semibold text-neutral-900">Reports</h1>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-if="activeProperties.length > 1"
          v-model="propertyId"
          aria-label="Property"
          class="rounded-md border-0 bg-white p-2 text-body-sm shadow-sm"
        >
          <option value="">All properties</option>
          <option v-for="p in activeProperties" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <PeriodPicker v-model="period" />
        <button
          type="button"
          aria-label="Download report as CSV"
          class="flex items-center gap-1.5 rounded-md border-0 bg-white px-3 py-2 text-body-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          @click="handleDownloadCsv"
        >
          <Download :size="16" /> CSV
        </button>
        <button
          type="button"
          aria-label="Print or save report as PDF"
          class="flex items-center gap-1.5 rounded-md border-0 bg-white px-3 py-2 text-body-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          @click="handlePrint"
        >
          <Printer :size="16" /> PDF
        </button>
      </div>
    </header>

    <!-- Loading skeleton -->
    <div v-if="isInitialLoading" class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-2">
        <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-md bg-neutral-100" />
      </div>
      <div class="h-40 animate-pulse rounded-md bg-neutral-100" />
      <div class="h-40 animate-pulse rounded-md bg-neutral-100" />
    </div>

    <template v-else>
      <div
        v-if="error"
        class="mb-4 flex items-center justify-between gap-3 rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600"
      >
        <span>{{ error.message }}</span>
        <button type="button" class="font-medium underline" @click="fetchReports">Try again</button>
      </div>

      <!-- No data for the selected period -->
      <section
        v-if="!hasAnyData && !error"
        class="rounded-md bg-white p-6 text-center shadow-sm"
      >
        <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions in {{ periodLabel(period).toLowerCase() }}</h2>
        <p class="text-body-sm text-neutral-500">Try a different period once transactions exist.</p>
      </section>

      <template v-else>
        <!-- Plain-language insight — docs/12-ux-options-review.md A8/Part C.
             Quietly absent (not a skeleton, not an error) when there's
             nothing clean to compare against, per buildReportInsight(). -->
        <p v-if="insight" class="mb-4 text-body text-neutral-700 print:hidden">
          <span :class="insight.direction === 'up' ? 'font-semibold text-negative-600' : insight.direction === 'down' ? 'font-semibold text-positive-600' : 'font-semibold'">{{ insight.text }}</span>
        </p>

        <!-- Totals — same card shape as Dashboard, for consistency -->
        <section v-for="row in summary" :key="row.currencyCode" class="mb-4">
          <p v-if="summary.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">{{ row.currencyCode }}</p>
          <!-- min-w-0 on each cell: CSS Grid columns default to
               min-width:auto, which respects an unbreakable token like
               "28,389.12" and blows the column out past its intended
               third — that's what was clipping/overlapping amounts into
               the neighboring card (2026-08-02, Jalie's wife's feedback).
               min-w-0 lets the grid actually hold to equal thirds; the
               amount then wraps (break-words) instead of overflowing. -->
          <div class="grid grid-cols-3 gap-2">
            <div class="min-w-0 rounded-md bg-white p-3 shadow-sm">
              <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                <TrendingUp :size="14" class="shrink-0 text-positive-600" /> Income
              </p>
              <p class="break-words text-amount font-semibold text-positive-600">{{ formatMoney(row.income, row.currencyCode) }}</p>
            </div>
            <div class="min-w-0 rounded-md bg-white p-3 shadow-sm">
              <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                <TrendingDown :size="14" class="shrink-0 text-negative-600" /> Expenses
              </p>
              <p class="break-words text-amount font-semibold text-negative-600">{{ formatMoney(row.expenses, row.currencyCode) }}</p>
            </div>
            <div class="min-w-0 rounded-md bg-white p-3 shadow-sm">
              <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                <Minus :size="14" class="shrink-0" :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'" /> Net
              </p>
              <p class="break-words text-amount font-semibold" :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'">
                {{ formatMoney(row.net, row.currencyCode) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Approximate combined total — only appears once the period has
             activity in more than one currency, and is visually distinct
             (dashed border, muted) from the exact per-currency cards above
             so it never reads as an authoritative total. -->
        <ApproxTotalCard v-if="approxTotal" :approx="approxTotal" class="mb-4" />

        <!-- Revenue by platform: bar + authoritative table underneath, per
             docs/09-wireframes.md — "chart is never the only way to read a
             value." Every row drills into Transactions filtered. -->
        <section v-if="platformGroups.length" class="mb-4 rounded-md bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-h3 font-semibold text-neutral-900">Revenue by platform</h2>
          <div v-for="group in platformGroups" :key="group.currencyCode" class="mb-4 last:mb-0">
            <p v-if="platformGroups.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">
              {{ group.currencyCode }}
            </p>
            <table class="w-full text-left">
              <tbody>
                <tr v-for="row in group.rows" :key="row.platformId">
                  <td class="py-1.5">
                    <RouterLink
                      :to="{ name: 'transactions', query: { ...periodQueryParams(period), type: 'income', platformId: row.platformId } }"
                      class="block"
                    >
                      <span class="mb-1 flex items-center justify-between gap-2 text-body-sm text-neutral-700">
                        <span class="truncate">{{ row.platformName }}</span>
                        <span class="shrink-0 font-medium text-neutral-900">{{ formatMoney(row.total, group.currencyCode) }}</span>
                      </span>
                      <span class="block h-1.5 overflow-hidden rounded-pill bg-neutral-100">
                        <span class="block h-full rounded-pill bg-accent-500" :style="{ width: `${row.barPct}%` }" />
                      </span>
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Expenses by category — same pattern, rolled up to top-level
             categories (migration 0007/0008). The drill-down link carries
             every contributing sub-category id, not just the top one, so
             the Transactions list underneath matches this total exactly. -->
        <section v-if="categoryGroups.length" class="rounded-md bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-h3 font-semibold text-neutral-900">Expenses by category</h2>
          <div v-for="group in categoryGroups" :key="group.currencyCode" class="mb-4 last:mb-0">
            <p v-if="categoryGroups.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">
              {{ group.currencyCode }}
            </p>
            <table class="w-full text-left">
              <tbody>
                <tr v-for="row in group.rows" :key="row.categoryId">
                  <td class="py-1.5">
                    <RouterLink
                      :to="{
                        name: 'transactions',
                        query: {
                          ...periodQueryParams(period),
                          type: 'expense',
                          categoryId: row.categoryId,
                          categoryIds: row.categoryIds.join(','),
                        },
                      }"
                      class="block"
                    >
                      <span class="mb-1 flex items-center justify-between gap-2 text-body-sm text-neutral-700">
                        <span class="truncate">{{ row.categoryName }}</span>
                        <span class="shrink-0 font-medium text-neutral-900">{{ formatMoney(row.total, group.currencyCode) }}</span>
                      </span>
                      <span class="block h-1.5 overflow-hidden rounded-pill bg-neutral-100">
                        <span class="block h-full rounded-pill bg-negative-600" :style="{ width: `${row.barPct}%` }" />
                      </span>
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
