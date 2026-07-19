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
