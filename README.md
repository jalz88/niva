# NIVA

Your property operating system — a small-BnB accounting and reporting app for tracking income, expenses, and reports across properties, platforms, and currencies. See `docs/` for the full product and technical specification; this app is built to match `docs/03-technology-stack.md`, `docs/07-domain-model-and-schema.md` through `docs/11-coding-standards-and-test-strategy.md`.

**Live app:** https://niva.h28ha.uk

## Setup

```sh
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Database

Migrations live in `supabase/migrations/`, one file per entry in the live project's `supabase_migrations.schema_migrations` table, filenames timestamp-prefixed to match exactly (`<version>_<name>.sql`) and applied in that order. They build up, in sequence: the core schema/RLS from `docs/07-domain-model-and-schema.md` and its immediate security hardening, auth/audit hardening and currency RPCs, config-item favorites/subcategories/suppliers, admin profile-editing permissions, the reporting RPCs (`dashboard_summary`, `revenue_by_platform`, `expenses_by_category`) that power the Dashboard and Reports screens, an RLS performance fix on `profiles`, currency reference rates, recurring payments, Housekeeping (rooms/checklists/staff/bookings), and the 2026-08-27 checklist flexibility + booking-linked-checklist + null-role-bypass security fix. (Reconciled 2026-08-27: eight migrations applied directly to the live project during earlier sessions were missing from this folder — reconstructed from `supabase_migrations.schema_migrations` and added back, and all filenames renamed to the timestamp convention, so this folder is a true, reproducible record of the live schema again. See the deployment runbook, §9, for the rule going forward.) `supabase/seed/seed.sql` has local-dev seed data (commented out beyond `iso_currencies` until a real administrator user exists).

**Backups:** the production Supabase project is on the Free plan, which has no automated backup or point-in-time-recovery product. A weekly scheduled export of the real workspace's data runs instead, saved as dated JSON snapshots under `backups/`. Treat this as a manual-recovery safety net, not a substitute for a real backup product — worth revisiting if/when the project moves to a paid plan.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Type-check + production build |
| `npm run lint` | oxlint + eslint, autofix |
| `npm run format` | Prettier |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright (needs a running app + Supabase project) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build, and the Playwright E2E suite (sign-in, add/edit/archive transactions) against an isolated RLS-scoped test workspace on every push.

## Status

**v1.11.1**, Release 1 readiness in progress. All five roadmap phases (`docs/06-development-roadmap.md`) have shipped their core scope — technical foundation, configuration screens, core transactions, dashboard/reports, and Housekeeping (rooms, checklists, staff roster) — plus a full white-hat security audit of both the database (RLS/permissions/Edge Functions, `docs/11-coding-standards-and-test-strategy.md` §7) and the Cloudflare Pages hosting layer (security headers, CSP, HTTPS redirect, cache policy). See `docs/release-checklist.md` for the exact remaining items before Release 1 is called done.

Known limitations at this release: no receipt uploads/OCR, no multi-currency conversion (reports group by currency plus an approximate combined total, never a blended real total), no offline transaction queueing (by design — Quick Add disables saving while offline, reads still work from cache), no monitoring/error-reporting service (deliberately skipped for now, given the small, trusted user base — see `docs/06-development-roadmap.md` Phase 5), and occasional unexpected sign-outs when the app is open in more than one place at once (e.g. a browser tab left open behind the installed home-screen icon) — a Supabase session-security protection, not a bug; closing other open tabs/windows avoids it. See `docs/06-development-roadmap.md` → "Post-release priorities" for what's next.
