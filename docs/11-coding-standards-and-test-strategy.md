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
| Dependency vulnerabilities | `npm audit --audit-level=high` (CI: `npm run audit`) | Every push/PR, not just the periodic manual pass — added 2026-09-07 after a routine check found a live high-severity `browserslist` advisory sitting unnoticed since the last manual `npm audit fix` (2026-08-27) |
| RLS/database | Supabase CLI local instance + pgTAP, `supabase/tests/database/` | Cross-workspace isolation, role-based read/write permissions (administrator/manager/staff/viewer), profiles access, and a permanent regression suite for the 2026-08-27 null-role-bypass bug class — see "pgTAP suite" below. Runs on every push/PR against a fresh local Postgres container (`db-tests` job), not just during a manual audit. |
| Browser (critical flows) | Playwright | Sign in (done, `e2e/sign-in.spec.ts`); Quick Add income and expense — save → appears in list and dashboard without refresh (done, `e2e/transactions.spec.ts`); edit (done — a plain edit; a *forced concurrency conflict* specifically is still open); archive + Undo (done); report totals reconcile with transaction drill-down (open); Quick Add reachable and usable on a 375px mobile viewport (open) |
| Accessibility | axe-core within Playwright + a manual keyboard-only pass | WCAG 2.2 AA target from `04-ui-ux-principles.md` §7 |

**pgTAP suite, added 2026-09-07** (`supabase/tests/database/`) — closes the open item this section flagged since Phase 1 ("Decide the exact pgTAP/RLS-test tooling..."), and directly answers the gap the 2026-08-27 null-role-bypass bug exposed: that bug was only found because someone ran a manual audit, and nothing would have caught a similar regression introduced afterward. Four files, run in order by `supabase test db` (locally: `npm run test:db`, needs Docker; in CI: the `db-tests` job in `.github/workflows/ci.yml`, against a fresh throwaway Postgres container `supabase start` builds from `supabase/migrations/` — never the real project):

- `00-setup.sql` — installs the pgtap extension and a `tests` helper schema (`create_user`, `authenticate_as`, `clear_authentication`) that simulates PostgREST's per-request auth by setting the `role`/`request.jwt.claims` GUCs `auth.uid()` reads. Not security definer — Postgres refuses to let a security-definer function change the `role` GUC at all, so the switch runs with the test runner's own (superuser) privileges, and `authenticated`/`anon`/`service_role` are granted `usage`/`execute` on the `tests` schema so a test can switch personas more than once.
- `01-workspace-isolation.test.sql` — the core RLS boundary: a member of one workspace sees nothing from another, on `workspaces`, `transactions` (including a direct lookup by a known foreign row id, not just a filtered list), `categories`, and `workspace_memberships`.
- `02-role-based-permissions.test.sql` — administrator/manager/staff/viewer each get a different subset of allowed operations on the same tables (staff can insert a transaction but not update/delete one; only an administrator can delete; only an administrator can write `categories`; only manager+ can see `recurring_payments` at all).
- `03-security-definer-null-role-regression.test.sql` — the important one: a permanent regression test for the exact 2026-08-27 bug class, run against all six previously-vulnerable functions (`sop_task_skip_today`, `sop_task_unskip_today`, `sop_task_add_for_today`, `sop_task_include_today`, `sop_task_uninclude_today`, `mark_recurring_payment_paid`). Asserts a caller with *no membership in any workspace* (the branch that was actually broken — `current_role_in_workspace()` returns NULL, not a disallowed role) is rejected, alongside a real member with the wrong role (the branch that already worked) and a legitimate administrator (positive control, so an overly strict future change would fail this suite too).
- `04-profiles-access.test.sql` — self-service profile edits, the administrator-can-edit-a-co-member's-profile permission from migration `20260720232229`, and confirms a member of a *different* workspace entirely can neither see nor edit this workspace's profiles.

