import dayjs from 'dayjs'

// Dashboard and Reports share the same two reporting periods — Transactions
// has a third ("All time") and keeps its own local copy of this logic, but
// the values line up so a drill-down link's period query param means the
// same thing in both places.
export type ReportPeriod = 'this_month' | 'last_month'

export function periodRange(period: ReportPeriod): { dateFrom: string; dateTo: string } {
  if (period === 'last_month') {
    const lastMonth = dayjs().subtract(1, 'month')
    return { dateFrom: lastMonth.startOf('month').format('YYYY-MM-DD'), dateTo: lastMonth.endOf('month').format('YYYY-MM-DD') }
  }
  return { dateFrom: dayjs().startOf('month').format('YYYY-MM-DD'), dateTo: dayjs().endOf('month').format('YYYY-MM-DD') }
}

export function periodLabel(period: ReportPeriod): string {
  return period === 'last_month' ? 'Last month' : 'This month'
}
