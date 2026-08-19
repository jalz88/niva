# UX Options Review

**Status:** Draft — awaiting decisions
**Purpose:** Before any more building, walk through every screen NIVA has (and every pipeline feature) as a UX question, not a visual one — how it behaves, what it assumes about the user, what the alternatives are. `08-design-system.md` and the 2026-08-04 navigation decision cover how things *look*; this covers how they *work*.

**How to use this:** each item has a primary question and 2-3 options with real trade-offs, not just "before/after." For shipped screens, Option A is always what's live today — it's not a placeholder, it reflects real user testing with you and your wife, so treat "keep as shipped" as a genuine option, not the default to beat. Tell me which letter you want per item (or "keep A" for everything you don't want to touch) and I'll lock the chosen ones into the relevant doc before we build anything.

## Decisions log (2026-08-06)

| Item | Decision |
| --- | --- |
| A1. Sign in | Keep A. Plan B (longer session + passkey/biometric) as a future improvement, not now. |
| A2. Dashboard | Redesigned and shipped 2026-08-19 — hero net number with expandable currency detail, no recent-transactions list. Attention strip and housekeeping glance not built yet (nothing feeds them until Recurring bills/Notifications/Housekeeping exist). Full shape in Part C.1. |
| A3. Quick Add | Keep the UX (A). Visual density flagged as real feedback — resolved and shipped 2026-08-18, see Part C.3. |
| A4. Transactions list | Keep A. Filters consolidate into one "Filters" button + bottom sheet instead of several dropdowns — shipped 2026-08-18, see Part C.2. |
| A5. Transaction detail | Keep A. |
| A6. Edit transaction | Keep A. Inherits Quick Add's visual refresh when that happens. |
| A7. Delete/archive | Keep A. |
| A8. Reports | Option C — plain-language insight line. Shipped 2026-08-19. |
| A9. Administration | Keep A. |
| A10. Account | Keep A. |
| B1. Transaction export | Option A, plus a confirm step for large filtered results — see Part C.4. Shipped 2026-08-19. |
| B2. Recurring bills | Option A. |
| B3. Receipts & OCR | Option A. |
| B4. In-app notifications | Option B (dashboard strip, no inbox). Lifecycle explained, plus a separate future Web Push item — see Part C.5. |
| B5. Multi-property | Decided 2026-08-06, confirmed after real prototypes — see Part C.9. No global header switcher; a single "Default property" setting in Account, quiet context everywhere else. |
| B6. Housekeeping & inventory | Expanded scope: room checklist + simple inventory + staff hours/day-off tracking. Two open sub-questions — see Part C.6. |
| B7. Assets/maintenance/staff | Deferred. Option B (dedicated module) noted as the eventual direction, far away. |
| B8. Booking/calendar/Home Assistant | Deferred (revised 2026-08-06) — Jalie already has iCal wired into Home Assistant directly; no clear use case yet for NIVA connecting to either. See Part C.7/C.8. |
| B9. Offline transactions | Confirmed: never, not just "for now." |

## Part A — Shipped screens

### 1. Sign in
*Primary question:* how does a non-technical user get in reliably, on what's basically a dedicated phone?
- **A (shipped).** Single email/password screen, no chrome before auth.
- **B.** Longer-lived session plus a device-level unlock (passkey/biometric via the PWA) so day-to-day opening the app doesn't mean typing a password on a phone that's already hers.
- **C.** Email magic-link/OTP instead of password — removes "forgot password" as a failure mode entirely, at the cost of needing email access every sign-in.

*My lean:* keep A; B is the natural next step once password re-entry actually becomes friction, not before.

### 2. Dashboard
*Primary question:* "how's the business this month," answered within seconds of opening the app.
- **A (shipped).** Stacked summary cards (income/expenses/net) per currency, approximate combined total, revenue by platform, last 5 transactions.
- **B.** A short "attention strip" above the monthly summary — the single most recent action ("Last entry: Airbnb payout, 2h ago") plus anything needing action (bill due soon, stale exchange rate). This becomes the natural home for Recurring bills and Notifications once they exist.
- **C.** Role-aware landing: administrator/manager keep the financial dashboard; once Housekeeping/Staff exist, a staff sign-in lands on their own task view entirely, not a stripped financial one. Ties directly into the staff visible-areas decision already documented in `07-domain-model-and-schema.md` §10.

*My lean:* keep A's core now; plan for B as the landing spot for future alerts rather than redesigning Dashboard twice. C should be decided alongside Housekeeping & Inventory (Part B, item 6).

### 3. Quick Add (income/expense)
*Primary question:* record a transaction in ~10 seconds, one-handed.
- **A (shipped).** Single-screen form, Income/Expense toggle first, up to 3 favorite chips, no wizard.
- **B.** Smart defaults — pre-fill the form from your most common combination (e.g. most expenses are Groceries/Cash) so most entries become "confirm, don't fill." Pure client-side heuristic, no schema change.
- **C.** Lead with "scan receipt" once OCR ships, form fields appear pre-filled for review rather than being the first thing tapped.

*My lean:* A stays the baseline. B is cheap and worth doing once there's a few months of history to learn from. C should be additive to A (see Part B, item 3), never a replacement flow.

### 4. Transactions list
*Primary question:* what money moved, and can a specific entry be found fast?
- **A (shipped).** Chronological, grouped by date, filter chips, defaults to this month, loads 20 at a time.
- **B.** A persistent search box (amount, note, supplier) above the filters — "find that one weird March expense" is a different task than "browse this month."
- **C.** Saved filter presets ("Airbnb income only," "Cleaning expenses") so a recurring question doesn't mean re-tapping the same filters every time.

*My lean:* keep A; B is the highest-value addition once history grows past a year or two, and pairs naturally with transaction export (Part B, item 1) — both need "find things" first.

### 5. Transaction detail
*Primary question:* what exactly was recorded?
- **A (shipped).** Read-only view, role-aware audit trail, Edit/Delete shown only when permitted.
- **B.** Inline edit — tap any field to change it right here, no separate Edit screen. Fewer taps, but blurs viewing vs. editing and complicates the concurrency-conflict handling Edit already has.

*My lean:* keep A — the explicit "you're now changing this" framing is a real safety feature for financial records, not friction for its own sake.

### 6. Edit transaction
*Primary question:* correct a mistake safely.
- **A (shipped).** Same form as Quick Add, pre-filled, "Editing [type]·[amount]" header, blocks silent overwrite on conflict.
- **B.** A "what changed" confirm step before saving (e.g. "Amount: LKR 4,500 → LKR 5,000") specifically for amount/date changes — the two fields most likely to represent a real correction rather than a typo fix.

*My lean:* B is worth adding as a lightweight, amount/date-only confirm — not a full wizard, just one extra glance before a number changes.

### 7. Delete / archive transaction
*Primary question:* remove a mistaken entry without losing the ability to recover it.
- **A (shipped).** Confirmation dialog naming the exact transaction, non-destructive archive under the hood, short Undo toast.
- **B.** No confirmation dialog — delete immediately, rely on a longer, more prominent Undo toast instead.

*My lean:* keep A. A confirm step for money leaving the record matches "financial records deserve care" (blueprint guardrail 6); B trades that away for marginal speed.

### 8. Reports
*Primary question:* where did money come from and go, for a chosen period?
- **A (shipped).** Totals card, approximate combined total with rates shown, revenue-by-platform and expenses-by-category tables with drill-down, CSV/PDF export.
- **B.** Comparison mode — this period next to the same period last month/year, side by side.
- **C.** One plain-language line at the top ("Expenses were 12% higher than last month, mostly Utilities"), computed client-side from numbers already fetched — no new data.

*My lean:* keep A; add C first — cheap, and directly useful for a non-technical reader. B is the bigger version of the same idea, worth it once there's 12+ months of history to compare against.

**Shipped 2026-08-19.** `src/lib/period.ts` gained `previousPeriodRange()` — a calendar-aware "the comparable period before this one" (last month for this month, last year for this year, an equal-length preceding window for a custom range). `ReportsView.vue` fetches that second period through a second `useReports()` instance (same RPCs, no new endpoint) and `src/lib/reportInsight.ts` turns the two into one sentence: "Expenses were 12% higher than last month, mostly Utilities." Deliberately conservative — skips the line entirely (no placeholder, no guess) when there's nothing clean to compare: no prior-period expenses, a missing currency reference rate, or a change under 1% either way (shown as "about the same" instead of "0% higher"). The "mostly X" category callout only appears for a single-currency period, since comparing category totals across currencies would mix figures the same way an un-approximated total would. Lint, typecheck, and build all clean.

### 9. Administration (shared list/add/edit/archive pattern)
*Primary question:* manage business values without touching code.
- **A (shipped).** One flat list of management areas (Properties, Platforms, Categories, Payment methods, Suppliers, Currencies, Users), same pattern each.
- **B.** Grouped landing page (Financial setup / Property operations / Access) once Housekeeping/Assets/Staff each add their own admin areas and the flat list stops being scannable.

*My lean:* keep A now (7 items is still fine); revisit B only when new feature areas actually start adding entries — same "don't build ahead of the need" rule as everything else here.

### 10. Account
*Primary question:* who am I, and how do I sign out?
- **A (shipped).** Name edit, email/role display, sign out, app version footer.
- **B.** A lightweight "what's new" entry point here, tied to the semver discipline already in place — one place to notice the app changed without you explaining every update verbally.

*My lean:* B directly answers the "how do updates get communicated" question from earlier — worth adding once there's a real changelog to show.

### 11. Navigation chrome
Already decided (2026-08-04) — bottom nav with a raised Add and a swipe-up More sheet. No open options; see `09-wireframes.md` "Navigation chrome."

## Part B — Pipeline features

### 1. Transaction export (filtered list)
*Primary question:* get a filtered set of transactions out of NIVA, not just report totals.
- **A.** A "Download" action on the Transactions list itself, exporting exactly whatever filters/search are currently applied — reuses the CSV pattern already built for Reports.
- **B.** A separate "Export" screen with its own filter builder, deliberately apart from the browsing filters — more intentional, avoids accidentally exporting an unfiltered mountain of data.

*My lean:* A — no new screen, no new pattern, matches "everything configurable, nothing complicated."

### 2. Recurring bills & due-date reminders
*Primary question:* never miss paying a known, repeating bill.
- **A.** A dedicated Recurring bills list (in the More sheet) — define a bill once (amount, category, payment method, due day); it shows upcoming/overdue; "Mark paid" creates the real transaction and advances the due date.
- **B.** Recurring bills as a templated transaction type inside Transactions, rather than a separate feature — fewer new concepts, but blurs "a bill I owe" with "money that already moved."
- **C.** Reminders only, no tracking screen — a date-based nudge on the Dashboard attention strip ("Wifi bill usually due around the 5th"), no "mark paid" state machine at all.

*My lean:* A. An unpaid bill isn't a transaction yet (no amount-moved date) — stretching the transaction model to cover it would violate "one source of financial truth." C is worth building as the notification surface on top of A, not instead of it.

### 3. Receipts & OCR — the scan flow
Policy already decided (2026-08-05): process-and-discard, suggest amount and date only, nothing stored. What's still open is where "scan a receipt" lives.
- **A.** A "Scan receipt" button inside Quick Add, above Amount — opens the camera, runs OCR, pre-fills Amount and Date, user reviews before saving like any other field. One entry form, scanning is a shortcut inside it.
- **B.** Scanning is its own first step before Quick Add opens — "Add transaction" becomes a choice of "Scan receipt" or "Enter manually," both landing on the same form from different starting points.

*My lean:* A — keeps Quick Add the one true entry form (no wizard, per the existing principle); OCR is a shortcut for two fields, not a parallel flow to maintain.

### 4. In-app notifications
*Primary question:* how does a non-technical user learn "something needs attention" without OS push?
- **A.** A bell icon with a badge count opening a simple reverse-chronological inbox (bill due soon, exchange rate stale 30+ days), with read/unread state.
- **B.** No separate inbox — everything surfaces directly on the Dashboard attention strip (Part A, item 2) and disappears once handled; nothing to read-and-archive separately.

*My lean:* B for now. A whole inbox is real complexity — read state, retention, empty states — for what's currently one or two notification types. Revisit A once there are enough distinct types that a single dashboard strip gets crowded.

### 5. Multi-property operational refinements
*Primary question:* once a second property exists, what actually changes?
- **A.** A header property switcher plus a genuine "All properties" aggregate everywhere Dashboard/Reports already support it (the report queries already accept a nullable property filter).
- **B.** Property becomes its own top-level tab rather than a header filter — right if properties end up needing separate operational views (separate housekeeping, separate staff), not just separate financial filters.

*My lean:* A until Housekeeping/Assets/Staff exist per-property; B becomes worth it once "property" means more than "which numbers am I filtering by."

### 6. Housekeeping & inventory (staff-facing)
*Primary question:* what does your housekeeper actually need to do in the app, day to day?
- **A.** A simple per-visit checklist (rooms cleaned, supplies restocked) plus a running inventory list she can flag "low stock" on — no scheduling logic, just state she updates.
- **B.** A scheduled task list — administrator-assigned, due dates, done/not-done. More structure, but needs someone to actually plan and assign tasks, which may not match how a one-person household role works day to day.
- **C.** Inventory only, no task-tracking — a shared supplies list with quantities, deferring "did she clean the rooms" entirely.

*My lean:* this is the one item here worth a real conversation with her (or your housekeeper) before picking — it depends on how she actually works, not a general pattern. Absent that: C first (cheapest, solves the concrete "did we run out" problem), A next if simple checklists prove useful.

### 7. Assets, maintenance, and broader staff workflows
Still speculative — no named trigger yet, unlike housekeeping/inventory. Worth naming the fork early so a later decision isn't made in a vacuum:
- **A.** "Asset" as a lightweight config list (like Properties/Platforms) that expense transactions can optionally tag ("this expense was for the pool pump") — maintenance history falls out of transaction history for free.
- **B.** A dedicated Assets/Maintenance module with its own records and schedules, independent of transactions — more capable, but a second source of truth to keep in sync with money actually spent.

*My lean:* A, whenever this becomes real — matches the blueprint's own decision rule ("can this be represented by an existing core object?") almost exactly.

### 8. Booking platform / calendar / Home Assistant integrations
The most speculative item on the roadmap — nothing worth locking in yet. The one fork worth naming early: **read-only** (NIVA displays data pulled from elsewhere, never writes back) versus **two-way sync** (NIVA can also push changes). Read-only is dramatically simpler and lower-risk, and satisfies "understand what's happening" without taking on booking-platform-as-source-of-truth complexity. Defer the real decision until a specific integration is actually in scope.

### 9. Offline transaction queueing
*Primary question:* what happens if she adds a transaction with no signal — gated on "a complete conflict-resolution design" per the roadmap.
- **A.** Queue-and-sync — offline saves are held locally, clearly marked "waiting to sync"; on reconnect, a genuine conflict (rare, single property, low write concurrency) blocks and shows both versions rather than silently picking one.
- **B.** No offline writes at all — Quick Add simply disables saving with "you're offline, try again once connected." Reads of already-loaded data still work via the PWA's cached shell.

*My lean:* B until this is an actual reported problem, not a hypothetical one — matches blueprint guardrail 1 ("build a foundation, not speculative features") and avoids real conflict-resolution UX for a scenario that hasn't happened yet.

## Part C — Follow-up decisions and open threads (2026-08-06)

### C.1 Dashboard, redesigned

New hierarchy, top to bottom:

1. **Attention strip** — only rendered when there's something to act on (a recurring bill due soon, a stale exchange rate). Empty by default; nothing shown when there's nothing to say.
2. **Hero net number** — one number, reusing the approximate-combined-total computation that already exists (`currencyApprox.ts`) when a period spans more than one currency, or the real net when it doesn't. A collapsed "See currency breakdown" disclosure underneath reveals the real per-currency figures on tap — replaces always-stacked per-currency cards, which is what was eating more than half the screen.
3. **Housekeeping glance** — shown to administrator/manager *alongside* the financial view, not instead of it (staff gets their own role-scoped landing per A2/§10 of the schema doc, but admin/manager see both). Renders nothing at all when there's nothing worth surfacing — no "0 of 0 rooms" filler. A simple v1 (today's task completion, day-off status) only needs the Housekeeping module itself; the richer version ("is the room booked for today's checkout already cleaned") needs the iCal read (C.7) too, so it can ship in stages.
4. **Revenue by platform** — only shown once a workspace has more than one active platform, same rule already used for the property selector ("only rendered once a workspace has more than one active property, otherwise there's nothing to choose"). With one platform (today's reality — Airbnb only, or Airbnb+Agoda but only one actually used) it would just repeat the hero number, so it's simply absent rather than shown with nothing to compare. Decided 2026-08-06.
5. **Recent transactions — removed.** Transactions is one tap away in the nav; no need to duplicate the list here.

Mocked interactively in chat (2026-08-06) — the hero card's expand/collapse and the housekeeping glance's three states (active/day-off/empty) are the parts worth re-checking before this gets built for real.

**Shipped 2026-08-19 (partial):** hero net + expandable currency breakdown, and the recent-transactions removal, built in `src/views/DashboardView.vue`. Revenue by platform now correctly gates on the count of *active configured platforms* (there was a latent bug — the old code gated on currency-group count instead). The header property `<select>` was removed entirely rather than carried forward, since C.9 already ruled out a persistent switcher for good — not just for this pass. Attention strip and housekeeping glance are still not built: there's no recurring-bills, notification, or housekeeping data yet to feed them, so building the UI now would just be empty chrome. Lint, typecheck, and build all clean; one E2E test (`e2e/transactions.spec.ts`) updated since it asserted on the now-removed recent-transactions text.

**Period picker removed 2026-08-19.** Raised after seeing the shipped screen: the header's This month/Last month/This year/... picker (added 2026-07-23) contradicted Dashboard's own stated purpose above ("this month," not "any period") and duplicated what Reports already owns. Agreed — removed entirely; Dashboard is now permanently scoped to the current month, with Reports one tap away for anything else. `docs/09-wireframes.md` updated to match.

### C.2 Transactions filters

Replace the several inline dropdowns with a single "Filters" button that opens the same bottom-sheet pattern already built for the nav's More menu (`MoreSheet.vue`) — one sheet holding Period, Property (once multi-property exists), Type, Category, and Platform, with Apply/Clear at the bottom. Active filters keep showing as removable chips above the list, so clearing one filter doesn't require reopening the sheet. Reuses a pattern already shipped and already familiar, rather than teaching a new one. **Decided 2026-08-06:** confirmed after seeing it — single Filters button + bottom sheet, active filters as removable chips.

**Shipped 2026-08-18:** built in `src/views/TransactionsView.vue` using a new shared `src/components/ui/BottomSheet.vue` (the overlay/handle/header chrome factored out of `QuickAddSheet.vue`, which now uses it too). Type/Property/Platform are borderless chip rows; Category is a scrollable borderless list (can be long); Period keeps `PeriodPicker`'s native selects for now, lightly restyled to borderless/shadow to match. Property only appears once a workspace has 2+ active properties — not visible today. Filters apply live as each is tapped (unchanged from before); "Apply" just closes the sheet, "Clear" resets and leaves it open. Lint, typecheck, and build all clean.

### C.3 Quick Add density

Real feedback, not dismissed. Three concrete layout directions shown visually in chat 2026-08-06:
- **Progressive reveal** — Platform (income) / Supplier (expense) and Notes only appear once Category is picked, instead of every field visible at once. Same single screen, less shown at first glance.
- **Two-step** — Amount, type, and Category on a first screen; payment method, platform/supplier, and notes on a second. Lighter per screen, but is a genuine departure from the "no wizard" principle set for this screen — worth deciding deliberately, not by default.
- **Same fields, tighter grouping** — no fields removed or deferred; visual sections (Amount & type / Category & payment / Details) with clearer spacing and smaller row heights do the work instead.

**Decided 2026-08-06, refined after review:** Progressive reveal + Tighter grouping, combined, with a distinct visual language — no box borders on inputs or chips (separation via elevation/shadow and fill color instead), no native dropdown chrome (custom borderless option lists), and optional fields (Date, Platform/Supplier, Notes) collapse to a single tappable line, expanding in place only when tapped. Required fields (Category, Payment method) stay always visible as chips. Working prototype at `docs/quick-add-prototype.html`, styled from the real design tokens in `src/styles/tailwind.css`. **Resolved 2026-08-06:** adopt throughout the app, not just here — formalized in `08-design-system.md` §5.1 "Minimalist form language." Existing shipped screens (Administration, anything pre-dating this decision) get a follow-up visual pass rather than an immediate retrofit.

**Shipped 2026-08-18:** built for real in `src/components/transactions/TransactionForm.vue` (shared by Quick Add and Edit), backed by two new reusable pieces — `src/components/ui/ChipPicker.vue` and `src/components/ui/DetailRow.vue`. Category/Payment method use the field-label style per C.12. Lint, typecheck, and build all verified clean; not yet exercised through a signed-in Playwright run in this environment (no test credentials available here) — worth a manual pass in the app before the next release-readiness check. The multi-property title from C.9 was deliberately left out of this pass — see the note in `08-design-system.md` §5.1.

**Sub-category treatment — decided 2026-08-06, tested with Maria:** three real options were prototyped (inline chips beneath Category; a "add specific item" link opening a bottom sheet; skipping sub-category in Quick Add entirely, added later from detail). Maria, the actual daily user, chose **inline chips** for speed — even though the bottom sheet kept Category visually calmer, real-use speed won over on-paper cleanliness. See `08-design-system.md` §5.1.

### C.4 Export confirmation threshold

Decided 2026-08-06: confirm before exporting once the filtered result exceeds **100 transactions** (revised down from an initial 500 suggestion) — "This will export 240 transactions — continue?" Same confirmation pattern already used for delete, no new UI concept. Under 100, it exports immediately.

**Shipped 2026-08-19.** `src/lib/csv.ts` now holds the CSV-quoting/download helpers shared by both Reports and Transactions (extracted out of `reportCsv.ts`, which re-exports `downloadTextFile` for backward compatibility). `src/lib/transactionCsv.ts` builds the file — one row per transaction (Date, Type, Category, Property, Payment method, Platform, Supplier, Amount, Currency, Notes), category formatted the same "Parent · Sub-category" way the on-screen list already shows it. Because the Transactions screen only ever has one page's worth of rows loaded at a time, export needed its own fetch: `useTransactions().listAll()` loops past the normal 100-row page cap to pull every transaction matching the current filters, uncached (an export is a one-off, not something the screen re-renders from). The Download button sits next to Filters and only appears once there's something to export; above 100 matching rows it opens the same `ConfirmDialog.vue` used for delete before fetching and downloading.

### C.5 In-app notifications — lifecycle, and a separate Web Push item

**Lifecycle:** strip items aren't stored notification records. They're computed live, every time the dashboard loads, straight from data that already exists — a recurring bill due within N days and not yet marked paid; a reference rate untouched for 30+ days. There's no "read" state and nothing to retain. An item disappears automatically the moment its underlying condition resolves (bill marked paid, rate updated) — no notifications table, no cleanup job.

**Mobile notification panel (Web Push):** genuinely possible, but a separate, larger feature — not what Option B (the dashboard strip) is. Works for an installed PWA on Android (any browser) and iOS 16.4+ (already true for NIVA, since it's installed to the home screen). Needs a permission prompt, a push subscription stored server-side, VAPID keys, a service worker push handler, and something to actually trigger sends (e.g. a daily scheduled check for bills due soon). Added to the roadmap as its own future item — additive on top of the dashboard strip, never a replacement for it.

### C.6 Housekeeping & inventory, expanded

Reviewed `guesthouse_app_ui.html` — a solid starting concept for the room-checklist half: per-room task lists with completion state, a caretaker/owner mode toggle, daily/weekly/monthly recurring tasks, and an admin overview/history/photos/reports view. Confirmed: no inventory, no staff hours/day-off tracking — matches what was flagged.

**Inventory — simple, to begin with:**
- **A.** Shared supply list (administrator-configured, same list/add/edit/archive pattern already used for Categories and Payment methods), with a one-tap status per item — Good / Low / Out. No counted quantities.
- **B.** Numeric quantity per item, adjusted up/down, with a small history log of who changed what and when (mirrors the audit pattern already used elsewhere in NIVA).
- **C.** Numeric quantity, no history — a middle ground between A and B.

**Decided 2026-08-06: Option A** — Good/Low/Out status per item, no counted quantities. Fastest for a non-technical daily user, reuses an existing UI pattern end to end, and the Dashboard housekeeping glance (C.1) can show "2 items low" straight from it.

**Staff hours & day-off tracking — decided 2026-08-06:**
- Hours are admin-entered afterward, like a simple timesheet — no self clock-in/out. This needs no new screen for her at all; it reuses the same list/add/edit pattern already used everywhere in Administration (a row per work day: date, hours). Weekly/monthly totals are a straightforward sum over that list, filterable the same way Reports already filters by period.
- Days off are set explicitly on a calendar, week by week, by an administrator — no default weekly pattern to maintain. This is what feeds the Dashboard housekeeping glance's "day off today" state (C.1).

### C.7 / C.8 iCal and Home Assistant — deferred (revised 2026-08-06)

Jalie already has iCal wired into Home Assistant directly (bookings flow into HA today, independent of NIVA). That removes the original justification for C.7 (NIVA reading iCal itself to drive the housekeeping glance) — there's no clear use case yet for NIVA connecting to either iCal or Home Assistant, since HA already has the booking data and NIVA doesn't currently need it for anything concrete. Deferred, not built, not scoped further — matches blueprint guardrail 1 ("build a foundation, not speculative features"). If a real need shows up later (e.g. NIVA wanting to show "rooms booked today" without opening HA separately), the more sensible shape then is probably NIVA reading *from* Home Assistant rather than parsing iCal a second time — but that's a decision for when there's an actual reason, not now.

The housekeeping glance on Dashboard (C.1) drops its richer "is the booked room already cleaned" version accordingly — it stays at the simpler v1 (task completion, day-off status) that only needs the Housekeeping module itself, with no dependency on booking data.

### C.9 Multi-property — decided 2026-08-06, confirmed with real prototypes

Walked through from scratch rather than assumed, because both NIVA's own business and most likely future customers are single-property today ("small scale BnBs" — a second property, if it ever comes, is years out). The guiding question throughout: does this need a persistent global switcher, or can it stay quiet until the rare moment it's actually needed? Landed on quiet.

**No persistent header switcher anywhere.** Instead:

- **Account** gets one new row, "Default property" — the single place you deliberately change anything. Drives what Quick Add uses. Appears only once a second property exists (same rule as every other property-related control in this app).
- **Quick Add** shows the property as part of its own title — "Add transaction for Kandy BnB" — not a separate field or row. The property name is a quiet tappable segment (styled like a link, not a control), so switching for one entry is one tap without ever looking like a persistent picker. Prototyped and confirmed working in `docs/quick-add-prototype.html`.
- **Dashboard and Reports** never show a switcher at all. Once a second property exists they always show the combined total first, with a "see by property" disclosure underneath — same pattern as the currency breakdown already shipped. Prototyped and confirmed in `docs/dashboard-prototype.html`.
- **Transactions** gets no new UI — property becomes one more row inside the Filters sheet already built, defaulting to unfiltered.

All four pieces only render once a workspace actually has a second active property — for the common single-property case (today's reality, and likely most future customers), nothing changes and nothing new appears anywhere in the app.

### C.10 Sub-category multi-select — considered and rejected (2026-08-06)

Real question raised: a single grocery receipt can cover milk, bread, and eggs — should a transaction support multiple sub-category tags? Today's schema only allows one (`category_id` points at either the parent or one sub-category, never both, never more than one). Three options were weighed: keep single-select as-is; add non-exclusive sub-category tags via a new join table (doesn't touch existing report totals, since nothing sums by sub-category today, but can't give an accurate "spent on Milk" figure since the amount isn't split); or true itemized line items (accurate, but genuine ledger territory the blueprint explicitly excludes).

**Decided: keep single-select, no schema change.** Confirmed by real evidence, not guessed — Maria already categorizes her own grocery purchases in a single-select way in an app she uses day to day, so the natural mental model already matches what NIVA has. A mixed grocery run just stays at the parent "Groceries" level with no sub-category chosen; sub-category remains for a transaction that's specifically and entirely one thing.

### C.11 Quick Add — "Category and payment" group label removed

The section header "Category and payment" repeated the word "Category" immediately above the "Category" field label beneath it — genuinely redundant since both "Category" and "Payment method" already fully describe their own content without a wrapping label. Removed the group header entirely; the two field labels stand alone. One less line, no loss of clarity. Updated in `docs/quick-add-prototype.html`.

### C.12 Quick Add — Category/Payment method label style, confirmed 2026-08-06

Question raised: should "Category" and "Payment method" match the bold-uppercase section-header style used for "AMOUNT AND TYPE" and "DETAILS"? Compared live via a toggle in `docs/quick-add-prototype.html`. **Decided: keep the lighter field-label style, no promotion.** Category and Payment method are the same tier as Date, Platform, Supplier, Notes — required fields, not group headers — so giving them section-header styling would imply a hierarchy level (something "under" them) that doesn't exist.
