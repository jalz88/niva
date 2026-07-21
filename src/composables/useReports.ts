import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'

export interface ReportFilters {
  workspaceId: string
  propertyId?: string
  dateFrom: string
  dateTo: string
}

// Every row is scoped to one currency and never summed across currencies —
// see docs/10-api-data-access-spec.md §2 "Reporting" and the Phase 4 exit
// criteria in docs/06-development-roadmap.md ("no mixed-currency total is
// shown without an explicit policy").
export interface CurrencyTotal {
  currencyCode: string
  income: string
  expenses: string
  net: string
}

export interface PlatformRevenueRow {
  currencyCode: string
  platformId: string
  platformName: string
  total: string
}

export interface CategoryExpenseRow {
  currencyCode: string
  categoryId: string
  categoryName: string
  // Every category id rolled into this total — the top-level id plus any
  // sub-categories that contributed. Use this (not categoryId alone) when
  // drilling into Transactions, or a transaction recorded directly against
  // a sub-category would count toward this total but vanish from its own
  // drill-down list.
  categoryIds: string[]
  total: string
}

interface RawSummaryRow {
  currency_code: string
  income: number
  expenses: number
  net: number
}
interface RawPlatformRow {
  currency_code: string
  platform_id: string
  platform_name: string
  total: number
}
interface RawCategoryRow {
  currency_code: string
  category_id: string
  category_name: string
  category_ids: string[]
  total: number
}

export function useReports() {
  const summary = ref<CurrencyTotal[]>([])
  const platformRevenue = ref<PlatformRevenueRow[]>([])
  const categoryExpenses = ref<CategoryExpenseRow[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function load(filters: ReportFilters) {
    loading.value = true
    error.value = null

    // read from Postgres RPCs (migration 0007), not client-side aggregation
    // over a raw transaction fetch — the same total then has to be reachable
    // two ways (this summary, and the Transactions drill-down list) without
    // ever risking client math disagreeing with server math.
    const rpcArgs = {
      p_workspace_id: filters.workspaceId,
      p_property_id: filters.propertyId ?? null,
      p_period_start: filters.dateFrom,
      p_period_end: filters.dateTo,
    }

    const [summaryRes, platformRes, categoryRes] = await Promise.all([
      supabase.rpc('dashboard_summary', rpcArgs),
      supabase.rpc('revenue_by_platform', rpcArgs),
      supabase.rpc('expenses_by_category', rpcArgs),
    ])

    loading.value = false

    const firstError = summaryRes.error ?? platformRes.error ?? categoryRes.error
    if (firstError) {
      error.value = toNivaError(firstError)
      return
    }

    summary.value = ((summaryRes.data ?? []) as RawSummaryRow[]).map((r) => ({
      currencyCode: r.currency_code,
      income: String(r.income),
      expenses: String(r.expenses),
      net: String(r.net),
    }))
    platformRevenue.value = ((platformRes.data ?? []) as RawPlatformRow[]).map((r) => ({
      currencyCode: r.currency_code,
      platformId: r.platform_id,
      platformName: r.platform_name,
      total: String(r.total),
    }))
    categoryExpenses.value = ((categoryRes.data ?? []) as RawCategoryRow[]).map((r) => ({
      currencyCode: r.currency_code,
      categoryId: r.category_id,
      categoryName: r.category_name,
      categoryIds: r.category_ids,
      total: String(r.total),
    }))
  }

  return { summary, platformRevenue, categoryExpenses, loading, error, load }
}
