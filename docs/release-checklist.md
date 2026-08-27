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
- [ ] Mobile-browser check on a real device (code-level review done — safe-area-inset handling, no fixed-px overflow risks, correct viewport meta, no undersized touch targets found — but nothing replaces actually opening it on Jalie's and Maria's own phones once).
- [ ] Owner acceptance session actually run (script: `docs/owner-acceptance-script.md`) — task #79.

## Operational readiness

- [x] Custom domain (`niva.h28ha.uk`), TLS valid and auto-renewing.
- [x] Backup safety net: weekly JSON export (Supabase Free plan has no automated backup product) — restore actually tested once, task #78.
- [x] Rollback path documented: Cloudflare Pages instant rollback for the app; forward-only migrations for the database (`11-coding-standards-and-test-strategy.md` §9).
- [x] Monitoring/error reporting: deliberately skipped for Release 1 (small, trusted user base) — decided 2026-08-27. Revisit if the user base grows beyond Jalie's own household/staff.
- [ ] Known limitations documented and shared with Jalie before go-live sign-off (drafted in `README.md` → Status; confirm nothing's missing once the acceptance session surfaces anything unexpected).

## Sign-off

- [ ] Jalie confirms Release 1 is ready to rely on for real day-to-day use (this is the actual exit criterion — everything above is in service of this one checkbox).