**Push notifications, added 2026-11-08:** `05-push-notifications.test.sql` covers the new tables and RPCs — non-member registration rejected (null-role class), owner-only visibility, shared-device takeover, no direct client writes, own-row-only preferences, `push_daily_digest` not callable by clients, and the refactored `housekeeping_today_checklist` wrapper still gating on membership. The wrapper refactor itself was proven equivalent by diffing old vs new output on the live workspace for three dates (0 differences) in a rolled-back transaction. Real delivery to a phone can't be automated here — see the manual test steps in `release-checklist.md`'s push section.

Two non-obvious things worth knowing before touching these files: every table with a `created_by` column has a `set_audit_fields()`/`check_*_integrity()` trigger that unconditionally overwrites it with `auth.uid()` on INSERT, so fixture rows in NOT-NULL-`created_by` tables (`transactions`, `recurring_payments`, `rooms`, `sop_tasks`) must be inserted *after* calling `tests.authenticate_as()` for their intended owner, not before; and `check_transaction_integrity()` requires the workspace to have the currency enabled in `workspace_currencies` first, exactly like a real workspace would. Every fixture and assertion in all four files was hand-verified against the live project's actual schema/policies/functions (wrapped in an explicit `ROLLBACK`, nothing persisted — same methodology as the 2026-08-27 audit) before being committed, since this sandbox has no Docker to run `supabase test db` itself; the `db-tests` CI job is the first time these files actually run through pgTAP's own `pg_prove` harness.

No hard code-coverage percentage gate — chasing a number contradicts "clarity over cleverness." Instead: every PR touching authentication, transaction create/edit/archive, or a report calculation must include or update a test for that behavior. A coverage report on `lib/` and `composables/` is tracked as a smell-detector, not a merge blocker.

**First owner acceptance round, 2026-08-31 — four real findings, three fixed.** Jalie and her mother's first hands-on session (`docs/owner-acceptance-script.md`) surfaced four things no code review had caught:

1. Quick Add/Edit closed silently on an outside tap or Back with no unsaved-changes warning. Fixed with a reusable `dirty`/`close-blocked` mechanism on `BottomSheet.vue` (a consumer passes `:dirty` and handles `@close-blocked` with its own confirm dialog) and a `vue-router` `onBeforeRouteLeave` guard on `EditTransactionView.vue` that catches every way of leaving the route, not just the in-page Back link. `TransactionForm.vue` tracks "the user actually touched something" itself (a manual `touch()` call from every real selection handler, plus `@input.capture`/`@change.capture` on the form) rather than trusting vee-validate's own dirty tracking, because the existing default-currency auto-fill watcher already called `setFieldValue` programmatically on mount — treating that as "dirty" would have falsely prompted on every untouched Quick Add.
2. Language preference was per-device only (localStorage, a deliberate 2026-08-26 design choice reasoned around "the caretaker kiosk device") — wrong for a device that gets signed into by more than one person. Moved to `profiles.locale` (migration `20260831090247`); `useAuth`'s `loadProfile` now applies the signed-in user's own value on every sign-in, `useLocale.setLocale()` persists to the profile in the background while still keeping the localStorage cache for instant first-paint.
3. A check-in day (a booking's `starts_on` == today) fell through `TodayView.vue`'s old two-way checkout/stayover check and was mislabeled "Stayover" — there was no third case. Fixed with a proper Checkout/Check-in/Stayover classification that shows both Checkout and Check-in badges together on a same-day turnover (`bookingBadges()` now checks *every* booking covering the room today, not just the first match). Investigating this surfaced a more serious sibling bug purely by code-reading, never confirmed to have actually hit live data: `housekeeping_today_checklist`'s `booking` CTE assumed at most one booking ever covers a room/day, but a same-day turnover is exactly two bookings covering one room/day — with no aggregation, that would fan out through the `active` CTE's join and duplicate every one of that room's tasks on a turnover day. Fixed in migration `20260831090718` by grouping to one row per room, `'checkout'` winning whenever any booking on that room ends today.
4. Occasional unprompted sign-outs — investigated, not a code bug. Almost certainly Supabase's refresh-token reuse protection: it terminates a session outright if it detects the same session's refresh token used from two places within its ~10s reuse window, which is the standard failure mode when the same origin's session is open in more than one place at once (e.g. a browser tab left open behind the installed home-screen icon, or two tabs of the app). Confirmed via Supabase's own docs (`search_docs`), not reproduced directly. No code change — the fix is closing other open copies of the app, and disabling the protection is explicitly not recommended by Supabase. Documented as a known limitation in `README.md` and `release-checklist.md` rather than worked around.

**Second live round, 2026-08-31/09-04 — no Realtime sync across devices.** First real simultaneous-use session (Jalie, her mother, and the housekeeper Subashani — Android and iPhone, different physical devices) found the Housekeeping Today view had no live sync at all: Subashani completing a task on her phone never reached her mother's phone until it was manually closed and reopened. Root cause was two-fold — `useHousekeepingToday`'s `revision` ref (the signal `TodayView.vue` watches to refetch) is module-scoped *per browser tab*, so it only ever reacted to that same tab's own mutations, and separately, Realtime had never been enabled for any table in the project at all (`pg_publication_tables` for `supabase_realtime` was empty). Fixed by adding `sop_task_completions`, `sop_task_skips`, `sop_task_occupancy_overrides`, and `room_inspections` to the `supabase_realtime` publication (migration `20260904055820` — each already has an `is_workspace_member(workspace_id)` SELECT policy, so Realtime's own RLS enforcement scopes it correctly per workspace) and wiring a `postgres_changes` subscription into `useHousekeepingToday.ts` (`subscribeToChanges`/`unsubscribeFromChanges`, module-scoped like `revision` itself, one channel per workspace) that bumps the same `revision` ref on any change — `TodayView.vue`'s existing `watch(todayRevision, loadAll)` needed no changes at all. Room bookings and day-off/assignment reassignment don't have the same live wiring yet (they change far less often, mid-shift, than task completions) — worth the same treatment later if it turns out to matter in practice.

