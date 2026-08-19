<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCurrencies } from '@/composables/useCurrencies'
import { useReports } from '@/composables/useReports'
import { useTransactions } from '@/composables/useTransactions'
import { useQuickAddStore } from '@/stores/quickAddStore'
import { periodRange, periodLabel, periodQueryParams, type PeriodSelection } from '@/lib/period'
import { formatMoney } from '@/lib/money'
import { approxCombinedTotal } from '@/lib/currencyApprox'
import PeriodPicker from '@/components/shared/PeriodPicker.vue'
import ApproxTotalCard from '@/components/shared/ApproxTotalCard.vue'

// Redesigned 2026-08-19 per docs/12-ux-options-review.md C.1: attention
// strip (not built — nothing feeds it yet, since Recurring bills/
// Notifications, B2/B4, aren't built), hero net number with an expandable
// currency breakdown replacing the always-stacked per-currency cards, no
// header property switcher (see C.9 — the "see by property" breakdown
// prototyped in docs/dashboard-prototype.html is deliberately not built
// yet, since there's only one active property today), revenue-by-platform
// gated on 2+ active platforms, and recent transactions dropped (one tap
// away via the nav).

const { workspaceId, user, displayName } = useAuth()
const quickAdd = useQuickAddStore()

const platforms = useConfigItems('platforms')
const currencies = useCurrencies()
const { summary, platformRevenue, loading: reportsLoading, error: reportsError, load: loadReports } = useReports()
const { revision } = useTransactions()

const period = ref<PeriodSelection>({ period: 'this_month' })

async function fetchAll() {
  if (!workspaceId.value) return
  const { dateFrom, dateTo } = periodRange(period.value)
  // Dashboard never offers 'all' (see PeriodPicker's allowAllTime), so this
  // is always true in practice — the guard exists because periodRange()'s
  // return type is shared with Transactions, which does need it.
  if (!dateFrom || !dateTo) return
  await loadReports({ workspaceId: workspaceId.value, dateFrom, dateTo })
}

watch(
  workspaceId,
  (id) => {
    if (!id) return
    platforms.list(id)
    currencies.list(id)
    fetchAll()
  },
  { immediate: true },
)

const expanded = ref(false)
watch(period, () => {
  expanded.value = false
  fetchAll()
})

// A Quick Add (or edit/delete) elsewhere bumps this — refetch so totals
// update without the user having to manually reload, per
// docs/04-ui-ux-principles.md §5.
watch(revision, fetchAll)

const hasAnyData = computed(() => summary.value.length > 0)
const isInitialLoading = computed(() => reportsLoading.value && !hasAnyData.value)

const approxTotal = computed(() => approxCombinedTotal(summary.value, currencies.rows.value))

// Hero number: the approximate combined total once the period spans more
// than one currency, otherwise that one currency's real net — never a
// mixed-currency sum presented as exact. The disclosure underneath always
// shows the real per-currency figures regardless of which one is headline.
const heroCurrencyCode = computed(() => (summary.value.length > 1 ? (approxTotal.value?.currencyCode ?? '') : (summary.value[0]?.currencyCode ?? '')))
const heroNet = computed(() => (summary.value.length > 1 ? (approxTotal.value?.net ?? 0) : Number(summary.value[0]?.net ?? 0)))
const heroIsApprox = computed(() => summary.value.length > 1)

