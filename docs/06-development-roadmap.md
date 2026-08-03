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

1. ~~Export of Reports as CSV or print/PDF.~~ Done 2026-08-02 — see `src/lib/reportCsv.ts` and ReportsView's "Print / Save as PDF" (browser-native print, no PDF library). Exporting a filtered *transaction list* (not just report totals) is still open.
2. Recurring bills and due-date reminders.
3. Receipt uploads and OCR only after storage/privacy/retention choices are made.
4. Multi-property operational refinements.
5. Assets, maintenance, housekeeping, inventory, and staff workflows.
6. Booking platform, calendar, Home Assistant, and notification integrations.
7. Reliable offline transaction queueing only with a complete conflict-resolution design.
8. Visible app version (e.g. near "Signed in as" in the sidebar or on Account) — raised by Jalie 2026-08-02, small/low-risk, not yet scheduled.
9. If the approximate combined total (see "Currency conversion policy" below) ever needs to hold up for tax/accounting purposes rather than a quick gut-check, upgrade to a per-transaction locked-in exchange rate (or an automated live-FX-rate lookup by transaction date) instead of the current admin-maintained report-time rate.

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
