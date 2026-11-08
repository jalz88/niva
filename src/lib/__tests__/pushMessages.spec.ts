import { describe, expect, it } from 'vitest'
import { housekeepingMessage, paymentsMessage, type Digest } from '../../../supabase/functions/send-push/messages'

const base: Digest = { payments_overdue: 0, payments_due_today: 0, rooms_to_clean: 0, checkouts_today: 0, tasks_open: 0 }

describe('push messages', () => {
  it('says nothing when there is nothing to say', () => {
    expect(paymentsMessage(base, 'en')).toBeNull()
    expect(housekeepingMessage(base, 'en')).toBeNull()
  })

  it('builds a payments message with both counts', () => {
    const m = paymentsMessage({ ...base, payments_overdue: 2, payments_due_today: 1 }, 'en')
    expect(m?.body).toBe('2 overdue · 1 due today')
    expect(m?.url).toBe('/recurring-payments')
  })

  it('pluralises housekeeping and links to Today', () => {
    expect(housekeepingMessage({ ...base, rooms_to_clean: 1 }, 'en')?.body).toBe('1 room to clean')
    const m = housekeepingMessage({ ...base, rooms_to_clean: 6, checkouts_today: 2 }, 'en')
    expect(m?.body).toBe('6 rooms to clean · 2 checkouts')
    expect(m?.url).toBe('/housekeeping/today')
  })

  it('localises to Sinhala', () => {
    const m = housekeepingMessage({ ...base, rooms_to_clean: 3 }, 'si')
    expect(m?.body).toContain('3')
    expect(m?.title).not.toBe('Housekeeping today')
  })
})
