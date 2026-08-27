// Shared CSV helpers — RFC 4180-ish quoting/escaping and a generic
// browser-download trigger. Used by both Reports' export (reportCsv.ts)
// and Transactions' export (transactionCsv.ts) so the two features can't
// drift out of sync on quoting rules or the download mechanism.

// Security fix (white-hat audit, 2026-08-27): a free-text field (notes,
// supplier/category name) that starts with =, +, -, @, or a tab/CR is
// interpreted as a formula by Excel/Google Sheets when the CSV is opened —
// "CSV injection." Any workspace member with transaction-entry access
// (administrator/manager/staff) could plant a payload like
// =HYPERLINK("https://evil.example","click") in a note, which would then
// silently execute as a live formula for whoever opens the export.
// Mitigation: prefix a leading quote so spreadsheet apps treat it as
// literal text, not a formula — the standard fix for this class of issue.
// Genuine negative numbers (e.g. a report's "Net" column when expenses
// exceed income) also start with one of these characters, so a plain
// -123.45-shaped string is deliberately exempted — only something that
// isn't just a number gets the literal-text prefix.
const FORMULA_TRIGGER_CHARS = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

// Quote a field only when it actually needs it, doubling any embedded
// quotes. Category/platform/supplier/notes are free text someone typed
// in, so this has to be correct, not just "good enough for demo data."
export function csvField(value: string | number): string {
  let str = String(value)
  if (FORMULA_TRIGGER_CHARS.test(str) && !PLAIN_NUMBER.test(str)) str = `'${str}`
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(',') + '\r\n'
}

// Actual browser download trigger — kept separate from the CSV-building
// functions so those stay pure, unit-testable functions with no DOM
// dependency.
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
