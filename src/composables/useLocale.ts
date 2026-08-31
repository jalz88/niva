import { i18n, LOCALE_STORAGE_KEY, type Locale } from '@/i18n'
import { supabase } from '@/lib/supabase'

// Per-user preference since migration 20260831090247 (profiles.locale) —
// changed 2026-08-31 from the original per-device-only design after
// real-user feedback: a shared/rotating staff device should show whoever's
// signed in *their* language, not whichever account last touched the
// toggle on that physical device. i18n/index.ts still reads the localStorage
// cache synchronously at startup so first paint is never wrong before the
// profile round-trip resolves (or at all, offline); useAuth's loadProfile
// is what applies the real per-user value once sign-in completes and
// refreshes that cache to match.
export function useLocale() {
  const locale = i18n.global.locale

  function setLocale(next: Locale) {
    locale.value = next
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
    // Fire-and-forget: the toggle should feel instant, and this is a
    // preference, not something the UI needs to block on or show an error
    // for if the write happens to fail (it'll just retry next time the
    // person flips the toggle, or the localStorage cache still gets them
    // the right language on this device in the meantime).
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      void supabase.from('profiles').update({ locale: next }).eq('id', data.user.id)
    })
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
