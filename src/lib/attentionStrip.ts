import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { TransactionWithLabels, Role } from '@/types/database'
import type { WorkspaceCurrencyRow } from '@/composables/useCurrencies'
import type { TodaySummary } from '@/composables/useHousekeepingReports'
import { dueLabel } from './recurringPayments'

dayjs.extend(relativeTime)

// Dashboard "attention strip" — docs/12-ux-options-review.md Part A2/C.1
// and B4/C.5. Deliberately not a notifications table: every item here is
// computed live from data that already exists, on every dashboard load.
// There's no "read" state and nothing to retain — an item just stops
// appearing the moment its underlying condition resolves (a fresher
// transaction gets entered, a rate gets updated, a payment gets marked
// paid).
// 'warning' = something's actually overdue/broken, right now (red).
// 'notice' = worth a glance soon, not urgent yet (amber). 'neutral'
// (default when omitted) = purely informational, e.g. "Last entry."
// 2026-08-24: added after Jalie asked for overdue items to stand out —
// previously every strip item rendered identically regardless of urgency.
export type AttentionTone = 'neutral' | 'notice' | 'warning'

export interface AttentionStripItem {
  key: string
  text: string
  linkTo?: { name: string; params?: Record<string, string> }
  tone?: AttentionTone
}

const STALE_RATE_DAYS = 30

// "How recently did anyone touch this workspace" — a quiet pulse-check,
// not an alert. Deliberately the single most recent transaction overall
// (not scoped to Dashboard's current-month period): a workspace that's
// active but happens to be early in a new month shouldn't read as
// abandoned just because "this month" is thin so far.
export function buildLastEntryItem(latest: TransactionWithLabels | null): AttentionStripItem | null {
  if (!latest) return null
  const verb = latest.type === 'income' ? 'income' : 'expense'
  return {
    key: 'last-entry',
    text: `Last entry: ${latest.category_name} ${verb}, ${dayjs(latest.created_at).fromNow()}`,
    linkTo: { name: 'transaction-detail', params: { id: latest.id } },
  }
}

// A currency's reference rate (used only for the approximate combined
// total, migration 0010) going stale is silent otherwise — nothing else
// on Dashboard/Reports would ever surface it, since the approx total just
// keeps using whatever rate was last set. Only administrators can update
// it (Currencies admin), so this is the one strip item gated by role —
// showing it to someone who can't act on it would just be noise.
export function buildStaleRateItems(currencyRows: WorkspaceCurrencyRow[], role: Role | null, now: Date = new Date()): AttentionStripItem[] {
  if (role !== 'administrator') return []
  const items: AttentionStripItem[] = []
  for (const row of currencyRows) {
    if (!row.enabled || row.isDefault || row.referenceRateToDefault == null || !row.referenceRateUpdatedAt) continue
    const daysSince = dayjs(now).diff(dayjs(row.referenceRateUpdatedAt), 'day')
    if (daysSince >= STALE_RATE_DAYS) {
      items.push({
        key: `stale-rate-${row.code}`,
        text: `${row.code} exchange rate hasn't been updated in ${daysSince} days`,
        linkTo: { name: 'administration-currencies' },
        tone: 'notice',
      })
    }
  }
  return items
}

export interface DuePaymentSource {
  id: string
  name: string
  next_due_on: string
}

// A recurring payment (bill or staff wage, migration 0011) that's overdue
// or due within this many days — same reasoning as buildStaleRateItems,
// tight enough that a normal workspace with a handful of payments doesn't
// see the strip get noisy. Manager/administrator only, matching the
// table's own RLS (staff/viewer can't act on this, so it isn't shown).
const DUE_SOON_DAYS = 3

export function buildDuePaymentItems(payments: DuePaymentSource[], role: Role | null, now: Date = new Date()): AttentionStripItem[] {
  if (role !== 'administrator' && role !== 'manager') return []
  const today = dayjs(now).startOf('day')
  const items: AttentionStripItem[] = []

  for (const payment of payments) {
    const diffDays = dayjs(payment.next_due_on).startOf('day').diff(today, 'day')
    if (diffDays > DUE_SOON_DAYS) continue
    const { status, label } = dueLabel(payment.next_due_on, today)
    items.push({
      key: `due-payment-${payment.id}`,
      text: `${payment.name} — ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
      linkTo: { name: 'recurring-payments' },
      tone: status === 'overdue' ? 'warning' : 'notice',
    })
  }
  return items
}

// housekeeping_completion_summary's today row (useHousekeepingReports.ts) —
// the single-glance "how's today going" ask from 2026-08-23. Quiet once
// everything's done, same "no news is good news" reasoning as the rest of
// this strip; shows every day it isn't, which is expected and useful right
// up until the last room's checked off. Gated to administrator/manager —
// its link goes to housekeeping-schedule, which is role-gated the same way
// (viewer would just bounce straight back), and staff never reaches
// Dashboard at all (kiosk mode, see AppShell.vue).
export function buildHousekeepingAttentionItem(today: TodaySummary | null, role: Role | null): AttentionStripItem | null {
  if (role !== 'administrator' && role !== 'manager') return null
  if (!today || today.total === 0 || today.pct === 100) return null
  return {
    key: 'housekeeping-today',
    text: `Housekeeping: ${today.done} of ${today.total} rooms done today (${today.pct}%)`,
    linkTo: { name: 'housekeeping-schedule' },
  }
}
