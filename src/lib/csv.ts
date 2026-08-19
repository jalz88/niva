// Shared CSV helpers — RFC 4180-ish quoting/escaping and a generic
// browser-download trigger. Used by both Reports' export (reportCsv.ts)
// and Transactions' export (transactionCsv.ts) so the two features can't
// drift out of sync on quoting rules or the download mechanism.

// Quote a field only when it actually needs it, doubling any embedded
// quotes. Category/platform/supplier/notes are free text someone typed
// in, so this has to be correct, not just "good enough for demo data."
export function csvField(value: string | number): string {
  const str = String(value)
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
