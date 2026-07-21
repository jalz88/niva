import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, conflictError, type NivaError } from '@/lib/errors'
import type { Transaction, TransactionWithLabels, TransactionType } from '@/types/database'
import type { TransactionPayload } from '@/lib/schemas/transaction'

export interface TransactionFilters {
  workspaceId: string
  propertyId?: string
  type?: TransactionType
  categoryId?: string
  platformId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

// Every table referenced here has exactly one FK from transactions, so
// PostgREST can embed it automatically — see
// docs/10-api-data-access-spec.md §2 "includes joined display names ... so
// the detail screen doesn't issue five extra queries."
const SELECT_WITH_LABELS = `
  *,
  properties ( name ),
  categories ( name ),
  payment_methods ( name ),
  platforms ( name ),
  suppliers ( name )
`

interface RawJoinedRow extends Transaction {
  properties: { name: string } | null
  categories: { name: string } | null
  payment_methods: { name: string } | null
  platforms: { name: string } | null
  suppliers: { name: string } | null
}

function flatten(row: RawJoinedRow): TransactionWithLabels {
  const { properties, categories, payment_methods, platforms, suppliers, ...rest } = row
  return {
    ...rest,
    // PostgREST actually returns numeric columns as JSON numbers, not
    // strings — the type comment on Transaction.amount was aspirational,
    // not accurate. Normalize here so every consumer (the edit form's
    // Zod schema in particular) can rely on amount always being a string.
    amount: String(rest.amount),
    property_name: properties?.name ?? '',
    category_name: categories?.name ?? '',
    payment_method_name: payment_methods?.name ?? '',
    platform_name: platforms?.name ?? null,
    supplier_name: suppliers?.name ?? null,
  }
}

function toDbFields(payload: TransactionPayload) {
  return {
    property_id: payload.propertyId,
    type: payload.type,
    category_id: payload.categoryId,
    payment_method_id: payload.paymentMethodId,
    platform_id: payload.platformId ?? null,
    supplier_id: payload.supplierId ?? null,
    currency_code: payload.currencyCode,
    amount: payload.amount,
    occurred_on: payload.occurredOn,
    notes: payload.notes || null,
  }
}

// Bumped on every successful create/update/archive/unarchive — also used
// below to invalidate the list cache, since a mutation can change which
// rows any given filter/page combination should return.
const revision = ref(0)

// Session-scoped cache, same pattern as useConfigItems.ts — but keyed by
// the full filter+page combination, since "the transactions list" isn't
// one thing, it's one thing per filter state. Without this, every visit
// to the Transactions screen re-fetched from empty and showed the full
// skeleton, even revisiting the exact same unfiltered page 1 seconds
// later — that's what read as "always loading from the server."
interface CachedPage {
  items: TransactionWithLabels[]
  total: number
}
const cache = new Map<string, CachedPage>()

function cacheKey(filters: TransactionFilters): string {
  return JSON.stringify([
    filters.workspaceId,
    filters.propertyId ?? '',
    filters.type ?? '',
    filters.categoryId ?? '',
    filters.platformId ?? '',
    filters.dateFrom ?? '',
    filters.dateTo ?? '',
    filters.page ?? 1,
    filters.pageSize ?? 50,
  ])
}

export function useTransactions() {
  const items = ref<TransactionWithLabels[]>([])
  const total = ref(0)
  const loading = ref(false)
  // True while revalidating in the background after already showing
  // cached data — distinct from `loading`, which is the "nothing to show
  // yet, render the skeleton" case. A view can show a subtle indicator for
  // this without blanking the list the way the skeleton does.
  const refreshing = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(filters: TransactionFilters) {
    const key = cacheKey(filters)
    const cached = cache.get(key)

    if (cached) {
      items.value = cached.items
      total.value = cached.total
      loading.value = false
      refreshing.value = true
    } else {
      loading.value = true
    }
    error.value = null

    const page = filters.page ?? 1
    const pageSize = Math.min(filters.pageSize ?? 50, 100)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('transactions')
      .select(SELECT_WITH_LABELS, { count: 'exact' })
      .eq('workspace_id', filters.workspaceId)
      .eq('status', 'active')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filters.propertyId) query = query.eq('property_id', filters.propertyId)
    if (filters.type) query = query.eq('type', filters.type)
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
    if (filters.platformId) query = query.eq('platform_id', filters.platformId)
    if (filters.dateFrom) query = query.gte('occurred_on', filters.dateFrom)
    if (filters.dateTo) query = query.lte('occurred_on', filters.dateTo)

    const { data, error: dbError, count } = await query

    loading.value = false
    refreshing.value = false
    if (dbError) {
      // A background revalidation failure shouldn't blank out data the
      // user can already see — only surface the error if there was
      // nothing cached to fall back on.
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    items.value = (data as unknown as RawJoinedRow[]).map(flatten)
    total.value = count ?? items.value.length
    cache.set(key, { items: items.value, total: total.value })
  }

  async function get(id: string): Promise<{ data: TransactionWithLabels | null; error: NivaError | null }> {
    const { data, error: dbError } = await supabase.from('transactions').select(SELECT_WITH_LABELS).eq('id', id).single()

    if (dbError) return { data: null, error: toNivaError(dbError) }
    return { data: flatten(data as unknown as RawJoinedRow), error: null }
  }

  async function create(
    workspaceId: string,
    payload: TransactionPayload,
  ): Promise<{ data: Transaction | null; error: NivaError | null }> {
    const { data, error: dbError } = await supabase
      .from('transactions')
      .insert({ workspace_id: workspaceId, ...toDbFields(payload) })
      .select()
      .single()

    if (dbError) return { data: null, error: toNivaError(dbError) }
    cache.clear()
    revision.value++
    return { data, error: null }
  }

  // Optimistic concurrency: the WHERE clause only matches if the row is
  // still at the version the editor last saw. Zero rows back means someone
  // else changed it first — see docs/10-api-data-access-spec.md §4.
  async function update(
    id: string,
    payload: TransactionPayload,
    expectedUpdatedAt: string,
  ): Promise<{ data: Transaction | null; error: NivaError | null }> {
    const { data, error: dbError } = await supabase
      .from('transactions')
      .update(toDbFields(payload))
      .eq('id', id)
      .eq('updated_at', expectedUpdatedAt)
      .select()
      .maybeSingle()

    if (dbError) return { data: null, error: toNivaError(dbError) }
    if (!data) return { data: null, error: conflictError() }
    cache.clear()
    revision.value++
    return { data, error: null }
  }

  async function setStatus(
    id: string,
    status: 'active' | 'archived',
  ): Promise<{ data: Transaction | null; error: NivaError | null }> {
    const { data, error: dbError } = await supabase.from('transactions').update({ status }).eq('id', id).select().single()

    if (dbError) return { data: null, error: toNivaError(dbError) }
    cache.clear()
    revision.value++
    return { data, error: null }
  }

  return {
    items,
    total,
    loading,
    refreshing,
    error,
    /** Bumps on every successful mutation from *any* useTransactions()
     * caller — watch it to know when to refetch a list on screen. */
    revision,
    list,
    get,
    create,
    update,
    // "Delete" is always an archive in Release 1 — see
    // docs/07-domain-model-and-schema.md §3. Undo is a real un-archive,
    // not a promise the UI can't keep.
    archive: (id: string) => setStatus(id, 'archived'),
    unarchive: (id: string) => setStatus(id, 'active'),
  }
}