// Revenue-by-platform is gated on the number of *configured* active
// platforms (same "quiet until needed" rule as the property selector),
// not on how many happen to show up in this period's data.
const activePlatformCount = computed(() => platforms.items.value.filter((p) => p.is_active).length)
// Bars are scaled within their own currency group — mixing bar scales
// across currencies would visually imply a comparison that isn't
// meaningful (see "no mixed-currency total" policy).
const platformGroups = computed(() => {
  const byCurrency = new Map<string, typeof platformRevenue.value>()
  for (const row of platformRevenue.value) {
    const group = byCurrency.get(row.currencyCode) ?? []
    group.push(row)
    byCurrency.set(row.currencyCode, group)
  }
  return Array.from(byCurrency.entries()).map(([currencyCode, rows]) => {
    const max = Math.max(...rows.map((r) => Number(r.total)))
    return { currencyCode, rows: rows.map((r) => ({ ...r, barPct: max > 0 ? (Number(r.total) / max) * 100 : 0 })) }
  })
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-h1 font-semibold text-neutral-900">Dashboard</h1>
        <p class="text-body-sm text-neutral-500">Signed in as {{ displayName ?? user?.email }}</p>
      </div>
      <PeriodPicker v-model="period" />
    </header>

    <!-- Loading skeleton (first load only, no fake numbers) -->
    <div v-if="isInitialLoading" class="flex flex-col gap-4">
      <div class="h-28 animate-pulse rounded-md bg-neutral-100" />
      <div class="h-40 animate-pulse rounded-md bg-neutral-100" />
    </div>

    <template v-else>
      <!-- Error — inline retry, never blocks Quick Add (the FAB is global chrome) -->
      <div v-if="reportsError" class="mb-4 flex items-center justify-between gap-3 rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600">
        <span>{{ reportsError.message }}</span>
        <button type="button" class="font-medium underline" @click="fetchAll">Try again</button>
      </div>

      <!-- Empty: nothing this period at all -->
      <section v-if="!hasAnyData && !reportsError" class="rounded-md bg-white p-6 text-center shadow-sm">
        <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions {{ periodLabel(period).toLowerCase() }}</h2>
        <p class="mb-4 text-body-sm text-neutral-500">Add your first transaction to see totals here.</p>
        <button type="button" class="rounded-sm bg-accent-500 px-4 py-2 text-body-sm font-medium text-white hover:bg-accent-600" @click="quickAdd.show()">
          Add transaction
        </button>
      </section>

      <template v-else>
        <!-- Hero net + expandable currency breakdown -->
        <section class="mb-4 rounded-md bg-white p-4 shadow-sm">
          <p class="text-body-sm text-neutral-500">{{ periodLabel(period) }} · net</p>
          <p class="text-amount-lg font-semibold" :class="heroNet >= 0 ? 'text-positive-600' : 'text-negative-600'">
            <span v-if="heroIsApprox">≈ </span>{{ formatMoney(heroNet.toFixed(2), heroCurrencyCode) }}
          </p>
          <button type="button" class="mt-1 border-0 bg-transparent p-0 text-body-sm font-medium text-accent-600 hover:text-accent-700" @click="expanded = !expanded">
            {{ expanded ? 'Hide' : 'See' }} currency breakdown
          </button>

          <div v-if="expanded" class="mt-3 flex flex-col gap-3 border-t border-neutral-200 pt-3">
            <div v-for="row in summary" :key="row.currencyCode">
              <p v-if="summary.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">{{ row.currencyCode }}</p>
              <div class="grid grid-cols-3 gap-2">
                <div class="min-w-0">
                  <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500"><TrendingUp :size="14" class="shrink-0 text-positive-600" /> Income</p>
                  <p class="break-words text-body-sm font-semibold text-positive-600">{{ formatMoney(row.income, row.currencyCode) }}</p>
                </div>
                <div class="min-w-0">
                  <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                    <TrendingDown :size="14" class="shrink-0 text-negative-600" /> Expenses
                  </p>
                  <p class="break-words text-body-sm font-semibold text-negative-600">{{ formatMoney(row.expenses, row.currencyCode) }}</p>
                </div>
                <div class="min-w-0">
                  <p class="mb-1 flex items-center gap-1 text-caption text-neutral-500">
                    <Minus :size="14" class="shrink-0" :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'" /> Net
                  </p>
                  <p class="break-words text-body-sm font-semibold" :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'">
                    {{ formatMoney(row.net, row.currencyCode) }}
                  </p>
                </div>
              </div>
            </div>
            <ApproxTotalCard v-if="approxTotal" :approx="approxTotal" />
          </div>
        </section>

        <!-- Revenue by platform — only once there's more than one active platform to compare -->
        <section v-if="activePlatformCount > 1 && platformGroups.length" class="mb-4 rounded-md bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-h3 font-semibold text-neutral-900">Revenue by platform</h2>
          <div v-for="group in platformGroups" :key="group.currencyCode" class="mb-3 last:mb-0">
            <p v-if="platformGroups.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">{{ group.currencyCode }}</p>
            <RouterLink
              v-for="row in group.rows"
              :key="row.platformId"
              :to="{ name: 'transactions', query: { ...periodQueryParams(period), type: 'income', platformId: row.platformId } }"
              class="mb-2 flex items-center gap-2 last:mb-0"
            >
              <span class="w-24 shrink-0 truncate text-body-sm text-neutral-700">{{ row.platformName }}</span>
              <span class="h-2 flex-1 overflow-hidden rounded-pill bg-neutral-100">
                <span class="block h-full rounded-pill bg-accent-500" :style="{ width: `${row.barPct}%` }" />
              </span>
              <span class="w-24 shrink-0 text-right text-caption font-medium text-neutral-700">
                {{ formatMoney(row.total, group.currencyCode) }}
              </span>
            </RouterLink>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
