import dayjs from 'dayjs'

// Shared period vocabulary for Dashboard, Reports, and the Transactions
// filter panel — including the query-param encoding, so a drill-down link
// from Reports/Dashboard means the exact same period when Transactions
// reads it back out of the URL. 'all' only makes sense on the Transactions
// filter (Dashboard/Reports always show a bounded period so their totals
// are well-defined), but it lives in the same union rather than a separate
// type — see periodRange()'s return type for why that's simpler overall.
export type ReportPeriod = 'all' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'month' | 'range'

export interface PeriodSelection {
  period: ReportPeriod
  /** "YYYY-MM", used only when period === 'month'. */
  month?: string
  /** "YYYY-MM", inclusive bounds, used only when period === 'range'. */
  rangeFrom?: string
  rangeTo?: string
}

const MONTH_RE = /^\d{4}-\d{2}$/
const parseMonth = (month: string) => dayjs(`${month}-01`)

// dateFrom/dateTo come back undefined only for 'all' (no date filter at
// all) — callers that never offer that state (Dashboard, Reports) still see
// the optional type because it's one shared function, but in practice will
// never hit it; guard once, right after calling this, rather than
// threading a second "is this even boundable" check everywhere. A
// 'month'/'range' selection missing its value (e.g. a stale or hand-edited
// URL) falls back to 'this_month' instead — same as an unrecognized period
// — so the label and the actual query never disagree.
export function periodRange(selection: PeriodSelection): { dateFrom?: string; dateTo?: string } {
  const { period, month, rangeFrom, rangeTo } = selection

  if (period === 'all') return {}

  if (period === 'last_month') {
    const d = dayjs().subtract(1, 'month')
    return { dateFrom: d.startOf('month').format('YYYY-MM-DD'), dateTo: d.endOf('month').format('YYYY-MM-DD') }
  }
  if (period === 'this_year') {
    return { dateFrom: dayjs().startOf('year').format('YYYY-MM-DD'), dateTo: dayjs().endOf('year').format('YYYY-MM-DD') }
  }
  if (period === 'last_year') {
    const d = dayjs().subtract(1, 'year')
    return { dateFrom: d.startOf('year').format('YYYY-MM-DD'), dateTo: d.endOf('year').format('YYYY-MM-DD') }
  }
  if (period === 'month' && month && MONTH_RE.test(month)) {
    const d = parseMonth(month)
    return { dateFrom: d.startOf('month').format('YYYY-MM-DD'), dateTo: d.endOf('month').format('YYYY-MM-DD') }
  }
  if (period === 'range' && rangeFrom && rangeTo && MONTH_RE.test(rangeFrom) && MONTH_RE.test(rangeTo)) {
    let from = parseMonth(rangeFrom)
    let to = parseMonth(rangeTo)
    // The two month inputs are independent fields — nothing stops a user
    // (or a hand-edited URL) from putting the later month first. Swap
    // rather than silently return an empty/reversed range.
    if (from.isAfter(to)) [from, to] = [to, from]
    return { dateFrom: from.startOf('month').format('YYYY-MM-DD'), dateTo: to.endOf('month').format('YYYY-MM-DD') }
  }
  // 'this_month' and fallback
  return { dateFrom: dayjs().startOf('month').format('YYYY-MM-DD'), dateTo: dayjs().endOf('month').format('YYYY-MM-DD') }
}

export function periodLabel(selection: PeriodSelection): string {
  switch (selection.period) {
    case 'all':
      return 'All time'
    case 'last_month':
      return 'Last month'
    case 'this_year':
      return 'This year'
    case 'last_year':
      return 'Last year'
    case 'month':
      return selection.month && MONTH_RE.test(selection.month) ? parseMonth(selection.month).format('MMMM YYYY') : 'This month'
    case 'range':
      return selection.rangeFrom && selection.rangeTo && MONTH_RE.test(selection.rangeFrom) && MONTH_RE.test(selection.rangeTo)
        ? `${parseMonth(selection.rangeFrom).format('MMM YYYY')} – ${parseMonth(selection.rangeTo).format('MMM YYYY')}`
        : 'This month'
    default:
      return 'This month'
  }
}

