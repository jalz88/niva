import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { RecurringPayment, RecurringPaymentWithLabels } from '@/types/database'

export interface RecurringPaymentPayload {
  propertyId: string
  name: string
  categoryId: string
  paymentMethodId: string
  currencyCode: string
  amount: string
  cadenceType: 'monthly' | 'weekly'
  cadenceDayOfMonth: number | null
  cadenceDayOfWeek: number | null
  nextDueOn: string
  notes?: string
}

interface RawJoinedRow extends RecurringPayment {
  categories: { name: string } | null
  payment_methods: { name: string } | null
}

const SELECT_WITH_LABELS = `*, categories ( name ), payment_methods ( name )`

function flatten(row: RawJoinedRow): RecurringPaymentWithLabels {
  const { categories, payment_methods, ...rest } = row
  return {
    ...rest,
    amount: String(rest.amount),
    category_name: categories?.name ?? '',
    payment_method_name: payment_methods?.name ?? '',
  }
}

function toDbFields(payload: RecurringPaymentPayload) {
  return {
    property_id: payload.propertyId,
    name: payload.name,
    category_id: payload.categoryId,
    payment_method_id: payload.paymentMethodId,
    currency_code: payload.currencyCode,
    amount: payload.amount,
    cadence_type: payload.cadenceType,
    cadence_day_of_month: payload.cadenceDayOfMonth,
    cadence_day_of_week: payload.cadenceDayOfWeek,
    next_due_on: payload.nextDueOn,
    notes: payload.notes || null,
  }
}

// Bumped on create/update/delete/markPaid — mirrors useTransactions.ts's
// `revision`, so Dashboard's attention strip (which reads this list for
// the "due soon" item) can refetch without polling.
const revision = ref(0)

// Small, infrequently-changed list — a session cache keyed by workspaceId
// avoids the loading-skeleton flash on repeat visits, same reasoning as
// useConfigItems.ts, without needing per-filter/page keys since there's
// no filtering or pagination here.
const cache = new Map<string, RecurringPaymentWithLabels[]>()

export function useRecurringPayments() {
  const items = ref<RecurringPaymentWithLabels[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cached = cache.get(workspaceId)
    if (cached) {
      items.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    const { data, error: dbError } = await supabase
      .from('recurring_payments')
      .select(SELECT_WITH_LABELS)
      .eq('workspace_id', workspaceId)
      .order('next_due_on')

    loading.value = false
    if (dbError) {
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    items.value = (data as unknown as RawJoinedRow[]).map(flatten)
    cache.set(workspaceId, items.value)
  }

  async function create(workspaceId: string, payload: RecurringPaymentPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('recurring_payments')
      .insert({ workspace_id: workspaceId, ...toDbFields(payload) })

    if (dbError) return toNivaError(dbError)
    cache.delete(workspaceId)
    revision.value++
    return null
  }

  async function update(id: string, workspaceId: string, payload: RecurringPaymentPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('recurring_payments').update(toDbFields(payload)).eq('id', id)

    if (dbError) return toNivaError(dbError)
    cache.delete(workspaceId)
    revision.value++
    return null
  }

  // "Delete this payment" — a hard delete of the reminder definition
  // itself, not an archive. transactions.recurring_payment_id is
  // ON DELETE SET NULL (migration 0011), so anything already logged from
  // it stays exactly as it was; only future reminders stop.
  async function remove(id: string, workspaceId: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('recurring_payments').delete().eq('id', id)

    if (dbError) return toNivaError(dbError)
    cache.delete(workspaceId)
    revision.value++
    return null
  }

  // Atomic: inserts the real expense transaction and advances next_due_on
  // from the *scheduled* date (not `occurredOn`), so paying a few days
  // early or late never drifts the future schedule — see
  // mark_recurring_payment_paid() in migration 0011.
  async function markPaid(
    workspaceId: string,
    id: string,
    amount: string,
    occurredOn: string,
    notes: string,
  ): Promise<{ transactionId: string | null; error: NivaError | null }> {
    const { data, error: dbError } = await supabase.rpc('mark_recurring_payment_paid', {
      p_recurring_payment_id: id,
      p_amount: amount,
      p_occurred_on: occurredOn,
      p_notes: notes || null,
    })

    if (dbError) return { transactionId: null, error: toNivaError(dbError) }
    cache.delete(workspaceId)
    revision.value++
    return { transactionId: data as string, error: null }
  }

  return { items, loading, error, revision, list, create, update, remove, markPaid }
}