**Same session, separate finding — "on shift" header ignored days off.** While looking at the same screen, Jalie reported the header text said "Subashani on shift" despite having logged a day off for her that exact date. Checked the database directly first rather than assuming: the `workforce_days_off` row was there and correct (`day_off = 2026-09-07`), and the room cards on the same screen already, correctly, showed every room "Unassigned" — so the underlying data and `computeAssignments()` were both right. The bug was narrower than it looked: `onShiftHousekeepers` (the computed feeding just the header text) filtered on `crew_role`/`is_active` only and never called `isOff()` at all, while `computeAssignments()` a few lines away already did. Fixed by adding the same `!isOff(m.id, todayIso)` check. (Also confirmed, while investigating, that the Staff work calendar's per-day dot is a *booking* indicator, not a day-off marker — day-off is instead shown by the cell's red-tinted background — so the calendar screenshot with dots on several nearby days was showing normal booking activity, not several accidental days off.)

**Manual white-hat pass, 2026-08-27 (pgTAP automation still not built — see §11):** with no automated RLS test harness yet, ran an adversarial pass directly against the live database — every `SECURITY DEFINER` function's body read and reasoned about, then actual exploit attempts run and rolled back (never committed) using the real second workspace (`64f4fef3-...`, the isolated E2E test workspace) as an "outsider" account against the primary workspace's data, plus anon-role and staff-role boundary checks against every table. Found and fixed one critical bug this way (see below); everything else — RLS policy coverage, RLS actually enabled on every table, the `sync-room-ical` Edge Function's `verify_jwt` setting, the pg_cron job's Vault-based secret handling, `.env`/git secret exposure, XSS via `v-html` — checked clean. This was a one-time manual pass, not a substitute for the pgTAP suite in §11's open items; it should be repeated (or better, automated) before onboarding any workspace beyond Jalie's own.

