import dayjs, { type Dayjs } from 'dayjs'
import type { RecurringPaymentCadence } from '@/types/database'

// Shared date math for Recurring payments — used both when creating a new
// payment (initial next_due_on) and in RecurringPaymentsView when editing
// a payment's cadence (the due date needs to move to match). The server
// side (mark_recurring_payment_paid, migration 0011) has its own copy of
// the monthly clamp-to-end-of-month logic for advancing after a payment —
// duplicated deliberately, since one runs in SQL against the *previous*
// due date and this one runs in JS against *today*, for a different
// purpose (initial scheduling, not advancing an existing schedule).
export function computeNextDueOn(
  cadenceType: RecurringPaymentCadence,
  cadenceDayOfMonth: number | null,
  cadenceDayOfWeek: number | null,
  from: Dayjs = dayjs(),
): string {
  const today = from.startOf('day')

  if (cadenceType === 'weekly' && cadenceDayOfWeek !== null) {
    const diff = (cadenceDayOfWeek - today.day() + 7) % 7
    return today.add(diff, 'day').format('YYYY-MM-DD')
  }

  if (cadenceType === 'monthly' && cadenceDayOfMonth !== null) {
    let candidate = today.date(Math.min(cadenceDayOfMonth, today.daysInMonth()))
    if (candidate.isBefore(today, 'day')) {
      const nextMonth = today.add(1, 'month')
      candidate = nextMonth.date(Math.min(cadenceDayOfMonth, nextMonth.daysInMonth()))
    }
    return candidate.format('YYYY-MM-DD')
  }

  return today.format('YYYY-MM-DD')
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function cadenceLabel(cadenceType: RecurringPaymentCadence, cadenceDayOfMonth: number | null, cadenceDayOfWeek: number | null): string {
  if (cadenceType === 'weekly' && cadenceDayOfWeek !== null) {
    return `Weekly on ${WEEKDAY_NAMES[cadenceDayOfWeek]}`
  }
  if (cadenceType === 'monthly' && cadenceDayOfMonth !== null) {
    return `Monthly on day ${cadenceDayOfMonth}`
  }
  return ''
}

export { WEEKDAY_NAMES }

// Drives the Overdue/Upcoming grouping and each card's due-date caption on
// RecurringPaymentsView. `today` is injectable for testing.
export function dueLabel(nextDueOn: string, today: Dayjs = dayjs()): { status: 'overdue' | 'upcoming'; label: string } {
  const due = dayjs(nextDueOn).startOf('day')
  const diff = due.diff(today.startOf('day'), 'day')

  if (diff < 0) {
    const days = Math.abs(diff)
    return { status: 'overdue', label: `${days} day${days === 1 ? '' : 's'} overdue` }
  }
  if (diff === 0) return { status: 'upcoming', label: 'Due today' }
  if (diff === 1) return { status: 'upcoming', label: 'Due tomorrow' }
  return { status: 'upcoming', label: `Due in ${diff} days` }
}
