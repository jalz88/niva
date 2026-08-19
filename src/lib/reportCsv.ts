import dayjs from 'dayjs'
import type { CurrencyTotal, PlatformRevenueRow, CategoryExpenseRow } from '@/composables/useReports'
import type { ApproxCombinedTotal } from '@/lib/currencyApprox'
import { csvRow } from '@/lib/csv'

export interface ReportCsvInput {
  periodLabel: string
  propertyLabel: string
  generatedAt: Date
  summary: CurrencyTotal[]
  approxTotal: ApproxCombinedTotal | null
  platformRevenue: PlatformRevenueRow[]
  categoryExpenses: CategoryExpenseRow[]
}

// Several sections with different column shapes, one after another with a
// blank line between — not a single tidy table, but every spreadsheet app
// opens it fine and each section reads clearly on its own. Good enough for
// "download the numbers," which is what was actually asked for; a
// per-transaction export (already on the roadmap) is a separate, bigger
// feature if a real single-table format is ever needed.
export function buildReportCsv(input: ReportCsvInput): string {
  let csv = ''
  csv += csvRow(['NIVA report'])
  csv += csvRow(['Period', input.periodLabel])
  csv += csvRow(['Property', input.propertyLabel])
  csv += csvRow(['Generated', dayjs(input.generatedAt).format('D MMM YYYY, HH:mm')])
  csv += '\r\n'

  csv += csvRow(['Totals by currency'])
  csv += csvRow(['Currency', 'Income', 'Expenses', 'Net'])
  for (const s of input.summary) {
    csv += csvRow([s.currencyCode, s.income, s.expenses, s.net])
  }
  csv += '\r\n'

  if (input.approxTotal) {
    const t = input.approxTotal
    csv += csvRow([`Approximate combined total (${t.currencyCode})`])
    csv += csvRow(['Income', 'Expenses', 'Net'])
    csv += csvRow([t.income.toFixed(2), t.expenses.toFixed(2), t.net.toFixed(2)])
    for (const r of t.ratesUsed) {
      csv += csvRow([
        'Rate used',
        `1 ${r.code} = ${r.rate.toFixed(2)} ${t.currencyCode}`,
        r.updatedAt ? `set ${dayjs(r.updatedAt).format('D MMM YYYY')}` : 'set date unknown',
      ])
    }
    if (t.missingRateCodes.length) {
      csv += csvRow(['Not included above (no rate set)', t.missingRateCodes.join(', ')])
    }
    csv += '\r\n'
  }

  csv += csvRow(['Revenue by platform'])
  csv += csvRow(['Currency', 'Platform', 'Total'])
  for (const p of input.platformRevenue) {
    csv += csvRow([p.currencyCode, p.platformName, p.total])
  }
  csv += '\r\n'

  csv += csvRow(['Expenses by category'])
  csv += csvRow(['Currency', 'Category', 'Total'])
  for (const c of input.categoryExpenses) {
    csv += csvRow([c.currencyCode, c.categoryName, c.total])
  }

  return csv
}

export function reportCsvFilename(periodLabel: string, generatedAt: Date): string {
  const slug =
    periodLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report'
  return `niva-report-${slug}-${dayjs(generatedAt).format('YYYY-MM-DD')}.csv`
}

// Re-exported so existing imports (ReportsView.vue) keep working —
// downloadTextFile now lives in src/lib/csv.ts, shared with
// transactionCsv.ts's export.
export { downloadTextFile } from '@/lib/csv'
