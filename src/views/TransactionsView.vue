<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ArrowDownLeft, ArrowUpRight, Download, SlidersHorizontal, X } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useTransactions } from '@/composables/useTransactions'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCategories, topLevelCategories, subcategoriesOf } from '@/composables/useCategories'
import { periodRange, periodLabel, parsePeriodFromQuery, type PeriodSelection } from '@/lib/period'
import { buildTransactionCsv, transactionCsvFilename, type TransactionCsvRow } from '@/lib/transactionCsv'
import { downloadTextFile } from '@/lib/csv'
import { useToastStore } from '@/stores/toastStore'
import PeriodPicker from '@/components/shared/PeriodPicker.vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { TransactionType } from '@/types/database'

const { workspaceId } = useAuth()
const { items, total, loading, refreshing, error, list, listAll, revision } = useTransactions()
const toast = useToastStore()

// useTransactions() now caches per filter+page combination and can update
// `items` twice for one logical fetch — instantly from cache, then again
// once the background revalidation resolves (see useTransactions.ts). A
// naive "append whatever just arrived" accumulator would double up a
// page's rows when both firings happen. Keeping one bucket per page number
// and rebuilding the flat list from it makes a repeat firing for the same
// page overwrite instead of duplicate.
const pagesById = ref(new Map<number, typeof items.value>())
watch(items, (newItems) => {
  pagesById.value.set(page.value, newItems)
})
const displayedItems = computed(() => {
  const pageNumbers = Array.from(pagesById.value.keys()).sort((a, b) => a - b)
  return pageNumbers.flatMap((p) => pagesById.value.get(p) ?? [])
})

const properties = useConfigItems('properties')
const platforms = useConfigItems('platforms')
const categories = useCategories()

// Reports drills into this screen with query params (period/month/
// rangeFrom/rangeTo/type/categoryId/platformId/propertyId) so a
// platform-revenue or category-expense row lands here pre-filtered instead
// of just linking to the unfiltered list. Read once on mount; a plain
// in-app navigation with no query keeps the usual "This month" default.
const route = useRoute()
function queryString(key: string): string {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

interface TransactionFiltersState {
  // Defaults to the current month — matches the Dashboard's default
  // period (docs/05-information-architecture.md "Global context") and
  // keeps the common case scoped rather than querying the whole lifetime
  // history every time. "All time" is one filter-tap away. Transactions is
  // the only screen that offers 'all' (see PeriodPicker's allowAllTime) —
  // Dashboard/Reports always show a bounded period.
  period: PeriodSelection
  propertyId: string
  type: '' | TransactionType
  categoryId: string
  platformId: string
}

const filters = reactive<TransactionFiltersState>({
  period: parsePeriodFromQuery(route.query as Record<string, unknown>, { allowAll: true }),
  propertyId: queryString('propertyId'),
  type: (queryString('type') === 'income' || queryString('type') === 'expense' ? queryString('type') : '') as '' | TransactionType,
  categoryId: queryString('categoryId'),
  platformId: queryString('platformId'),
})

// A "Expenses by category" row in Reports rolls sub-category totals into
// their top-level parent — landing here with just categoryId set to that
// parent would silently exclude any transaction recorded directly against
// a sub-category (the summary total includes it, the drill-down wouldn't).
// Reports passes every contributing id via categoryIds too; when present it
// takes over from the exact-match categoryId filter. Cleared the moment the
// user touches the category dropdown themselves, so a manual re-filter goes
// back to normal exact-match behaviour.
const categoryIdsOverride = ref<string[]>(
  queryString('categoryIds')
    ? queryString('categoryIds')
        .split(',')
        .filter(Boolean)
    : [],
)
watch(
  () => filters.categoryId,
  () => {
    categoryIdsOverride.value = []
  },
)

const showFilters = ref(false)
const page = ref(1)
const pageSize = 20

function fetchTransactions() {
  if (!workspaceId.value) return
  // Always called with page reset to 1 (filters changed, a mutation
  // happened, or first load) — drop any pages accumulated under whatever
  // filter/page state was previously on screen.
  pagesById.value.clear()
  const { dateFrom, dateTo } = periodRange(filters.period)
  list({
    workspaceId: workspaceId.value,
    propertyId: filters.propertyId || undefined,
    type: filters.type || undefined,
    categoryId: categoryIdsOverride.value.length ? undefined : filters.categoryId || undefined,
    categoryIds: categoryIdsOverride.value.length ? categoryIdsOverride.value : undefined,
    platformId: filters.platformId || undefined,
    dateFrom,
    dateTo,
    page: page.value,
    pageSize,
  })
}

watch(
  workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    platforms.list(id)
    categories.list(id)
    fetchTransactions()
  },
  { immediate: true },
)

watch(
  () => ({ ...filters }),
  () => {
    page.value = 1
    fetchTransactions()
  },
)

