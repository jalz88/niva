// Amounts are transported as strings (see docs/10-api-data-access-spec.md
// §2) and only ever formatted for display here — never summed or averaged
// in JavaScript. All aggregation happens in the Postgres RPC functions in
// docs/10-api-data-access-spec.md §2.

export function formatMoney(amount: string, currencyCode: string): string {
  const value = Number(amount)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'code',
  }).format(value)
}

export function formatSignedMoney(amount: string, currencyCode: string, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '−'
  return `${sign} ${formatMoney(amount, currencyCode)}`
}

// ---- Amount-field input helpers -------------------------------------------
// The Quick Add/Edit amount field (TransactionForm.vue) shows thousands
// separators while typing ("10000" -> "10,000") but must still hand the
// zod schema a plain "1500" / "1500.00" string (see
// src/lib/schemas/transaction.ts's regex — no commas allowed). These two
// functions are the split: cleanAmountInput() is what actually gets stored
// in the form/submitted to the API; formatAmountInput() is only ever used
// to decide what the input element displays.

// Strips everything but digits and a single decimal point, and caps
// decimals at 2 digits — normalizes whatever the user just typed/pasted
// (which may include commas from formatAmountInput's own display value)
// back down to a raw numeric string.
export function cleanAmountInput(raw: string): string {
  let value = raw.replace(/[^\d.]/g, '')
  const firstDot = value.indexOf('.')
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '')
  }
  const [intPart, decPart] = value.split('.')
  if (decPart !== undefined) {
    value = `${intPart}.${decPart.slice(0, 2)}`
  }
  return value
}

// Adds thousands separators to a raw amount string for display while
// typing, e.g. "10000" -> "10,000", "3550.56" -> "3,550.56". Keeps a
// trailing "." (e.g. "10000." -> "10,000.") so it doesn't disappear out
// from under the user mid-keystroke while they're about to type decimals.
export function formatAmountInput(raw: string): string {
  if (!raw) return ''
  const [intPart, decPart] = raw.split('.')
  const groupedInt = (intPart ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (decPart === undefined) {
    return raw.endsWith('.') ? `${groupedInt}.` : groupedInt
  }
  return `${groupedInt}.${decPart}`
}
