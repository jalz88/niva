# NIVA

Your property operating system. See `docs/` for the full product and technical specification — this app is built to match `docs/03-technology-stack.md`, `docs/07-domain-model-and-schema.md` through `docs/11-coding-standards-and-test-strategy.md`.

## Setup

```sh
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Database

Migrations live in `supabase/migrations/`. Apply `0001_init.sql` to a Supabase project via the Supabase CLI or SQL editor — it creates every table, trigger, and RLS policy described in `docs/07-domain-model-and-schema.md`. `supabase/seed/seed.sql` has local-dev seed data (commented out beyond `iso_currencies` until a real administrator user exists).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Type-check + production build |
| `npm run lint` | oxlint + eslint, autofix |
| `npm run format` | Prettier |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright (needs a running app + Supabase project) |

## Status

Phase 1 (technical foundation) in progress — see `docs/06-development-roadmap.md`. Auth, protected routes, and the responsive app shell are wired up; transaction/reporting screens are placeholders until Phase 2/3.
