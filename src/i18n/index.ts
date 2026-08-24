import { createI18n } from 'vue-i18n'
import en from './locales/en'
import si from './locales/si'

// Only the Housekeeping/Staff module has translations (2026-08-26 scope
// decision) — every other screen's strings stay hard-coded English in their
// templates, unaffected by this. Composition-API mode (legacy: false) plus
// globalInjection so plain $t(...) works directly in <template> without an
// explicit useI18n() import in every housekeeping SFC.
export type Locale = 'en' | 'si'

export const LOCALE_STORAGE_KEY = 'niva-locale'

// Read synchronously at module init (before any component renders), not
// lazily inside useLocale.ts — otherwise the first paint would briefly flash
// English (i18n's default) even when a Sinhala preference is already saved,
// since the stored preference would only get applied once a component that
// calls useLocale() (e.g. LanguageToggle) actually mounts.
function initialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored === 'si' ? 'si' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, si },
})
