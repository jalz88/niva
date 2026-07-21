<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useConfigItems } from '@/composables/useConfigItems'
import { useReports } from '@/composables/useReports'
import { periodRange, periodLabel, type ReportPeriod } from '@/lib/period'
import { formatMoney } from '@/lib/money'

const { workspaceId } = useAuth()
const properties = useConfigItems('properties')
const { summary, platformRevenue, categoryExpenses, loading, error, load } = useReports()

const period = ref<ReportPeriod>('this_month')
// Same reasoning as the Dashboard: the property picker only appears once
// more than one active property exists.
const propertyId = ref('')
const activeProperties = computed(() => properties.items.value.filter((p) => p.is_active))

function fetchReports() {
  if (!workspaceId.value) return
  const { dateFrom, dateTo } = periodRange(period.value)
  load({ workspaceId: workspaceId.value, propertyId: propertyId.value || undefined, dateFrom, dateTo })
}

watch(
  workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    fetchReports()
  },
  { immediate: true },
)
watch([period, propertyId], fetchReports)

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
    <!-- Period/property selectors stay visible while scrolling, per
         docs/09-wireframes.md "Period and property selectors ... persistent
         while scrolling." -->
    <header class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-neutral-50 pb-3 pt-6">
      <h1 class="text-h1 font-semibold text-neutral-900">Reports</h1>
      <div class="flex items-center gap-2">
        <select
          v-if="activeProperties.length > 1"
          v-model="propertyId"
          class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm"
        >
          <option value="">All properties</option>
          <option v-for="p in activeProperties" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model="period" class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm">
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
        </select>
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
        class="mb-4 flex items-center justify-between gap-3 rounded-md border border-negative-600/30 bg-negative-600/5 p-4 text-body-sm text-negative-600"
      >
        <span>{{ error.message }}</span>
        <button type="button" class="font-medium underline" @click="fetchReports">Try again</button>
      </div>

      <!-- No data for the selected period -->
      <section
        v-if="!hasAnyData && !error"
        class="rounded-md border border-neutral-200 bg-white p-6 text-center shadow-sm"
      >
        <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions in {{ periodLabel(period).toLowerCase() }}</h2>
        <p class="text-body-sm text-neutral-500">Try a different period once transactions exist.</p>
      </section>

      <template v-else>
        <!-- Totals — same card shape as Dashboard, for consistency -->
        <section v-for="row in summary" :key="row.currencyCode" class="mb-4">
          <p v-if="summary.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">{{ row.currencyCode }}</p>
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-md border border-neutral-200 bg-white p-3">
              <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                <TrendingUp :size="14" class="text-positive-600" /> Income
              </p>
              <p class="text-amount font-semibold text-positive-600">{{ formatMoney(row.income, row.currencyCode) }}</p>
            </div>
            <div class="rounded-md border border-neutral-200 bg-white p-3">
              <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                <TrendingDown :size="14" class="text-negative-600" /> Expenses
              </p>
              <p class="text-amount font-semibold text-negative-600">{{ formatMoney(row.expenses, row.currencyCode) }}</p>
            </div>
            <div class="rounded-md border border-neutral-200 bg-white p-3">
              <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                <Minus :size="14" :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'" /> Net
              </p>
              <p class="text-amount font-semibold" :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'">
                {{ formatMoney(row.net, row.currencyCode) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Revenue by platform: bar + authoritative table underneath, per
             docs/09-wireframes.md — "chart is never the only way to read a
             value." Every row drills into Transactions filtered. -->
        <section v-if="platformGroups.length" class="mb-4 rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
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
                      :to="{ name: 'transactions', query: { period, type: 'income', platformId: row.platformId } }"
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
        <section v-if="categoryGroups.length" class="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
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
                          period,
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
