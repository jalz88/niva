import type { CurrencyTotal, CategoryExpenseRow } from '@/composables/useReports'
import type { WorkspaceCurrencyRow } from '@/composables/useCurrencies'
import { approxCombinedTotal } from './currencyApprox'

export interface ReportInsight {
  text: string
  direction: 'up' | 'down' | 'flat'
}

// Cheap, client-side "how are we trending" line — docs/12-ux-options-
// review.md A8/Part C ("Expenses were 12% higher than last month, mostly
// Utilities"). Reuses the RPCs Reports already calls, just for a second
// (comparison) period — no new data model. Deliberately conservative:
// skips rather than guesses when the comparison isn't clean, e.g. no prior-
// period expenses to compare against at all.
export function buildReportInsight(
  currentSummary: CurrencyTotal[],
  previousSummary: CurrencyTotal[],
  currentCategoryExpenses: CategoryExpenseRow[],
  previousCategoryExpenses: CategoryExpenseRow[],
  currencyRows: WorkspaceCurrencyRow[],
  previousLabel: string,
): ReportInsight | null {
  const currentTotal = totalExpenses(currentSummary, currencyRows)
  const previousTotal = totalExpenses(previousSummary, currencyRows)
  // previousTotal <= 0: nothing to meaningfully compare against (division
  // by zero, or "infinitely higher than nothing" isn't a useful sentence) —
  // skip rather than force a number.
  if (currentTotal === null || previousTotal === null || previousTotal <= 0) return null

  const pctChange = ((currentTotal - previousTotal) / previousTotal) * 100
  const direction: ReportInsight['direction'] = pctChange > 1 ? 'up' : pctChange < -1 ? 'down' : 'flat'

  if (direction === 'flat') {
    return { text: `Expenses were about the same as ${previousLabel}.`, direction }
  }

  // The category breakdown is only meaningful within one currency —
  // comparing category totals across currencies would mix figures the same
  // way an un-approximated mixed-currency total would. Left off (not
  // guessed at) once a period has more than one currency in play.
  const singleCurrency = currentSummary.length === 1 ? (currentSummary[0]?.currencyCode ?? null) : null
  const topCategory = singleCurrency ? topMover(currentCategoryExpenses, previousCategoryExpenses, singleCurrency, direction) : null

  const pctText = `${Math.round(Math.abs(pctChange))}%`
  const comparisonText = direction === 'up' ? `${pctText} higher than ${previousLabel}` : `${pctText} lower than ${previousLabel}`
  const text = topCategory ? `Expenses were ${comparisonText}, mostly ${topCategory}.` : `Expenses were ${comparisonText}.`
  return { text, direction }
}

function totalExpenses(summary: CurrencyTotal[], currencyRows: WorkspaceCurrencyRow[]): number | null {
  if (summary.length === 0) return 0
  if (summary.length === 1) return summary[0] ? Number(summary[0].expenses) : 0
  // More than one currency: approxCombinedTotal already handles this the
  // same way the Dashboard/Reports totals do (an admin-set reference rate
  // per currency) — returns null if a rate is missing, in which case the
  // insight is skipped rather than built from an incomplete sum.
  return approxCombinedTotal(summary, currencyRows)?.expenses ?? null
}

// Which category moved the total the most, in the same direction as the
// overall change — the thing actually worth naming in "mostly Utilities."
function topMover(current: CategoryExpenseRow[], previous: CategoryExpenseRow[], currencyCode: string, direction: 'up' | 'down'): string | null {
  const previousByCategory = new Map(previous.filter((r) => r.currencyCode === currencyCode).map((r) => [r.categoryId, Number(r.total)]))
  let best: { name: string; delta: number } | null = null
  for (const row of current.filter((r) => r.currencyCode === currencyCode)) {
    const delta = Number(row.total) - (previousByCategory.get(row.categoryId) ?? 0)
    const relevant = direction === 'up' ? delta > 0 : delta < 0
    if (relevant && (!best || Math.abs(delta) > Math.abs(best.delta))) best = { name: row.categoryName, delta }
  }
  return best?.name ?? null
}
