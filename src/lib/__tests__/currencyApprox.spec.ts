import { describe, it, expect } from 'vitest'
import { approxCombinedTotal } from '@/lib/currencyApprox'
import type { WorkspaceCurrencyRow } from '@/composables/useCurrencies'

function currencyRow(overrides: Partial<WorkspaceCurrencyRow>): WorkspaceCurrencyRow {
  return {
    code: 'LKR',
    name: 'Sri Lankan Rupee',
    enabled: true,
    isDefault: false,
    referenceRateToDefault: null,
    referenceRateUpdatedAt: null,
    ...overrides,
  }
}

describe('approxCombinedTotal', () => {
  it('returns null when only one currency has activity', () => {
    const rows = [currencyRow({ code: 'LKR', isDefault: true })]
    expect(approxCombinedTotal([{ currencyCode: 'LKR', income: '1000', expenses: '200', net: '800' }], rows)).toBeNull()
  })

  it('returns null when no default currency is configured', () => {
    const rows = [currencyRow({ code: 'LKR' }), currencyRow({ code: 'USD' })]
    const summary = [
      { currencyCode: 'LKR', income: '1000', expenses: '200', net: '800' },
      { currencyCode: 'USD', income: '10', expenses: '2', net: '8' },
    ]
    expect(approxCombinedTotal(summary, rows)).toBeNull()
  })

  it('converts a non-default currency using its reference rate and sums with the default', () => {
    const rows = [
      currencyRow({ code: 'LKR', isDefault: true }),
      currencyRow({ code: 'USD', referenceRateToDefault: 300, referenceRateUpdatedAt: '2026-08-01T00:00:00Z' }),
    ]
    const summary = [
      { currencyCode: 'LKR', income: '1000', expenses: '200', net: '800' },
      { currencyCode: 'USD', income: '10', expenses: '2', net: '8' },
    ]
    const result = approxCombinedTotal(summary, rows)
    expect(result).not.toBeNull()
    expect(result!.currencyCode).toBe('LKR')
    // 1000 + 10*300 = 4000, 200 + 2*300 = 800, net = 3200
    expect(result!.income).toBe(4000)
    expect(result!.expenses).toBe(800)
    expect(result!.net).toBe(3200)
    expect(result!.missingRateCodes).toEqual([])
    expect(result!.asOf).toBe('2026-08-01T00:00:00Z')
    expect(result!.ratesUsed).toEqual([{ code: 'USD', rate: 300, updatedAt: '2026-08-01T00:00:00Z' }])
  })

  it('flags a currency with no rate set instead of silently dropping or blocking the total', () => {
    const rows = [
      currencyRow({ code: 'LKR', isDefault: true }),
      currencyRow({ code: 'USD', referenceRateToDefault: 300, referenceRateUpdatedAt: '2026-08-01T00:00:00Z' }),
      currencyRow({ code: 'AED' }), // no rate set
    ]
    const summary = [
      { currencyCode: 'LKR', income: '1000', expenses: '0', net: '1000' },
      { currencyCode: 'USD', income: '10', expenses: '0', net: '10' },
      { currencyCode: 'AED', income: '50', expenses: '0', net: '50' },
    ]
    const result = approxCombinedTotal(summary, rows)
    expect(result!.missingRateCodes).toEqual(['AED'])
    // AED's 50 is excluded from the total since it has no rate
    expect(result!.income).toBe(1000 + 10 * 300)
    // AED never made it into ratesUsed since no rate was applied for it
    expect(result!.ratesUsed).toEqual([{ code: 'USD', rate: 300, updatedAt: '2026-08-01T00:00:00Z' }])
  })

  it('reports the oldest rate date among the ones actually used, as the more conservative signal', () => {
    const rows = [
      currencyRow({ code: 'LKR', isDefault: true }),
      currencyRow({ code: 'USD', referenceRateToDefault: 300, referenceRateUpdatedAt: '2026-08-01T00:00:00Z' }),
      currencyRow({ code: 'AED', referenceRateToDefault: 80, referenceRateUpdatedAt: '2026-06-15T00:00:00Z' }),
    ]
    const summary = [
      { currencyCode: 'USD', income: '10', expenses: '0', net: '10' },
      { currencyCode: 'AED', income: '50', expenses: '0', net: '50' },
    ]
    const result = approxCombinedTotal(summary, rows)
    expect(result!.asOf).toBe('2026-06-15T00:00:00Z')
  })
})
