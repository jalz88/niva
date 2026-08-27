# Owner acceptance session — script

For task #79 (Phase 5 exit criterion). Goal: actually use NIVA the way you and Maria would on a normal day and a normal month-end, on your real phones, and catch anything that feels wrong before calling Release 1 done. This isn't a technical test — if something feels confusing, slow, or just "off," that's a real finding even if nothing is technically broken.

Do this on your own phone and Maria's, not just a laptop — most of NIVA's daily use is a phone in a pocket. Budget about 30–40 minutes total, can be split across a few days.

**How to report findings:** note them anywhere convenient (a note on your phone, a message to me) — doesn't need to be formal. For each: what you were trying to do, what happened, what you expected instead.

## Part 1 — Jalie, as administrator

1. **Sign in** on your phone. Does it feel fast? Does it remember you're signed in if you close and reopen the app?
2. **Quick Add an expense** — a real one from today if you have one, or a throwaway one you'll archive after (e.g. "Test — 1.00 LKR, Utilities"). Does the flow feel natural? Any step that seems unnecessary or missing?
3. **Quick Add an income** entry the same way.
4. **Check the Dashboard** — does the entry you just added show up correctly? Does the "last entry" attention item look right?
5. **Open Reports**, pick this month, and look at revenue by platform / expenses by category. Does it match what you'd expect? Try the **CSV download** and the **print/PDF** button — open the downloaded file, does it look right?
6. **Currencies admin** — check the reference rate for a non-default currency is still sensible. Try updating it, confirm the Dashboard's "≈" approximate total updates.
7. **Recurring payments** — if you have a real one due soon, mark it paid and confirm it created a real transaction and moved the due date forward correctly. If nothing's due, just open the screen and check the Overdue/Upcoming grouping makes sense.
8. **Housekeeping → Today** — pick a room with tasks. Complete one task. Skip one task for today and confirm it disappears from the active list (check the "hidden tasks" disclosure if the room has a checkout/stayover status — does the booking-linked hiding make sense, or does it hide something it shouldn't?). Add a one-off task for today and confirm it shows up.
9. **Rooms admin** — open a room's task list, check the "Applies" setting (Every day / When occupied / Checkout only) on a couple of tasks looks right for what that task actually is.
10. **Users admin** — confirm Maria's role and screen access are what you expect. If you need to add or remove anyone, do it here and confirm it takes effect for them.
11. **Account** — edit your display name and change it back, check the app version number shown matches what I told you, sign out and back in.
12. **Language toggle** — switch to Sinhala, glance through Today/Rooms, switch back. Does anything look untranslated or broken?

## Part 2 — Maria, as staff

1. **Sign in** on her phone.
2. Confirm she **only sees the screens** she's supposed to (Housekeeping-related, not Administration/Reports/Transactions unless you've given her wider access).
3. **Complete a real task** on Today's checklist the normal way she would during actual work.
4. Confirm she **cannot** get to screens she shouldn't (try navigating directly if you know how, or just confirm the nav doesn't show them).
5. If she uses the **kiosk sign-out button**, confirm that works and doesn't sign out anyone else.

## Part 3 — A few edge cases worth trying once

1. **Turn on airplane mode**, open the app — does it still show your last-loaded data (from the PWA cache)? Try Quick Add — does it clearly tell you saving is disabled while offline rather than silently failing?
2. **Install the app to your home screen** (Share → Add to Home Screen on iPhone) if you haven't already — does the icon and name look right? Does it open full-screen without Safari's address bar?
3. If you or Maria use two different phones/browsers signed in at once, make an entry on one and check it eventually shows up on the other after a refresh.

## What "done" looks like

Not "zero findings" — it's normal to surface a few rough edges. Done means: nothing that blocks daily use or month-end review, and everything you find is written down somewhere (even the small stuff) so it can be triaged into "fix before calling this Release 1" vs. "note as a known limitation" vs. "post-release wishlist." Once you've gone through this, tell me what you found and we'll close out `docs/release-checklist.md` together.