// Something was created/edited/archived elsewhere (most commonly: Quick
// Add, while this list is already on screen) — refetch page 1 so it shows
// up without the user having to manually reload.
watch(revision, () => {
  page.value = 1
  fetchTransactions()
})

const hasActiveFilters = computed(
  () => filters.period.period !== 'all' || !!filters.propertyId || !!filters.type || !!filters.categoryId || !!filters.platformId,
)

// Property filter row only renders once a workspace actually has a second
// active property — same "quiet until needed" rule used everywhere else
// multi-property shows up (Dashboard's breakdown, Reports' revenue-by-
// platform). See docs/12-ux-options-review.md C.9.
const activeProperties = computed(() => properties.items.value.filter((p) => p.is_active))
const showPropertyFilter = computed(() => activeProperties.value.length > 1)

const propertyName = (id: string) => properties.items.value.find((p) => p.id === id)?.name ?? ''
const platformName = (id: string) => platforms.items.value.find((p) => p.id === id)?.name ?? ''
const categoryName = (id: string) => categories.items.value.find((c) => c.id === id)?.name ?? ''

// Flat, but with sub-categories indented right under their parent — reads
// as a tree without needing a real nested <select>.
const categoryFilterOptions = computed(() => {
  const options: { id: string; label: string }[] = []
  for (const type of ['income', 'expense'] as const) {
    for (const top of topLevelCategories(categories.items.value, type)) {
      options.push({ id: top.id, label: top.name })
      for (const sub of subcategoriesOf(categories.items.value, top.id)) {
        options.push({ id: sub.id, label: `— ${sub.name}` })
      }
    }
  }
  return options
})

// A transaction's category_id may point at a sub-category directly (see
// migration 0005) — show it with its parent for context, e.g.
// "Repairs & maintenance · Plumbing", not just "Plumbing" in isolation.
function categoryDisplay(tx: { category_id: string; category_name: string }) {
  const cat = categories.items.value.find((c) => c.id === tx.category_id)
  const parent = cat?.parent_category_id ? categories.items.value.find((c) => c.id === cat.parent_category_id) : null
  return parent ? `${parent.name} · ${tx.category_name}` : tx.category_name
}

const chips = computed(() => {
  const list: { key: string; label: string; clear: () => void }[] = []
  if (filters.period.period !== 'all')
    list.push({ key: 'period', label: periodLabel(filters.period), clear: () => (filters.period = { period: 'all' }) })
  if (filters.propertyId)
    list.push({ key: 'property', label: propertyName(filters.propertyId), clear: () => (filters.propertyId = '') })
  if (filters.type) list.push({ key: 'type', label: filters.type === 'income' ? 'Income' : 'Expense', clear: () => (filters.type = '') })
  if (filters.categoryId)
    list.push({ key: 'category', label: categoryName(filters.categoryId), clear: () => (filters.categoryId = '') })
  if (filters.platformId)
    list.push({ key: 'platform', label: platformName(filters.platformId), clear: () => (filters.platformId = '') })
  return list
})

function clearAllFilters() {
  filters.period = { period: 'all' }
  filters.propertyId = ''
  filters.type = ''
  filters.categoryId = ''
  filters.platformId = ''
}

// ---- Export (Download) — docs/12-ux-options-review.md B.1/C.4 -----------
// "A Download action on the Transactions list itself, exporting exactly
// whatever filters are currently applied." Reuses the CSV pattern already
// built for Reports (src/lib/csv.ts). Confirms first — via the same
// ConfirmDialog used for delete, no new UI concept — once the filtered
// result exceeds 100 rows; under that it exports immediately.
const EXPORT_CONFIRM_THRESHOLD = 100
const showExportConfirm = ref(false)
const exporting = ref(false)

const filterSummaryText = computed(() => (chips.value.length ? chips.value.map((c) => c.label).join(' · ') : 'All transactions'))

function handleDownloadClick() {
  if (total.value > EXPORT_CONFIRM_THRESHOLD) {
    showExportConfirm.value = true
    return
  }
  runExport()
}

