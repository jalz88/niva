-- Language preference, made per-user instead of per-device (2026-08-31,
-- real-user feedback: Jalie expected the housekeeper's account to always
-- show Sinhala regardless of which physical device it's signed into, since
-- staff devices/phones can be shared or swapped). The original 2026-08-26
-- design deliberately chose per-device localStorage only, reasoning it
-- matched "the caretaker kiosk device" -- but a shared/rotating device is
-- exactly the case a per-device setting handles worst: whichever account
-- last touched the toggle on that device silently changes the language for
-- whoever signs in next. Storing it on the profile instead means signing in
-- as a given person always shows their own language, on any device.
alter table public.profiles
  add column locale text not null default 'en' check (locale in ('en', 'si'));

comment on column public.profiles.locale is
  'Per-user UI language preference (en/si). Client also caches the last-applied value in localStorage for instant first-paint before the profile loads, but this column is the source of truth on sign-in.';
