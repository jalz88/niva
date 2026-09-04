# Release 1 checklist

Concrete, checkable version of the Phase 5 exit criteria in `06-development-roadmap.md`: *"Owners can confidently use NIVA for daily entry and month-end review; deployment and recovery procedures are documented and tested; Release 1 limitations are explicit."* Update this file's checkmarks in place as items close — don't archive it once Release 1 ships, since Release 2's own readiness pass will want the same shape.

## Functionality

- [x] Core transactions (add/edit/archive income and expense) — Phase 3.
- [x] Dashboard and Reports, per-currency totals, no cross-currency blending except the explicit labelled approximate total — Phase 4.
- [x] Housekeeping: rooms, cadence-based checklists, staff roster, work calendar, booking-linked checklist scoping — 2026-08-24 through 2026-08-27.
- [x] CSV export (transactions and reports).
- [x] Multi-language UI (English/Sinhala).

## Quality gates

- [x] CI green on `main` (lint, typecheck, unit tests, build, Playwright E2E) — `.github/workflows/ci.yml`.
- [x] Accessibility pass (unlabeled controls fixed) — task #76.
- [x] Database security/RLS audit, including a live, safely-reversible exploit test of every SECURITY DEFINER function — found and fixed a real privilege-escalation bug (null-role bypass), CSV-injection fix, `npm audit fix`. See `11-coding-standards-and-test-strategy.md` §7.
- [x] Hosting-level security: HTTPS redirect enabled (Cloudflare dashboard, done 2026-08-27), security headers + CSP shipped (`public/_headers`), CORS tightened on `sync-room-ical`, hashed-asset cache headers fixed (`/assets/*` now `immutable`).
- [x] `supabase/migrations/` reconciled — every migration applied to the live project has a matching local file, timestamp-named to match `supabase_migrations.schema_migrations` exactly (2026-08-27; eight had drifted out of sync — see the deployment runbook §10 for the rule going forward).
- [x] Mobile-browser check on a real device — done as part of the 2026-08-31 acceptance round below (Jalie's phone + her mother's iPad).
- [x] Owner acceptance session actually run (script: `docs/owner-acceptance-script.md`) — first round done 2026-08-31 (Jalie + her mother; Maria's part still to come). Findings below, task #79 stays open until a second pass confirms the fixes and Maria's part is done.

### First acceptance round — 2026-08-31

Four things came back from Jalie and her mother's first real session (her mother's initial training/testing on her iPad):

1. **Fixed — Quick Add/Edit silently discarded input.** Tapping outside the Quick Add sheet, or pressing Back while editing, closed without saving and without asking — confusing, since it wasn't clear whether something had been saved. Now shows a "Discard changes?" confirm in both places (`src/components/ui/BottomSheet.vue`'s new `dirty`/`close-blocked` mechanism, `src/views/EditTransactionView.vue`'s router-leave guard).
2. **Fixed — language preference didn't follow the housekeeper's account.** It was a per-device setting (localStorage only, by original 2026-08-26 design) — reasonable for one fixed kiosk, wrong for a shared/rotating device. Moved to a per-user column (`profiles.locale`, migration `20260831090247`) — signing in as a given person now shows their language on any device.
3. **Fixed — check-in day mislabeled "Stayover," no Check-in badge.** `TodayView.vue`'s booking badge only ever checked for checkout day, everything else fell through to "Stayover." Now distinguishes Checkout / Check-in / Stayover, and shows both Checkout and Check-in badges together on a same-day turnover. Found and fixed the same bug's more serious sibling while in there: the `housekeeping_today_checklist` RPC could have silently duplicated a room's entire task list on a turnover day (two bookings covering one room/day, no aggregation) — fixed in migration `20260831090718`, never actually confirmed to have hit production data but a real latent bug.
4. **Investigated, not a code bug — occasional sign-outs.** Most likely cause: Supabase's refresh-token reuse protection terminates a session if it detects the same session's token used from two places within a short window — the common trigger is having NIVA open in more than one place at once (e.g. a browser tab left open behind the installed home-screen icon), which can race on token refresh. Practical mitigation: close any other open NIVA tab/window before relying on the installed app icon. Not something fixable in app code without weakening a real security protection Supabase recommends keeping on; flagged as a known limitation rather than a bug.

### Second live round — 2026-09-04

First genuinely simultaneous multi-device use (Jalie, her mother, and the housekeeper Subashani — Android and iPhone, at the same time). One finding:

5. **Fixed — no live sync across devices.** Subashani completing a task on her phone didn't reach her mother's phone until it was manually closed and reopened. Realtime had never actually been turned on for any table in the project. Enabled it for the four tables the Today checklist depends on (`sop_task_completions`, `sop_task_skips`, `sop_task_occupancy_overrides`, `room_inspections` — migration `20260904055820`) and wired a subscription into `useHousekeepingToday.ts` that refreshes the checklist the moment any of those change, from any device. Room-booking and staff-assignment changes don't have this yet (lower priority — they change far less often mid-shift); worth doing if it turns out to matter.

## Operational readiness

- [x] Custom domain (`niva.h28ha.uk`), TLS valid and auto-renewing.
- [x] Backup safety net: weekly JSON export (Supabase Free plan has no automated backup product) — restore actually tested once, task #78.
- [x] Rollback path documented: Cloudflare Pages instant rollback for the app; forward-only migrations for the database (`11-coding-standards-and-test-strategy.md` §9).
- [x] Monitoring/error reporting: deliberately skipped for Release 1 (small, trusted user base) — decided 2026-08-27. Revisit if the user base grows beyond Jalie's own household/staff.
- [ ] Known limitations documented and shared with Jalie before go-live sign-off (drafted in `README.md` → Status; confirm nothing's missing once the acceptance session surfaces anything unexpected).

## Sign-off

- [ ] Jalie confirms Release 1 is ready to rely on for real day-to-day use (this is the actual exit criterion — everything above is in service of this one checkbox).
