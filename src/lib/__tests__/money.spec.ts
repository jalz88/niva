import { describe, it, expect } from 'vitest'
import { formatMoney, formatSignedMoney } from '@/lib/money'

describe('formatMoney', () => {
  it('formats a decimal string with the currency code', () => {
    expect(formatMoney('4500.00', 'LKR')).toContain('4,500.00')
    expect(formatMoney('4500.00', 'LKR')).toContain('LKR')
  })
})

describe('formatSignedMoney', () => {
  it('prefixes income with a plus sign', () => {
    expect(formatSignedMoney('100.00', 'USD', 'income')).toMatch(/^\+/)
  })

  it('prefixes expense with a minus sign', () => {
    expect(formatSignedMoney('100.00', 'USD', 'expense')).toMatch(/^−/)
  })
})