**Critical bug found and fixed, 2026-08-27 — null-role bypass in six `SECURITY DEFINER` functions.** `sop_task_skip_today`, `sop_task_unskip_today`, `sop_task_add_for_today`, `sop_task_include_today`, `sop_task_uninclude_today`, and `mark_recurring_payment_paid` all guarded access with `if current_role_in_workspace(x) not in ('administrator', 'manager') then raise exception`. `current_role_in_workspace()` returns SQL `NULL` — not a role string — for a caller with no membership row in the target workspace at all (not just a caller with a disallowed role). In PL/pgSQL, `IF <expression that evaluates to NULL> THEN` is treated as false, so the `RAISE EXCEPTION` was silently skipped whenever the caller belonged to a *different* workspace (or no workspace at all) — the check only ever correctly rejected a wrong-role member of the *same* workspace. Confirmed live: an account whose only membership was in the unrelated E2E test workspace successfully called `sop_task_skip_today` against a real task in the primary workspace, and `mark_recurring_payment_paid` successfully inserted a real transaction row into the primary workspace — both immediately rolled back, nothing persisted. Declarative RLS policies (`current_role_in_workspace(workspace_id) = 'administrator'` etc., used in every table's `USING`/`WITH CHECK`) were never affected by this — SQL treats a `NULL` comparison result in a policy clause as "row excluded," the safe direction; this was specifically a PL/pgSQL imperative-guard bug. Fixed by wrapping the role lookup in `coalesce(..., '')` at all six call sites, matching the null-safe pattern `set_default_workspace_currency` already used correctly (`is distinct from 'administrator'`). Re-tested the same exploit attempts post-fix — all six now correctly raise `42501`; legitimate administrator/manager access re-verified unaffected.

**Also fixed in the same pass:** CSV/formula injection (`src/lib/csv.ts`) — a free-text field (transaction notes, supplier/category names) starting with `=`, `+`, `-`, `@`, tab, or CR is interpreted as a live formula by Excel/Google Sheets when a CSV export is opened; any workspace member with transaction-entry access could have planted a payload like `=HYPERLINK(...)` in a note. `csvField()` now prefixes a literal-text quote for anything formula-shaped, while still exempting plain negative numbers (e.g. a report's "Net" column) so real numeric data isn't corrupted into text. Also bumped `nanoid`/`postcss` via `npm audit fix` (both build-time-only transitive deps; zero runtime exposure either way, but free to fix).

**Hosting-level security pass, 2026-08-27** — the database/RLS/Edge-Function audit above covers the backend; this pass covers the Cloudflare Pages deployment itself (`https://niva.h28ha.uk`). Checked and confirmed healthy: TLS 1.3 with a valid, auto-renewing Cloudflare certificate; no service-role key or other secret anywhere in client code, Pages env vars, or Git (confirmed via `.gitignore`/`git ls-files`); CI (`.github/workflows/ci.yml`) only reads secrets via GitHub Actions' `secrets.*` context on the standard `pull_request`/`push` triggers (not `pull_request_target`), so a forked-repo PR can't exfiltrate them; probing paths like `/.env` and `/.git/config` returns HTTP 200 but is confirmed (byte-for-byte identical response size to `index.html`) to be ordinary SPA-fallback routing, not real file exposure.

Two real gaps found and fixed:
1. **No security headers configured.** Nothing set `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` — only Cloudflare's own defaults were present. Fixed by adding `public/_headers` (Cloudflare Pages' native mechanism, copied into `dist/` on every build): HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict `Referrer-Policy`, a `Permissions-Policy` disabling every sensor/device API NIVA doesn't use (camera, mic, geolocation, etc. — confirmed unused via a repo-wide grep), and a `Content-Security-Policy` scoped to `'self'` plus the Supabase API/WSS origin. The built `index.html` has no inline `<script>` and no third-party CDN scripts/fonts (checked directly against the `vite build` output), so `script-src 'self'` should not break anything; `style-src` keeps `'unsafe-inline'` since Vue's `:style` bindings render as inline `style=""` attributes. This wasn't live-tested against a real CSP violation report (no way to do that from this session) — if anything on the live site looks broken after deploy, the fastest rollback is deleting just the `Content-Security-Policy` line from `public/_headers` and redeploying; the other headers are safe unconditionally.
2. **`sync-room-ical`'s CORS allowed any origin** (`Access-Control-Allow-Origin: '*'`). Not currently exploitable — the function's `verify_jwt` platform setting means an unauthenticated/forged request never reaches the function's own code regardless of `Origin` — but tightened to `https://niva.h28ha.uk` anyway as defense-in-depth, since no other origin has a legitimate reason to call it.

**Manual step only Jalie can do:** plain `http://niva.h28ha.uk/` currently serves the app directly over unencrypted HTTP instead of redirecting to HTTPS — Cloudflare's "Always Use HTTPS" zone setting appears to be off. Fix: Cloudflare Dashboard → the `h28ha.uk` zone → **SSL/TLS → Edge Certificates → Always Use HTTPS** → toggle on. This isn't something available through any tool in this session.

## 8. CI pipeline (GitHub Actions)

1. Install dependencies (cached).
2. Dependency vulnerability audit (`npm audit --audit-level=high`) — added 2026-09-07 so a new high/critical advisory fails CI immediately instead of waiting for the next manual audit.
3. Lint + type check.
4. Vitest unit tests.
5. Build (`vite build`) — catches type/import errors a linter might miss.
6. `db-tests` job — pgTAP RLS/permission suite (§7 "pgTAP suite") against a fresh local Postgres container via `supabase start`/`supabase test db`. Runs independently of the job above (no `needs:`), since it doesn't depend on the app build at all — only on `supabase/migrations/`.
7. Playwright critical-flow suite against the build, on every push/PR (decided 2026-07-22 — this class of bug, silent-until-refresh, is exactly what a nightly-only run would leave live in production for up to a day). Runs against the real Supabase project, scoped to a dedicated, RLS-isolated **"NIVA E2E Test"** workspace and test account — never against Jalie's real data, and no separate Supabase branch/project required, since workspace-scoped RLS already makes the isolation real. First test covers sign-in (`e2e/sign-in.spec.ts`), added directly in response to the async auth-state race bug (`00-project-blueprint.md` §10); the rest of the critical-flow list above is added incrementally, one PR at a time, alongside the feature it covers.
8. Cloudflare Pages Git integration builds its own preview deployment per PR independent of the above — CI gates the merge; Pages provides the reviewable preview URL.

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
9. **Security headers:** `public/_headers` (Cloudflare Pages' native format) ships HSTS, CSP, and the other standard headers — see the hosting-security note in §7. Copied verbatim into `dist/` by `vite build`; no separate build step needed.
10. **Migration file must exist locally before/immediately after applying.** This project applies migrations to the live Supabase project directly (via an AI assistant's database tool), not via a local `supabase db push`. Found 2026-08-27: eight migrations had been applied this way across earlier sessions without ever writing the matching file into `supabase/migrations/`, so the folder silently drifted out of sync with the live schema. Whenever a migration is applied directly, write (or copy back from `supabase_migrations.schema_migrations.statements`) the matching file into `supabase/migrations/` in the same session, named `<version>_<name>.sql` using the exact version/name the platform assigned — never a local `000N_` sequence number, which won't sort correctly against the platform's timestamp-based versions.

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
- ~~Decide the exact pgTAP/RLS-test tooling and get the first policy test running against a local Supabase instance before the first real migration ships.~~ Resolved 2026-09-07 — see §7 "pgTAP suite" and §8 item 6. (Landed well after the first real migration, not before — the risk this item was meant to head off materialized as the 2026-08-27 null-role-bypass bug, found by a manual audit instead. The suite now includes a permanent regression test for that exact bug class.)
- ~~Confirm whether Playwright's critical-flow suite runs on every PR or nightly~~ Resolved 2026-07-22: every push/PR — see §8.