async function runExport() {
  if (!workspaceId.value) return
  exporting.value = true
  const { dateFrom, dateTo } = periodRange(filters.period)
  const { data, error: exportError } = await listAll({
    workspaceId: workspaceId.value,
    propertyId: filters.propertyId || undefined,
    type: filters.type || undefined,
    categoryId: categoryIdsOverride.value.length ? undefined : filters.categoryId || undefined,
    categoryIds: categoryIdsOverride.value.length ? categoryIdsOverride.value : undefined,
    platformId: filters.platformId || undefined,
    dateFrom,
    dateTo,
  })
  exporting.value = false
  showExportConfirm.value = false

  if (exportError) {
    toast.show(exportError.message, { tone: 'error' })
    return
  }

  const generatedAt = new Date()
  const rows: TransactionCsvRow[] = data.map((tx) => ({
    date: tx.occurred_on,
    type: tx.type === 'income' ? 'Income' : 'Expense',
    category: categoryDisplay(tx),
    property: tx.property_name,
    paymentMethod: tx.payment_method_name,
    platform: tx.platform_name ?? '',
    supplier: tx.supplier_name ?? '',
    amount: tx.amount,
    currency: tx.currency_code,
    notes: tx.notes ?? '',
  }))
  const csv = buildTransactionCsv(filterSummaryText.value, generatedAt, rows)
  downloadTextFile(transactionCsvFilename(generatedAt), csv, 'text/csv;charset=utf-8;')
}

