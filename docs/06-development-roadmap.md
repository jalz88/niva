# Development Roadmap

## Roadmap principle

NIVA is delivered in small, verifiable increments. A phase is complete only when its acceptance criteria, documentation updates, and relevant tests are complete—not when a screen merely looks finished.

Dates are intentionally omitted until the owners choose development capacity and deployment accounts. Scope and quality gates are more valuable than artificial dates at this stage.

## Phase 0 — Product foundation

**Goal:** Establish a shared product language and prevent rework.

- Approve this initial blueprint set.
- Create the repository structure and contribution workflow.
- Define detailed domain model, database schema, design system, wireframes, coding standards, test strategy, and AI development guide.
- Decide the initial organisation/workspace model and sign-in method.
- Confirm initial property, currency, categories, payment methods, and user roles for seeding.

**Exit criteria:** Product scope is approved; every Release 1 screen has a documented purpose, state model, and wireframe; every core entity has an ownership/security model.

## Phase 1 — Technical foundation

**Goal:** Build a secure, deployable shell before financial features.

- Initialise Vue 3 + TypeScript + Vite application and design tokens.
- Set up Cloudflare Pages preview/production deployment.
- Provision Supabase project, authentication, migrations, backups/restore plan, and RLS test approach.
- Implement sign-in, session handling, protected routes, and role-aware navigation.
- Add application shell, responsive navigation, error boundary/route error patterns, and PWA manifest/application-shell caching.
- Establish formatting, type checks, unit tests, browser tests, and CI checks.

**Exit criteria:** An authenticated, role-aware user can access a preview deployment; no business table is accessible without tested RLS; the app is usable on phone and desktop; CI blocks basic regressions.

## Phase 2 — Configuration foundation

**Goal:** Make business values data-driven before recording transactions.

- Implement properties, platforms, categories, payment methods, currencies, and users/memberships.
- Seed initial values: Kandy BnB; Airbnb and Agoda; LKR; agreed categories and payment methods.
- Support add, edit, enable/disable/archive workflows with use-aware safeguards.
- Implement administrator permissions and clear empty states.

**Exit criteria:** An administrator can manage initial business values without code changes; a used configuration item cannot be destructively removed; data access is restricted by workspace and role.

## Phase 3 — Core transactions

**Goal:** Make recording income and expenses fast, safe, and trustworthy.

- Implement transaction schema, migrations, validation, and audit fields.
- Build mobile-first Quick Add, add income, add expense, transaction list/detail, edit, and delete/archive flows.
- Add defaults, clear validation, saving feedback, network error recovery, and confirmation/undo behavior according to UI principles.
- Add filters for date/period, property, type, category, and platform as appropriate.
- Test amount/currency precision, authorization, create/edit/delete behavior, and key mobile flow.

**Exit criteria:** A permitted user can create a typical income or expense in the target time, edit it safely, and see confirmed changes reflected after refresh. Failed saves never lose form data or show false success.

## Phase 4 — Dashboard and reports

**Goal:** Answer the core business questions accurately.

- Implement selected-period and property context.
- Build dashboard totals: income, expenses, and clearly labelled net result.
- Build revenue-by-platform and expense-by-category reports, with transaction drill-down.
- Add meaningful empty, loading, and filtered-no-results states.
- Verify report queries against controlled transaction fixtures and currency rules.

**Exit criteria:** Month-end Airbnb and Agoda income totals can be reviewed and traced to transactions; report totals reconcile with the transaction list; no mixed-currency total is shown without an explicit policy.

## Phase 5 — Release readiness

**Goal:** Make NIVA dependable for everyday use.

- Complete accessibility, mobile-browser, performance, and PWA install testing.
- Validate backup, restore, export, security, and operational support procedures.
- Run owner acceptance sessions using real but safe sample scenarios.
- Fix high-impact usability issues and document known limitations.
- Set up production domain, monitoring/error reporting consistent with privacy needs, and release checklist.

**Exit criteria:** Owners can confidently use NIVA for daily entry and month-end review; deployment and recovery procedures are documented and tested; Release 1 limitations are explicit.

## Post-release priorities

Prioritise using observed pain points, not a feature wish list. Likely candidates:

1. ~~Export of Reports as CSV or print/PDF.~~ Done 2026-08-02 — see `src/lib/reportCsv.ts` and ReportsView's "Print / Save as PDF" (browser-native print, no PDF library). ~~Exporting a filtered *transaction list*.~~ Done 2026-08-19 — a "Download" button on the Transactions screen exports every transaction matching whatever filters are currently applied (not just the page on screen) as a CSV, confirming first via the existing delete-style ConfirmDialog once the filtered result exceeds 100 rows. See `src/lib/transactionCsv.ts`, `useTransactions().listAll()`, and `12-ux-options-review.md` Part B.1 and C.4.
2. ~~Recurring bills and due-date reminders.~~ Done 2026-08-19, renamed **Recurring payments** once the second real use case came up (staff wages on a standing bank order, not just bills) — a dedicated list in the More sheet, manager/administrator only, with Overdue/Upcoming grouping, monthly-or-weekly cadence, and a confirm-first "Mark paid" that logs the real transaction and advances the schedule. See `12-ux-options-review.md` Part B.2/2 and `07-domain-model-and-schema.md` §3 `recurring_payments`.
3. Receipt uploads and OCR. Storage/privacy/retention policy decided 2026-08-05 (process-and-discard, suggest amount/date only, nothing stored — see decision log below) and scan-flow UX decided 2026-08-06 (a "Scan receipt" button inside Quick Add, not a separate entry flow). See `12-ux-options-review.md` Part B.3.
4. Multi-property operational refinements. UX decided and confirmed with working prototypes 2026-08-06: no persistent header switcher; a single "Default property" setting in Account; Quick Add shows the property as a quiet tappable segment in its own title ("Add transaction for Kandy BnB"); Dashboard/Reports always show the combined total with a "see by property" disclosure, never a picker; Transactions gets property as one more row in the existing Filters sheet. All of it only renders once a workspace has a second active property. See `12-ux-options-review.md` Part B.5 and C.9.
5. Assets, maintenance, housekeeping, inventory, and staff workflows. Housekeeping and inventory now has a real, named trigger (Jalie's housekeeper) and expanded UX thinking as of 2026-08-06 — room checklist (informed by an existing `guesthouse_app_ui.html` demo), a simple inventory list, and staff hours/day-off tracking, two sub-questions on the latter still open. See `12-ux-options-review.md` Part C.6. Staff nav-visibility model decided 2026-08-04 (see `07-domain-model-and-schema.md` §10) — reuse the existing `staff` role, add a per-membership `visible_areas` toggle when this is actually built. Priority stays where it is on this list (confirmed 2026-08-04); a real staff member needing it didn't move it forward. Assets/maintenance/broader staff workflows remain speculative and far away. **Overtime, deferred 2026-08-19:** Recurring payments (item 2) deliberately doesn't model overtime as its own concept — a housekeeper's extra-days week is just an edited amount plus a free-text note at Mark-paid time. Auto-generating the overtime amount from an actual housekeeping calendar (so the reminder shows up pre-calculated rather than needing a manual bump) is real future scope, but only once this item is built — no schema exists yet to compute it from.
6. Booking platform, calendar, and Home Assistant integrations. Deferred (revised 2026-08-06) — Jalie already has iCal wired into Home Assistant directly, so there's no clear use case yet for NIVA connecting to either. See `12-ux-options-review.md` Part C.7/C.8.
7. ~~In-app dashboard notifications.~~ Done 2026-08-19 — a dashboard attention strip, computed live from existing data (no notification records, no read state). Ships today with two item types: "Last entry" (the single most recent transaction, any period) and a stale-exchange-rate nudge (administrators only, a non-default currency's reference rate untouched 30+ days). "Bill due soon" will slot in here once Recurring bills (item 2) exists — the strip itself doesn't need to change for that. See `src/lib/attentionStrip.ts` and `12-ux-options-review.md` Part B.4 and C.5.
8. Mobile OS push notifications (Web Push) — a separate, later feature on top of item 7, once there's a permission prompt, a stored push subscription, and a trigger to send from. See `12-ux-options-review.md` Part C.5.
9. ~~Reliable offline transaction queueing.~~ Decided 2026-08-06: not building this. No offline writes, ever — Quick Add simply disables saving while offline. Reads of already-loaded data still work via the PWA's cached shell.
10. ~~Visible app version.~~ Done 2026-08-02 — shown on Account (`v{{ __APP_VERSION__ }}`, injected from `package.json` at build time via `vite.config.ts`'s `define`). `package.json`'s version is now the source of truth and should stay in sync with the latest git tag.
11. If the approximate combined total (see "Currency conversion policy" below) ever needs to hold up for tax/accounting purposes rather than a quick gut-check, upgrade to a per-transaction locked-in exchange rate (or an automated live-FX-rate lookup by transaction date) instead of the current admin-maintained report-time rate.

### Currency conversion policy (decided 2026-08-02)

Real per-currency totals never blend — that principle from Phase 4 stands everywhere. What changed: Dashboard and Reports now show one extra, clearly-labeled **approximate combined total** (in the workspace default currency) whenever a period has activity in more than one currency. It's built from a reference rate an administrator sets per currency in Currencies admin (migration `0010`), applied only at report display time — never stored against a transaction and never used in Transactions drill-down links, but (2026-08-02, second round of feedback) it *is* included in the Reports CSV/PDF export, along with every rate actually used, so a downloaded report never depends on going back to Currencies admin to make sense of it. It stays visually distinct everywhere (dashed border, "≈" prefix, "using rates set on [date]") so it can't be mistaken for a real total. A currency with no rate set is called out by name rather than silently excluded from the number. See `src/lib/currencyApprox.ts` for the computation and `docs/04-ui-ux-principles.md` / `05-information-architecture.md` for the presentation rule.

Options considered and not chosen for now: no in-app conversion at all (too little help for a genuine "how are we doing" question); a rate locked in per transaction at entry time (more historically accurate, but adds a field to the fastest/most-used screen in the app); a live FX API looked up automatically by transaction date (most accurate and zero upkeep, but a new external dependency and materially more build work). Either of the latter two is the natural upgrade path if this ever needs to be accounting- or tax-grade rather than a quick pulse-check.

## Quality gates for every change

- Product/documentation impact assessed and updated.
- Authorization and validation considered.
- Loading, empty, error, and success states implemented.
- Responsive and keyboard/touch behavior reviewed.
- Relevant automated tests added or updated.
- Migration and rollback compatibility considered for data changes.
- No secrets, service keys, or sensitive sample data committed.
