// Pure message-building for the morning push — no Deno/Supabase imports so
// it can be unit-tested under Vitest (src/lib/__tests__ imports this file).

export type Locale = 'en' | 'si'

export interface Digest {
  payments_overdue: number
  payments_due_today: number
  rooms_to_clean: number
  checkouts_today: number
  tasks_open: number
}

export interface PushMessage {
  title: string
  body: string
  url: string
  tag: string
}

const T = {
  en: {
    payTitle: 'Payments',
    overdue: (n: number) => `${n} overdue`,
    dueToday: (n: number) => `${n} due today`,
    hkTitle: 'Housekeeping today',
    rooms: (n: number) => `${n} ${n === 1 ? 'room' : 'rooms'} to clean`,
    checkouts: (n: number) => `${n} ${n === 1 ? 'checkout' : 'checkouts'}`,
  },
  si: {
    payTitle: 'ගෙවීම්',
    overdue: (n: number) => `ප්‍රමාද වූ ${n}`,
    dueToday: (n: number) => `අද ගෙවිය යුතු ${n}`,
    hkTitle: 'අද නිවාස සේවය',
    rooms: (n: number) => `පිරිසිදු කළ යුතු කාමර ${n}`,
    checkouts: (n: number) => `පිටවීම් ${n}`,
  },
} as const

/** Payments message, or null when there is nothing to say. */
export function paymentsMessage(d: Digest, locale: Locale): PushMessage | null {
  if (d.payments_overdue <= 0 && d.payments_due_today <= 0) return null
  const t = T[locale]
  const parts: string[] = []
  if (d.payments_overdue > 0) parts.push(t.overdue(d.payments_overdue))
  if (d.payments_due_today > 0) parts.push(t.dueToday(d.payments_due_today))
  return { title: t.payTitle, body: parts.join(' · '), url: '/recurring-payments', tag: 'niva-payments' }
}

/** Housekeeping message, or null when nothing needs doing today. */
export function housekeepingMessage(d: Digest, locale: Locale): PushMessage | null {
  if (d.rooms_to_clean <= 0 && d.checkouts_today <= 0) return null
  const t = T[locale]
  const parts: string[] = []
  if (d.rooms_to_clean > 0) parts.push(t.rooms(d.rooms_to_clean))
  if (d.checkouts_today > 0) parts.push(t.checkouts(d.checkouts_today))
  return { title: t.hkTitle, body: parts.join(' · '), url: '/housekeeping/today', tag: 'niva-housekeeping' }
}
