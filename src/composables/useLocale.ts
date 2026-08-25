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

  // Room/task names are free text an admin types in (migration 0014's
  // name_si), not fixed UI strings — there's no translation service here,
  // just an optional second field. Falls back to the English/original name
  // whenever no Sinhala name was given, so this is always safe to call.
  function localizedName(name: string, nameSi: string | null | undefined): string {
    return locale.value === 'si' && nameSi ? nameSi : name
  }

  return { locale, setLocale, localizedName }
}
