import type { CurrencyTotal } from '@/composables/useReports'
import type { WorkspaceCurrencyRow } from '@/composables/useCurrencies'

export interface RateUsed {
  code: string
  rate: number
  updatedAt: string | null
}

export interface ApproxCombinedTotal {
  currencyCode: string
  income: number
  expenses: number
  net: number
  // Currencies that had activity this period but no admin-set rate — the
  // total below silently excludes them, so the UI must say so rather than
  // let an incomplete number pass as the full picture.
  missingRateCodes: string[]
  // The oldest reference_rate_updated_at among the rates actually used —
  // the most conservative "how stale could this be" signal to show.
  asOf: string | null
  // Every rate actually applied, so the UI (and the CSV export) can show
  // "1 USD ≈ 300 LKR" inline instead of sending the reader back to
  // Currencies admin to find out what was used — 2026-08-02, Jalie's wife's
  // feedback (also needed once report download exists, so the downloaded
  // file is self-explanatory on its own).
  ratesUsed: RateUsed[]
}

// This is the one place in the app that sums money client-side —
// deliberately, and only here. Every other total (docs/10-api-data-access-
// spec.md §2) is computed in Postgres to avoid floating-point drift in
// numbers that have to reconcile exactly with the transaction list. This
// number can never be exact: it's built from a manually-maintained,
// point-in-time approximate exchange rate (see migration 0010), so it's
// labeled "≈" everywhere it appears and JS float precision at that scale
// is well below the rate's own margin of error.
//
// Only meaningful once a period has activity in more than one currency —
// with just one, that currency's own total already *is* the full picture.
export function approxCombinedTotal(summary: CurrencyTotal[], currencyRows: WorkspaceCurrencyRow[]): ApproxCombinedTotal | null {
  if (summary.length <= 1) return null
  const defaultRow = currencyRows.find((r) => r.isDefault)
  if (!defaultRow) return null

  let income = 0
  let expenses = 0
  let asOf: string | null = null
  const missingRateCodes: string[] = []
  const ratesUsed: RateUsed[] = []

  for (const row of summary) {
    if (row.currencyCode === defaultRow.code) {
      income += Number(row.income)
      expenses += Number(row.expenses)
      continue
    }
    const rateRow = currencyRows.find((r) => r.code === row.currencyCode)
    const rate = rateRow?.referenceRateToDefault
    if (!rate) {
      missingRateCodes.push(row.currencyCode)
      continue
    }
    income += Number(row.income) * rate
    expenses += Number(row.expenses) * rate
    ratesUsed.push({ code: row.currencyCode, rate, updatedAt: rateRow.referenceRateUpdatedAt })
    if (rateRow.referenceRateUpdatedAt && (!asOf || rateRow.referenceRateUpdatedAt < asOf)) {
      asOf = rateRow.referenceRateUpdatedAt
    }
  }

  return { currencyCode: defaultRow.code, income, expenses, net: income - expenses, missingRateCodes, asOf, ratesUsed }
}
