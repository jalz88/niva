import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import { periodRange, periodLabel, periodQueryParams, parsePeriodFromQuery } from '@/lib/period'

describe('periodRange', () => {
  it('returns no date bounds for "all"', () => {
    expect(periodRange({ period: 'all' })).toEqual({})
  })

  it('returns the current month for "this_month"', () => {
    const { dateFrom, dateTo } = periodRange({ period: 'this_month' })
    expect(dateFrom).toBe(dayjs().startOf('month').format('YYYY-MM-DD'))
    expect(dateTo).toBe(dayjs().endOf('month').format('YYYY-MM-DD'))
  })

  it('returns the full current year for "this_year"', () => {
    const { dateFrom, dateTo } = periodRange({ period: 'this_year' })
    expect(dateFrom).toBe(dayjs().startOf('year').format('YYYY-MM-DD'))
    expect(dateTo).toBe(dayjs().endOf('year').format('YYYY-MM-DD'))
  })

  it('returns the full previous year for "last_year"', () => {
    const { dateFrom, dateTo } = periodRange({ period: 'last_year' })
    const lastYear = dayjs().subtract(1, 'year')
    expect(dateFrom).toBe(lastYear.startOf('year').format('YYYY-MM-DD'))
    expect(dateTo).toBe(lastYear.endOf('year').format('YYYY-MM-DD'))
  })

  it('returns the full named month for "month"', () => {
    const { dateFrom, dateTo } = periodRange({ period: 'month', month: '2026-03' })
    expect(dateFrom).toBe('2026-03-01')
    expect(dateTo).toBe('2026-03-31')
  })

  it('falls back to this month when "month" is missing its value', () => {
    const result = periodRange({ period: 'month' })
    expect(result.dateFrom).toBe(dayjs().startOf('month').format('YYYY-MM-DD'))
    expect(result.dateTo).toBe(dayjs().endOf('month').format('YYYY-MM-DD'))
  })

  it('spans a "range" from the first day of the start month to the last day of the end month', () => {
    const { dateFrom, dateTo } = periodRange({ period: 'range', rangeFrom: '2026-01', rangeTo: '2026-03' })
    expect(dateFrom).toBe('2026-01-01')
    expect(dateTo).toBe('2026-03-31')
  })

  it('swaps a reversed range instead of returning an empty span', () => {
    const { dateFrom, dateTo } = periodRange({ period: 'range', rangeFrom: '2026-03', rangeTo: '2026-01' })
    expect(dateFrom).toBe('2026-01-01')
    expect(dateTo).toBe('2026-03-31')
  })

  it('falls back to this month when "range" is missing a bound', () => {
    const result = periodRange({ period: 'range', rangeFrom: '2026-01' })
    expect(result.dateFrom).toBe(dayjs().startOf('month').format('YYYY-MM-DD'))
    expect(result.dateTo).toBe(dayjs().endOf('month').format('YYYY-MM-DD'))
  })
})

describe('periodLabel', () => {
  it('labels a specific month', () => {
    expect(periodLabel({ period: 'month', month: '2026-03' })).toBe('March 2026')
  })

  it('labels a custom range', () => {
    expect(periodLabel({ period: 'range', rangeFrom: '2026-01', rangeTo: '2026-03' })).toBe('Jan 2026 – Mar 2026')
  })

  it('labels "all" as "All time"', () => {
    expect(periodLabel({ period: 'all' })).toBe('All time')
  })
})

describe('periodQueryParams / parsePeriodFromQuery round-trip', () => {
  it('round-trips a "month" selection through query params', () => {
    const selection = { period: 'month' as const, month: '2026-03' }
    const parsed = parsePeriodFromQuery(periodQueryParams(selection))
    expect(parsed).toEqual(selection)
  })

  it('round-trips a "range" selection through query params', () => {
    const selection = { period: 'range' as const, rangeFrom: '2026-01', rangeTo: '2026-03' }
    const parsed = parsePeriodFromQuery(periodQueryParams(selection))
    expect(parsed).toEqual(selection)
  })

  it('drops "all" unless allowAll is set, defaulting to this_month', () => {
    const params = periodQueryParams({ period: 'all' })
    expect(parsePeriodFromQuery(params).period).toBe('this_month')
    expect(parsePeriodFromQuery(params, { allowAll: true }).period).toBe('all')
  })

  it('defaults to this_month for an unrecognized period value', () => {
    expect(parsePeriodFromQuery({ period: 'decade' }).period).toBe('this_month')
  })
})
