import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { TransactionWithLabels, Role } from '@/types/database'
import type { WorkspaceCurrencyRow } from '@/composables/useCurrencies'

dayjs.extend(relativeTime)

// Dashboard "attention strip" — docs/12-ux-options-review.md Part A2/C.1
// and B4/C.5. Deliberately not a notifications table: every item here is
// computed live from data that already exists, on every dashboard load.
// There's no "read" state and nothing to retain — an item just stops
// appearing the moment its underlying condition resolves (a fresher
// transaction gets entered, a rate gets updated). Recurring bills
// ("bill due soon") is the other trigger named in the original decision
// but isn't built yet (see roadmap item 2) — its item will slot in here
// once that feature exists, not require a redesign of the strip itself.
export interface AttentionStripItem {
  key: string
  text: string
  linkTo?: { name: string; params?: Record<string, string> }
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
      })
    }
  }
  return items
}
