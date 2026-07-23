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

Migrations live in `supabase/migrations/`, applied in order (`0001` through `0009`). They build up, in sequence: the core schema/RLS from `docs/07-domain-model-and-schema.md` (`0001`), auth/audit hardening and currency RPCs (`0002`–`0003`), config-item favorites/subcategories/suppliers (`0005`), admin profile-editing permissions (`0006`), the reporting RPCs (`dashboard_summary`, `revenue_by_platform`, `expenses_by_category`) that power the Dashboard and Reports screens (`0007`–`0008`), and an RLS performance fix on `profiles` (`0009`). `supabase/seed/seed.sql` has local-dev seed data (commented out beyond `iso_currencies` until a real administrator user exists).

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

**v1.0** — all five phases in `docs/06-development-roadmap.md` are complete: technical foundation, configuration screens, core transactions, dashboard/reports, and release readiness (accessibility pass, security/RLS advisor clean, PWA install icons, custom domain, automated E2E testing, backup safety net).

Known limitations at this release: no data export yet, no receipt uploads, no multi-currency conversion (reports group by currency rather than converting), no offline transaction queueing. See `docs/06-development-roadmap.md` → "Post-release priorities" for what's next.
