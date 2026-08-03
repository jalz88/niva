import { describe, it, expect } from 'vitest'
import { buildReportCsv, reportCsvFilename } from '@/lib/reportCsv'
import type { ApproxCombinedTotal } from '@/lib/currencyApprox'

const baseInput = {
  periodLabel: 'This month',
  propertyLabel: 'All properties',
  generatedAt: new Date('2026-08-02T10:30:00Z'),
  summary: [{ currencyCode: 'LKR', income: '1000.00', expenses: '200.00', net: '800.00' }],
  approxTotal: null as ApproxCombinedTotal | null,
  platformRevenue: [{ currencyCode: 'LKR', platformId: 'p1', platformName: 'Airbnb', total: '500.00' }],
  categoryExpenses: [{ currencyCode: 'LKR', categoryId: 'c1', categoryName: 'Utilities', categoryIds: ['c1'], total: '200.00' }],
}

describe('buildReportCsv', () => {
  it('includes the period, property, and generated-at header', () => {
    const csv = buildReportCsv(baseInput)
    expect(csv).toContain('Period,This month')
    expect(csv).toContain('Property,All properties')
    // Quoted because the formatted value itself contains a comma; the exact
    // time depends on the machine's local timezone, so only the date part
    // (fixed regardless of TZ, since the source instant is midday UTC) is
    // pinned here.
    expect(csv).toMatch(/Generated,"2 Aug 2026, \d{2}:\d{2}"/)
  })

  it('lists totals by currency', () => {
    const csv = buildReportCsv(baseInput)
    expect(csv).toContain('Totals by currency')
    expect(csv).toContain('LKR,1000.00,200.00,800.00')
  })

  it('lists revenue by platform and expenses by category', () => {
    const csv = buildReportCsv(baseInput)
    expect(csv).toContain('Revenue by platform')
    expect(csv).toContain('LKR,Airbnb,500.00')
    expect(csv).toContain('Expenses by category')
    expect(csv).toContain('LKR,Utilities,200.00')
  })

  it('omits the approximate-total section entirely when there is nothing to combine', () => {
    const csv = buildReportCsv(baseInput)
    expect(csv).not.toContain('Approximate combined total')
  })

  it('includes the approximate total and the rates used when present', () => {
    const approxTotal: ApproxCombinedTotal = {
      currencyCode: 'LKR',
      income: 4000,
      expenses: 800,
      net: 3200,
      missingRateCodes: [],
      asOf: '2026-08-01T00:00:00Z',
      ratesUsed: [{ code: 'USD', rate: 300, updatedAt: '2026-08-01T00:00:00Z' }],
    }
    const csv = buildReportCsv({ ...baseInput, approxTotal })
    expect(csv).toContain('Approximate combined total (LKR)')
    expect(csv).toContain('4000.00,800.00,3200.00')
    expect(csv).toContain('Rate used,1 USD = 300.00 LKR,set 1 Aug 2026')
  })

  it('calls out currencies excluded from the approximate total for lack of a rate', () => {
    const approxTotal: ApproxCombinedTotal = {
      currencyCode: 'LKR',
      income: 1000,
      expenses: 0,
      net: 1000,
      missingRateCodes: ['AED'],
      asOf: null,
      ratesUsed: [],
    }
    const csv = buildReportCsv({ ...baseInput, approxTotal })
    expect(csv).toContain('Not included above (no rate set),AED')
  })

  it('quotes a field containing a comma', () => {
    const csv = buildReportCsv({
      ...baseInput,
      categoryExpenses: [{ currencyCode: 'LKR', categoryId: 'c1', categoryName: 'Repairs, plumbing', categoryIds: ['c1'], total: '50.00' }],
    })
    expect(csv).toContain('"Repairs, plumbing"')
  })

  it('doubles embedded quotes inside a quoted field', () => {
    const csv = buildReportCsv({
      ...baseInput,
      platformRevenue: [{ currencyCode: 'LKR', platformId: 'p1', platformName: 'Bob"s Bookings', total: '50.00' }],
    })
    expect(csv).toContain('"Bob""s Bookings"')
  })
})

describe('reportCsvFilename', () => {
  it('slugifies the period label and appends the generated date', () => {
    expect(reportCsvFilename('This month', new Date('2026-08-02T10:30:00Z'))).toBe('niva-report-this-month-2026-08-02.csv')
  })

  it('slugifies a custom range label with punctuation', () => {
    expect(reportCsvFilename('Jan 2026 – Mar 2026', new Date('2026-08-02T10:30:00Z'))).toBe(
      'niva-report-jan-2026-mar-2026-2026-08-02.csv',
    )
  })
})
