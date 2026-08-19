import dayjs from 'dayjs'
import { csvRow } from '@/lib/csv'

// One row per transaction, ready to hand straight to buildTransactionCsv —
// category is pre-formatted by the caller (TransactionsView's own
// categoryDisplay(), "Parent · Sub-category") so the export names things
// exactly the way the on-screen list already does, rather than this file
// re-deriving the category tree itself.
export interface TransactionCsvRow {
  date: string
  type: 'Income' | 'Expense'
  category: string
  property: string
  paymentMethod: string
  platform: string
  supplier: string
  amount: string
  currency: string
  notes: string
}

// docs/12-ux-options-review.md B.1/C.4 — "Download" on the Transactions
// list itself, exporting exactly whatever filters are currently applied.
// filterSummary is a plain-language description of those filters (e.g.
// "This month · Expense · Utilities"), shown at the top of the file so
// the export is self-describing without needing NIVA open to make sense
// of it later.
export function buildTransactionCsv(filterSummary: string, generatedAt: Date, rows: TransactionCsvRow[]): string {
  let csv = ''
  csv += csvRow(['NIVA transactions'])
  csv += csvRow(['Filters', filterSummary])
  csv += csvRow(['Generated', dayjs(generatedAt).format('D MMM YYYY, HH:mm')])
  csv += csvRow(['Rows', rows.length])
  csv += '\r\n'

  csv += csvRow(['Date', 'Type', 'Category', 'Property', 'Payment method', 'Platform', 'Supplier', 'Amount', 'Currency', 'Notes'])
  for (const r of rows) {
    csv += csvRow([r.date, r.type, r.category, r.property, r.paymentMethod, r.platform, r.supplier, r.amount, r.currency, r.notes])
  }

  return csv
}

export function transactionCsvFilename(generatedAt: Date): string {
  return `niva-transactions-${dayjs(generatedAt).format('YYYY-MM-DD-HHmm')}.csv`
}
