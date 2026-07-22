# Coding Standards, Test Strategy, Deployment Runbook, and AI Development Guide

**Status:** Foundation — approved direction, implementation pending
**Depends on:** `03-technology-stack.md`, `07-domain-model-and-schema.md`, `10-api-data-access-spec.md`
**Repo hosting:** GitHub (decided 2026-07-19) — Cloudflare Pages Git integration builds previews per PR and production on merge to `main`.

This is the last of the four Phase 0 artifacts named in `00-project-blueprint.md` §8. It covers how code is written, tested, and shipped, and how an AI assistant should use this whole `docs/` set while building NIVA.

## 1. Project structure

```text
src/
├── components/     # presentational, reusable; no direct Supabase calls
├── views/           # route-level screens (Dashboard, Transactions, ...)
├── composables/     # useTransactions(), useDashboard(), useAuth() — the data-access layer from 10-api-data-access-spec.md
├── stores/           # Pinia — client-only state only (active filters, selected property/period, UI toggles)
├── router/
├── lib/              # money/date formatting, Zod schemas, the NivaError mapper
└── styles/           # Tailwind config, design tokens from 08-design-system.md
supabase/
├── migrations/       # one file per schema change, matches 07-domain-model-and-schema.md
└── seed/             # Kandy BnB, Airbnb/Agoda, LKR seed data per 06-development-roadmap.md Phase 2
tests/
├── unit/             # Vitest
├── rls/               # database policy tests
└── e2e/               # Playwright
```

## 2. Language and framework conventions

- TypeScript `strict` mode; no `any` without an inline comment explaining why it's unavoidable.
- Vue 3 Composition API with `<script setup lang="ts">` only — no Options API, for one consistent pattern across the codebase.
- Props and emits are typed with `defineProps<T>()` / `defineEmits<T>()`, not runtime prop declarations.
- Components never call `supabase-js` directly; they call a composable. This is what makes the error contract and concurrency rules in `10-api-data-access-spec.md` actually consistent app-wide instead of aspirational.
- Server data is not duplicated into a Pinia store "just in case" — Pinia holds client-only state (selected property/period, filter selections, sheet/modal open state). Fetched entities live in composable-local reactive state, matching the tech-stack doc's "server data should not be duplicated as global state without a reason."

## 3. Styling conventions

- Tailwind utility classes only; no component-level `<style>` blocks except for the rare case Tailwind can't express (documented inline when it happens).
- Every color, spacing, radius, and shadow value traces back to a token in `08-design-system.md` — no ad-hoc hex codes or pixel values in component markup.
- shadcn-vue primitives are wrapped once per component type (`NButton`, `NInput`, etc.) so the design-system states in `08-design-system.md` §5 are applied centrally, not re-implemented per screen.

## 4. Forms and validation

- One Zod schema per entity input shape, colocated in `lib/schemas/`, shared between the form (VeeValidate) and the composable that calls Supabase — the same schema validates client-side and shapes the TS type sent to the API layer.
- Schemas encode the same rules as the database constraints/triggers in `07-domain-model-and-schema.md` §5 (category/type match, amount > 0, currency enabled) so a user never passes client validation only to fail at the database with a confusing error.

## 5. Naming

| Item | Convention | Example |
| --- | --- | --- |
| Components | PascalCase file and export | `TransactionRow.vue` |
| Composables | camelCase, `use` prefix | `useTransactions.ts` |
| Pinia stores | camelCase, `Store` suffix | `filtersStore.ts` |
| Types/interfaces | PascalCase | `Transaction`, `NivaError` |
| Zod schemas | camelCase, `Schema` suffix | `transactionInputSchema` |
| Database tables/columns | snake_case | `payment_method_id` |

## 6. Linting, formatting, git workflow

- ESLint (`vue` + `typescript-eslint` configs) and Prettier, run via `lint-staged` on commit and repeated in CI — a failed local hook should never be the only gate.
- Conventional Commits (`feat:`, `fix:`, `chore:`, ...) for messages; short-lived feature branches off `main`; PR required to merge, even during the solo-development period, so the decision checklist in `02-product-philosophy.md` §11 has a natural place to be answered in the PR description.
- Branch protection on `main`: CI must be green before merge.

## 7. Test strategy

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Money/date formatting, Zod schema validation, the `NivaError` mapper, composable logic against a mocked Supabase client |
| RLS/database | Supabase CLI local instance + pgTAP (or equivalent SQL test harness) | Every policy in `07-domain-model-and-schema.md` §6, tested per role — this is the real security boundary and the layer most dangerous to leave untested |
| Browser (critical flows) | Playwright | Sign in (done, `e2e/sign-in.spec.ts`); Quick Add income and expense — save → appears in list and dashboard without refresh (done, `e2e/transactions.spec.ts`); edit (done — a plain edit; a *forced concurrency conflict* specifically is still open); archive + Undo (done); report totals reconcile with transaction drill-down (open); Quick Add reachable and usable on a 375px mobile viewport (open) |
| Accessibility | axe-core within Playwright + a manual keyboard-only pass | WCAG 2.2 AA target from `04-ui-ux-principles.md` §7 |

