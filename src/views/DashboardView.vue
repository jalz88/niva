<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCategories } from '@/composables/useCategories'
import { useReports } from '@/composables/useReports'
import { useTransactions } from '@/composables/useTransactions'
import { useQuickAddStore } from '@/stores/quickAddStore'
import { periodRange, periodLabel, type ReportPeriod } from '@/lib/period'
import { formatMoney, formatSignedMoney } from '@/lib/money'

const { workspaceId, user, displayName } = useAuth()
const quickAdd = useQuickAddStore()

const properties = useConfigItems('properties')
const categories = useCategories()
const {
  summary,
  platformRevenue,
  loading: reportsLoading,
  error: reportsError,
  load: loadReports,
} = useReports()
const { items: recentItems, loading: transactionsLoading, revision, list: listTransactions } = useTransactions()

const period = ref<ReportPeriod>('this_month')
// Empty string = "All properties". The picker itself only renders once more
// than one active property exists — with a single property (today's
// reality) there's simply nothing to choose, same reasoning as the Quick
// Add form's property handling (docs/09-wireframes.md).
const propertyId = ref('')
const activeProperties = computed(() => properties.items.value.filter((p) => p.is_active))

async function fetchAll() {
  if (!workspaceId.value) return
  const { dateFrom, dateTo } = periodRange(period.value)
  await Promise.all([
    loadReports({ workspaceId: workspaceId.value, propertyId: propertyId.value || undefined, dateFrom, dateTo }),
    listTransactions({
      workspaceId: workspaceId.value,
      propertyId: propertyId.value || undefined,
      dateFrom,
      dateTo,
      page: 1,
      pageSize: 5,
    }),
  ])
}

watch(
  workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    categories.list(id)
    fetchAll()
  },
  { immediate: true },
)
watch([period, propertyId], fetchAll)
// A Quick Add (or edit/delete) elsewhere bumps this — refetch so totals
// update without the user having to manually reload, per
// docs/04-ui-ux-principles.md §5.
watch(revision, fetchAll)

const hasAnyData = computed(() => summary.value.length > 0 || recentItems.value.length > 0)
const isInitialLoading = computed(() => (reportsLoading.value || transactionsLoading.value) && !hasAnyData.value)

// Revenue-by-platform bars are scaled within their own currency group —
// mixing bar scales across currencies would visually imply a comparison
// that isn't meaningful (see "no mixed-currency total" policy).
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

// A transaction's category_id may point at a sub-category directly — show
// it with its parent for context, same as TransactionsView/
// TransactionDetailView ("Repairs & maintenance · Plumbing").
function categoryDisplay(tx: { category_id: string; category_name: string }) {
  const cat = categories.items.value.find((c) => c.id === tx.category_id)
  const parent = cat?.parent_category_id ? categories.items.value.find((c) => c.id === cat.parent_category_id) : null
  return parent ? `${parent.name} · ${tx.category_name}` : tx.category_name
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-h1 font-semibold text-neutral-900">Dashboard</h1>
        <p class="text-body-sm text-neutral-500">Signed in as {{ displayName ?? user?.email }}</p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-if="activeProperties.length > 1"
          v-model="propertyId"
          aria-label="Property"
          class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm"
        >
          <option value="">All properties</option>
          <option v-for="p in activeProperties" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <select v-model="period" aria-label="Period" class="rounded-sm border border-neutral-200 bg-white p-2 text-body-sm">
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
        </select>
      </div>
    </header>

    <!-- Loading skeleton (first load only, no fake numbers) -->
    <div v-if="isInitialLoading" class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-2">
        <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-md bg-neutral-100" />
      </div>
      <div class="h-32 animate-pulse rounded-md bg-neutral-100" />
      <div class="h-40 animate-pulse rounded-md bg-neutral-100" />
    </div>

    <template v-else>
      <!-- Error — inline retry, never blocks Quick Add (the FAB is global chrome) -->
      <div
        v-if="reportsError"
        class="mb-4 flex items-center justify-between gap-3 rounded-md border border-negative-600/30 bg-negative-600/5 p-4 text-body-sm text-negative-600"
      >
        <span>{{ reportsError.message }}</span>
        <button type="button" class="font-medium underline" @click="fetchAll">Try again</button>
      </div>

      <!-- Empty: nothing this period at all -->
      <section
        v-if="!hasAnyData && !reportsError"
        class="rounded-md border border-neutral-200 bg-white p-6 text-center shadow-sm"
      >
        <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions {{ periodLabel(period).toLowerCase() }}</h2>
        <p class="mb-4 text-body-sm text-neutral-500">Add your first transaction to see totals here.</p>
        <button
          type="button"
          class="rounded-sm bg-accent-500 px-4 py-2 text-body-sm font-medium text-white hover:bg-accent-600"
          @click="quickAdd.show()"
        >
          Add transaction
        </button>
      </section>

      <template v-else>
        <!-- Summary cards, one section per currency in use -->
        <section v-for="row in summary" :key="row.currencyCode" class="mb-4">
          <p v-if="summary.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">
            {{ row.currencyCode }}
          </p>
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
              <p
                class="text-amount font-semibold"
                :class="Number(row.net) >= 0 ? 'text-positive-600' : 'text-negative-600'"
              >
                {{ formatMoney(row.net, row.currencyCode) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Revenue by platform -->
        <section v-if="platformGroups.length" class="mb-4 rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-h3 font-semibold text-neutral-900">Revenue by platform</h2>
          <div v-for="group in platformGroups" :key="group.currencyCode" class="mb-3 last:mb-0">
            <p v-if="platformGroups.length > 1" class="mb-1.5 text-caption font-medium text-neutral-500">
              {{ group.currencyCode }}
            </p>
            <RouterLink
              v-for="row in group.rows"
              :key="row.platformId"
              :to="{ name: 'transactions', query: { period, type: 'income', platformId: row.platformId } }"
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

        <!-- Recent transactions -->
        <section class="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-h3 font-semibold text-neutral-900">Recent transactions</h2>
            <RouterLink :to="{ name: 'transactions' }" class="text-body-sm font-medium text-accent-600">
              View all
            </RouterLink>
          </div>
          <p v-if="recentItems.length === 0" class="text-body-sm text-neutral-500">No transactions yet.</p>
          <div v-else class="flex flex-col gap-1.5">
            <RouterLink
              v-for="tx in recentItems"
              :key="tx.id"
              :to="{ name: 'transaction-detail', params: { id: tx.id } }"
              class="flex items-center gap-3 rounded-md p-2 hover:bg-neutral-50"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                :class="tx.type === 'income' ? 'bg-positive-600/10 text-positive-600' : 'bg-negative-600/10 text-negative-600'"
              >
                <ArrowUpRight v-if="tx.type === 'income'" :size="16" />
                <ArrowDownLeft v-else :size="16" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-body-sm font-medium text-neutral-900">
                  {{ categoryDisplay(tx) }}
                </p>
                <p class="truncate text-caption text-neutral-500">{{ tx.property_name }}</p>
              </div>
              <span
                class="shrink-0 text-body-sm font-semibold"
                :class="tx.type === 'income' ? 'text-positive-600' : 'text-negative-600'"
              >
                {{ formatSignedMoney(tx.amount, tx.currency_code, tx.type) }}
              </span>
            </RouterLink>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