// The immediately-preceding period of the same kind — for the Reports
// insight line (docs/12-ux-options-review.md A8/Part C, "Expenses were 12%
// higher than last month"), which needs a comparison period's numbers, not
// just the current one. Calendar-aware (a month/year back, not a fixed
// day-count) so "last month" means what it says across months of different
// lengths; a custom range has no calendar unit to step back by, so it falls
// back to an equal-length immediately-preceding window instead. Returns
// null for 'all' (Dashboard/Reports never select it, and "the period
// before all time" isn't a meaningful comparison anyway).
export function previousPeriodRange(selection: PeriodSelection): { dateFrom: string; dateTo: string; label: string } | null {
  const { period, month, rangeFrom, rangeTo } = selection

  if (period === 'this_month') {
    const d = dayjs().subtract(1, 'month')
    return { dateFrom: d.startOf('month').format('YYYY-MM-DD'), dateTo: d.endOf('month').format('YYYY-MM-DD'), label: 'last month' }
  }
  if (period === 'last_month') {
    const d = dayjs().subtract(2, 'month')
    return { dateFrom: d.startOf('month').format('YYYY-MM-DD'), dateTo: d.endOf('month').format('YYYY-MM-DD'), label: 'the month before' }
  }
  if (period === 'this_year') {
    const d = dayjs().subtract(1, 'year')
    return { dateFrom: d.startOf('year').format('YYYY-MM-DD'), dateTo: d.endOf('year').format('YYYY-MM-DD'), label: 'last year' }
  }
  if (period === 'last_year') {
    const d = dayjs().subtract(2, 'year')
    return { dateFrom: d.startOf('year').format('YYYY-MM-DD'), dateTo: d.endOf('year').format('YYYY-MM-DD'), label: 'the year before' }
  }
  if (period === 'month' && month && MONTH_RE.test(month)) {
    const d = parseMonth(month).subtract(1, 'month')
    return { dateFrom: d.startOf('month').format('YYYY-MM-DD'), dateTo: d.endOf('month').format('YYYY-MM-DD'), label: 'the previous month' }
  }
  if (period === 'range' && rangeFrom && rangeTo && MONTH_RE.test(rangeFrom) && MONTH_RE.test(rangeTo)) {
    let from = parseMonth(rangeFrom)
    let to = parseMonth(rangeTo)
    if (from.isAfter(to)) [from, to] = [to, from]
    const monthCount = to.diff(from, 'month') + 1
    return {
      dateFrom: from.subtract(monthCount, 'month').startOf('month').format('YYYY-MM-DD'),
      dateTo: from.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
      label: 'the previous period',
    }
  }
  return null
}

// Flattens a selection into router-query-safe string params for drill-down
// links (Reports/Dashboard -> Transactions) — vue-router query values must
// be strings, not nested objects.
export function periodQueryParams(selection: PeriodSelection): Record<string, string> {
  const params: Record<string, string> = { period: selection.period }
  if (selection.month) params.month = selection.month
  if (selection.rangeFrom) params.rangeFrom = selection.rangeFrom
  if (selection.rangeTo) params.rangeTo = selection.rangeTo
  return params
}

const VALID_PERIODS: ReportPeriod[] = ['all', 'this_month', 'last_month', 'this_year', 'last_year', 'month', 'range']

// Reconstructs a PeriodSelection from route.query. `allowAll` gates whether
// an 'all' value found in the URL is honoured — Dashboard/Reports never
// link to 'all' themselves, but without this a hand-edited URL could put
// them in a state their own period picker can't represent.
export function parsePeriodFromQuery(query: Record<string, unknown>, options: { allowAll?: boolean } = {}): PeriodSelection {
  const raw = typeof query.period === 'string' ? query.period : ''
  const candidates = options.allowAll ? VALID_PERIODS : VALID_PERIODS.filter((p) => p !== 'all')
  const period = (candidates as string[]).includes(raw) ? (raw as ReportPeriod) : 'this_month'
  const month = typeof query.month === 'string' ? query.month : undefined
  const rangeFrom = typeof query.rangeFrom === 'string' ? query.rangeFrom : undefined
  const rangeTo = typeof query.rangeTo === 'string' ? query.rangeTo : undefined
  return { period, month, rangeFrom, rangeTo }
}
