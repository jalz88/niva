import { i18n, LOCALE_STORAGE_KEY, type Locale } from '@/i18n'

// Persisted client-side only (no schema field for it yet — this is a
// per-device preference, not a per-account one, matching how the caretaker
// kiosk device is used in practice). i18n/index.ts already reads the saved
// preference synchronously at startup so first paint is correct; this just
// exposes the reactive locale ref plus a setter that also persists it.
export function useLocale() {
  const locale = i18n.global.locale

  function setLocale(next: Locale) {
    locale.value = next
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  }

  return { locale, setLocale }
}