const groups = computed(() => {
  const map = new Map<string, typeof displayedItems.value>()
  for (const tx of displayedItems.value) {
    const existing = map.get(tx.occurred_on)
    if (existing) existing.push(tx)
    else map.set(tx.occurred_on, [tx])
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
})

function groupLabel(date: string) {
  const d = dayjs(date)
  if (d.isSame(dayjs(), 'day')) return 'Today'
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday'
  return d.format('D MMMM YYYY')
}

function formatAmount(amount: string, type: TransactionType, currencyCode: string) {
  const sign = type === 'income' ? '+' : '−'
  return `${sign} ${currencyCode} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const canLoadMore = computed(() => displayedItems.value.length < total.value)
function loadMore() {
  page.value += 1
  if (!workspaceId.value) return
  const { dateFrom, dateTo } = periodRange(filters.period)
  list({
    workspaceId: workspaceId.value,
    propertyId: filters.propertyId || undefined,
    type: filters.type || undefined,
    categoryId: categoryIdsOverride.value.length ? undefined : filters.categoryId || undefined,
    categoryIds: categoryIdsOverride.value.length ? categoryIdsOverride.value : undefined,
    platformId: filters.platformId || undefined,
    dateFrom,
    dateTo,
    page: page.value,
    pageSize,
  })
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <!-- Thin top-of-list indicator for a background revalidation — the
         list itself already has cached data on screen, so this stays out
         of its way rather than replacing it with a skeleton. -->
    <div
      class="fixed inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-accent-100 transition-opacity"
      :class="refreshing ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    >
      <div class="h-full w-1/3 animate-[refresh-bar_1.1s_ease-in-out_infinite] bg-accent-500" />
    </div>

    <div class="mb-4 flex items-center justify-between gap-2">
      <h1 class="text-h1 font-semibold text-neutral-900">Transactions</h1>
      <div class="flex items-center gap-2">
        <button
          v-if="displayedItems.length > 0"
          type="button"
          aria-label="Download transactions as CSV"
          :disabled="exporting"
          class="flex items-center gap-1.5 rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm disabled:opacity-60"
          @click="handleDownloadClick"
        >
          <Download :size="16" />
          {{ exporting ? 'Preparing…' : 'Download' }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm"
          @click="showFilters = true"
        >
          <SlidersHorizontal :size="16" />
          Filters
        </button>
      </div>
    </div>

    <!-- Active filter chips -->
    <div v-if="chips.length" class="mb-3 flex flex-wrap gap-2">
      <button
        v-for="chip in chips"
        :key="chip.key"
        type="button"
        :aria-label="`Remove filter: ${chip.label}`"
        class="flex items-center gap-1 rounded-pill bg-accent-100 px-3 py-1.5 text-caption font-semibold text-accent-700"
        @click="chip.clear()"
      >
        {{ chip.label }}
        <X :size="12" />
      </button>
      <button type="button" class="text-caption font-medium text-neutral-500 underline" @click="clearAllFilters">
        Clear all
      </button>
    </div>

    <!-- Filters sheet -->
    <BottomSheet :open="showFilters" title="Filters" @close="showFilters = false">
      <div class="flex flex-col gap-5">
        <div>
          <p class="mb-2 text-body-sm text-neutral-500">Period</p>
          <PeriodPicker v-model="filters.period" :allow-all-time="true" />
        </div>

        <div>
          <p class="mb-2 text-body-sm text-neutral-500">Type</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in [{ id: '', label: 'All types' }, { id: 'income', label: 'Income' }, { id: 'expense', label: 'Expense' }]"
              :key="opt.id || 'all'"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="
                filters.type === opt.id ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'
              "
              @click="filters.type = opt.id as '' | TransactionType"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div v-if="showPropertyFilter">
          <p class="mb-2 text-body-sm text-neutral-500">Property</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="!filters.propertyId ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="filters.propertyId = ''"
            >
              All properties
            </button>
            <button
              v-for="p in activeProperties"
              :key="p.id"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="
                filters.propertyId === p.id
                  ? 'bg-accent-100 font-semibold text-accent-700 shadow-none'
                  : 'bg-white font-medium text-neutral-700 shadow-sm'
              "
              @click="filters.propertyId = p.id"
            >
              {{ p.name }}
            </button>
          </div>
        </div>

        <div>
          <p class="mb-2 text-body-sm text-neutral-500">Category</p>
          <div class="max-h-56 overflow-y-auto rounded-md bg-white shadow-sm">
            <button
              type="button"
              class="block w-full px-4 py-3 text-left text-body"
              :class="!filters.categoryId ? 'bg-accent-100 font-semibold text-accent-700' : 'text-neutral-900 hover:bg-neutral-50'"
              @click="filters.categoryId = ''"
            >
              All categories
            </button>
            <button
              v-for="c in categoryFilterOptions"
              :key="c.id"
              type="button"
              class="block w-full px-4 py-3 text-left text-body"
              :class="filters.categoryId === c.id ? 'bg-accent-100 font-semibold text-accent-700' : 'text-neutral-900 hover:bg-neutral-50'"
              @click="filters.categoryId = c.id"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <div v-if="platforms.items.value.length">
          <p class="mb-2 text-body-sm text-neutral-500">Platform</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="!filters.platformId ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="filters.platformId = ''"
            >
              All platforms
            </button>
            <button
              v-for="p in platforms.items.value"
              :key="p.id"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="
                filters.platformId === p.id
                  ? 'bg-accent-100 font-semibold text-accent-700 shadow-none'
                  : 'bg-white font-medium text-neutral-700 shadow-sm'
              "
              @click="filters.platformId = p.id"
            >
              {{ p.name }}
            </button>
          </div>
        </div>

        <div class="flex gap-2">
          <button type="button" class="flex-1 rounded-lg bg-white py-3 text-body font-semibold text-neutral-700 shadow-sm" @click="clearAllFilters">
            Clear
          </button>
          <button type="button" class="flex-1 rounded-lg bg-accent-500 py-3 text-body font-semibold text-white" @click="showFilters = false">
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>

    <!-- Loading skeleton (first load only) -->
    <div v-if="loading && displayedItems.length === 0" class="flex flex-col gap-2">
      <div v-for="i in 6" :key="i" class="h-16 animate-pulse rounded-md bg-neutral-100" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600">
      {{ error.message }}
    </div>

    <!-- No transactions at all -->
    <section v-else-if="displayedItems.length === 0 && !hasActiveFilters" class="rounded-md bg-white p-6 text-center shadow-sm">
      <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions yet</h2>
      <p class="text-body-sm text-neutral-500">Add your first transaction to see it here.</p>
    </section>

    <!-- Filtered to empty -->
    <section v-else-if="displayedItems.length === 0" class="rounded-md bg-white p-6 text-center shadow-sm">
      <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No transactions match these filters</h2>
      <button type="button" class="text-body-sm font-medium text-accent-600 underline" @click="clearAllFilters">
        Clear filters
      </button>
    </section>

    <!-- Grouped list -->
    <div v-else class="flex flex-col gap-4">
      <div v-for="[date, rows] in groups" :key="date">
        <h3 class="mb-2 text-body-sm font-semibold text-neutral-500">{{ groupLabel(date) }}</h3>
        <div class="flex flex-col gap-1.5">
          <RouterLink
            v-for="tx in rows"
            :key="tx.id"
            :to="{ name: 'transaction-detail', params: { id: tx.id } }"
            class="flex items-center gap-3 rounded-md bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              :class="tx.type === 'income' ? 'bg-positive-600/10 text-positive-600' : 'bg-negative-600/10 text-negative-600'"
            >
              <ArrowUpRight v-if="tx.type === 'income'" :size="18" />
              <ArrowDownLeft v-else :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-body font-medium text-neutral-900">{{ categoryDisplay(tx) }}</p>
              <p class="truncate text-caption text-neutral-500">{{ tx.property_name }} · {{ tx.payment_method_name }}</p>
            </div>
            <span
              class="shrink-0 text-amount font-semibold"
              :class="tx.type === 'income' ? 'text-positive-600' : 'text-negative-600'"
            >
              {{ formatAmount(tx.amount, tx.type, tx.currency_code) }}
            </span>
          </RouterLink>
        </div>
      </div>

      <button
        v-if="canLoadMore"
        type="button"
        :disabled="loading"
        class="self-center rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm hover:shadow-md disabled:opacity-50"
        @click="loadMore"
      >
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>

    <ConfirmDialog
      :open="showExportConfirm"
      title="Download transactions?"
      :description="`This will export ${total} transactions (${filterSummaryText}) as a CSV file.`"
      confirm-label="Download"
      :busy="exporting"
      @confirm="runExport"
      @cancel="showExportConfirm = false"
    />
  </div>
</template>