No hard code-coverage percentage gate — chasing a number contradicts "clarity over cleverness." Instead: every PR touching authentication, transaction create/edit/archive, or a report calculation must include or update a test for that behavior. A coverage report on `lib/` and `composables/` is tracked as a smell-detector, not a merge blocker.

## 8. CI pipeline (GitHub Actions)

1. Install dependencies (cached).
2. Lint + type check.
3. Vitest unit tests.
4. Build (`vite build`) — catches type/import errors a linter might miss.
5. Playwright critical-flow suite against the build, on every push/PR (decided 2026-07-22 — this class of bug, silent-until-refresh, is exactly what a nightly-only run would leave live in production for up to a day). Runs against the real Supabase project, scoped to a dedicated, RLS-isolated **"NIVA E2E Test"** workspace and test account — never against Jalie's real data, and no separate Supabase branch/project required, since workspace-scoped RLS already makes the isolation real. First test covers sign-in (`e2e/sign-in.spec.ts`), added directly in response to the async auth-state race bug (`00-project-blueprint.md` §10); the rest of the critical-flow list above is added incrementally, one PR at a time, alongside the feature it covers.
6. Cloudflare Pages Git integration builds its own preview deployment per PR independent of the above — CI gates the merge; Pages provides the reviewable preview URL.

## 9. Deployment runbook

Extends the deployment workflow already defined in `03-technology-stack.md`:

1. Work in a short-lived branch; open a PR against `main`.
2. CI (§8) must pass; Cloudflare Pages preview reviewed for the actual UI/flow change.
3. **Migrations first.** Additive migrations (new nullable column, new table, new enum value) can ship independently of the app. Breaking migrations (rename, drop, tighten a constraint) are coordinated: merge and apply the migration in a release where both the old and new app versions can tolerate it, per the backward-compatibility rule in `03-technology-stack.md`.
4. Merge to `main` → Cloudflare Pages builds and deploys production automatically.
5. Apply the migration via the Supabase CLI against the linked project as a deliberate, version-controlled step — never a dashboard-only schema edit.
6. **Secrets:** Supabase URL and anon key are Pages build environment variables (the anon key is safe client-side; RLS is the actual boundary). The service-role key never appears in client code, Pages env vars, or Git — only in a Worker's `wrangler secret`, if a Worker is ever introduced.
7. **Rollback:** Cloudflare Pages retains prior deployments — an app rollback is instant via dashboard or CLI. A database rollback is always a new forward migration; live financial data is never destructively reverted.
8. **Backups:** rely on Supabase's automated backups for Release 1; a restore-test is a named Phase 5 release-readiness item in `06-development-roadmap.md` and must actually be run once, not assumed.

## 10. AI development guide

Written for any AI assistant (this one included) working in this repository:

1. **`docs/` is the source of truth, not training priors.** Before generating a screen, query, or migration, check the relevant doc — blueprint scope, this schema, the API contract, the design system — rather than inventing a convention that isn't written down here.
2. **Don't expand Release 1 scope.** Anything outside the boundary in `00-project-blueprint.md` §3 needs to go through the decision rules in §7 before it's built, not be added because it seemed natural while implementing something else.
3. **Update the doc in the same change set as the decision.** If implementation reveals a durable decision that isn't written down yet (a new constraint, a changed permission), update the relevant numbered doc in the same PR — per the blueprint's change-control rule, code and docs must not drift apart.
4. **Extend existing patterns before inventing new ones.** A new entity follows the configuration-table shape in `07-domain-model-and-schema.md` §3; a new list/detail screen follows the composable + view pattern in §1 of this document, not a one-off approach.
5. **A screen isn't done until it meets `04-ui-ux-principles.md` §10** — responsive layouts, loading/empty/error/permission-denied states, keyboard and touch support, accessible labels/focus, validation, post-mutation feedback, and a real small-screen check.
6. **Ask before assuming on genuine product/business decisions** (permissions, naming, anything a small BnB owner would reasonably have an opinion on) — implementation details are fine to decide directly and record here.

## 11. Open items for Phase 1 implementation

- Stand up the GitHub repo, branch protection rules, and the Actions workflow file matching §8.
- Decide the exact pgTAP/RLS-test tooling and get the first policy test running against a local Supabase instance before the first real migration ships.
- ~~Confirm whether Playwright's critical-flow suite runs on every PR or nightly~~ Resolved 2026-07-22: every push/PR — see §8.
