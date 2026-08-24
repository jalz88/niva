# Wireframes

**Status:** Foundation — approved direction, implementation pending
**Depends on:** `04-ui-ux-principles.md`, `05-information-architecture.md`, `08-design-system.md`
**Companion file:** `wireframes.html` — low-fidelity visual layout for Dashboard, Quick Add, Transactions list, and Reports on a mobile viewport.

Every screen below is defined by purpose, layout regions, key elements, and required states, per the UI "definition of done" in `04-ui-ux-principles.md` §10. Mobile is the primary spec; desktop deltas are noted where the layout changes rather than just widens.

## Sign in

**Purpose:** authenticate before any business data loads.

- Single centered card: NIVA wordmark, email field, password field, "Sign in" primary button, "Forgot password?" link.
- States: default; validating (inline field errors, e.g. "Enter a valid email"); submitting (button shows spinner, disabled); invalid credentials (error banner above the form, fields retain typed values); locked-out/rate-limited (explain and suggest password reset).
- No navigation chrome before authentication.

## Dashboard

**Purpose:** "How is the business this month?" — answered within seconds of opening the app. Always this month, no exceptions — Reports owns every other period, comparison, and drill-down; a duplicate picker here would just dilute the pulse-check (redesigned 2026-08-19, see `12-ux-options-review.md` C.1).

Mobile layout, top to bottom:

1. Header: title and "Signed in as [name]" only — no property selector, no period picker. C.9 already ruled out a persistent property switcher anywhere in the app (property becomes relevant again only via a future "see by property" breakdown once a second property exists — prototyped in `dashboard-prototype.html`, not built).
2. Attention strip — quietly absent when there's nothing to say, computed live on every load rather than stored (`src/lib/attentionStrip.ts`, see `12-ux-options-review.md` C.5). Ships today with "Last entry: [category] [income/expense], [time ago]" (any period, links to that transaction); administrators only, "[currency] exchange rate hasn't been updated in [N] days" (links to Currencies admin); manager/administrator only, one line per recurring payment that's overdue or due within 3 days (e.g. "Maria — wages — due today," links to Recurring payments) — see the Recurring payments section below; and, also manager/administrator only, "Housekeeping: [done] of [total] rooms done today ([pct]%)" once today's checklist has at least one task and isn't 100% complete yet (links to Today's schedule) — see the Housekeeping section below.
3. Hero card: one net number for the period — the exact net if only one currency had activity, the approximate combined total (² prefixed, see "Currency conversion policy" in `06-development-roadmap.md`) if more than one did. A "See currency breakdown" disclosure underneath, collapsed by default, reveals the real per-currency Income/Expenses/Net figures (and the approximate-total's rate detail, when relevant) on tap.
4. Revenue by platform — only rendered once the workspace has more than one *active configured* platform (same "quiet until needed" rule as the old property selector), not just because the current period happens to have more than one platform's worth of data. Small horizontal bar list, tied to the fixed this-month period.
5. Floating Quick Add button, bottom-right, always reachable while scrolling.
6. Bottom navigation: Dashboard, Transactions, raised Add, Housekeeping, More (→ Reports and Recurring payments when permitted, grouped **Money**; Administration when permitted and Account, grouped **Account** — see "Navigation chrome" below).

No recent-transactions list — Transactions is one tap away via the nav, so duplicating it here just repeated content. The housekeeping glance scoped in C.1 shipped 2026-08-24 as the attention strip's "Housekeeping: X of Y rooms done today" line (item 2 above) rather than a dedicated card — a fuller single-glance treatment (the "single-glance % on Dashboard" ask from 2026-08-23) is deferred until there's real data to judge it against.

Desktop delta: navigation moves to a persistent left sidebar; layout otherwise unchanged (no side-by-side treatment — there's only one hero card now, not a summary-card-plus-platform-revenue pair to place side by side).

States: loading (skeleton blocks, no fake numbers); empty (no transactions yet this month → "No transactions this month. Add your first transaction." with Quick Add shortcut); error (period totals failed to load → inline retry, does not block Quick Add).

## Quick Add (Income / Expense)

**Purpose:** record a transaction in ~10 seconds.

- Opens as a bottom sheet on mobile, a side panel or modal on desktop — never a full navigation away from context.
- Step 1: Income/Expense toggle (two large pill buttons) — determines every field below.
- No Property field. The transaction is recorded against whichever property the header property selector is currently set to (see Dashboard, above); with a single property this is invisible — there's simply nothing to choose. Revisit if/when NIVA supports mid-entry property switching from inside Quick Add.
- Category and Payment method are each entered via up to 3 favorite one-tap chips (administrator-configured in their respective Administration screens), plus a "More…" dropdown for anything not favorited. Category chips are scoped to the current Income/Expense toggle. A Sub-category dropdown appears only when the chosen category actually has sub-categories — most categories don't, and the field is simply absent for them (2026-07-20, real-user-testing feedback: keep the common path exactly as fast as before).
- Supplier (expense only, optional): a combo box — pick a previously used supplier, or choose "+ Add new supplier…" to type one on the spot. Either way it resolves to a real row in the Suppliers admin list.
- Form (single screen, no wizard): Amount (numeric keypad, currency prefix), Date (defaults to today), Category, Payment method, Platform (income only), Supplier (expense only), Notes (optional, collapsed by default).
- Primary action: **Save income** / **Save expense**, label changes with the toggle.
- States: validating inline per field as the user leaves it; saving (button → spinner + disabled, rest of form remains visible and unchanged); success (sheet closes, toast confirms "Expense saved — LKR 4,500 · Utilities", list/dashboard update without manual refresh); failure (sheet stays open, every value retained, error message near the top, **Try again** on the primary button).

## Transactions

**Purpose:** "What money moved?" — the full, filterable record.

- Header: active filters as removable chips (period, property, type, category, platform); "Filters" control to add more.
- Defaults to **This month** (matches the Dashboard's default period, per the Global context section above) rather than lifetime history — "All time" is one filter tap away. Loads 20 transactions at a time, with "Load more" for further back (2026-07-21, agreed with Jalie).
- List grouped by date, each row: category icon (color-coded by type but paired with a +/− glyph), category + property, payment method icon, amount (right-aligned, `text-amount`, sign-bearing color + glyph).
- Tapping a row opens Transaction detail.
- States: loading (skeleton rows); no transactions at all ("No transactions yet. Add your first transaction."); filtered-to-empty ("No transactions match these filters" + "Clear filters") — these two empty states use different copy per `04-ui-ux-principles.md` §5.

## Transaction detail

**Purpose:** "What exactly was recorded?"

- All recorded fields in a read-oriented layout: amount and type at the top, then date, property, category, payment method, platform/supplier, notes.
- Audit context appropriate to role (created by/at, last edited by/at) — visible to administrator/manager, hidden for staff/viewer.
- Edit and Delete actions shown only when the signed-in role permits them (staff and viewer see neither, per the roles table in `05-information-architecture.md`).

## Edit transaction

- Same field layout as Quick Add, pre-filled, header states "Editing [type] · [amount]" so the user always knows what they're changing.
- Primary action: **Save changes**. Success: "Transaction updated," dependent totals refresh. Concurrency conflict (record changed elsewhere): block silent overwrite, show a clear "This transaction was changed since you opened it" message with the current values and a way to reload before retrying.

## Delete transaction

- Rendered as a confirmation dialog, not a separate screen: names the exact transaction ("Delete this LKR 4,500 Utilities expense from 12 Jul?"), states the consequence ("This moves it out of your reports. An administrator can restore it from Administration → Archived.").
- Destructive button (**Delete transaction**) is not the default-focused element; Cancel is easier to hit by accident than Delete.
- Short-lived **Undo** toast after deletion (delete = archive under the hood, so undo is a real un-archive, not a promise NIVA can't keep).

## Reports

**Purpose:** "Where did money come from and go?"

- Period and property selectors at the top, persistent while scrolling (same period picker and single-property-hides-the-picker rule as the Dashboard, above); two download buttons alongside them (2026-08-02, Jalie's wife's feedback) — **CSV** (raw totals/platform/category numbers, opens in a spreadsheet) and **PDF** (the browser's native print dialog against a print-only layout — no PDF library, every modern browser can "Save as PDF" from it). Both hidden from the printed/PDF output itself via `print:hidden`, replaced there by a plain-text period/property/generated-at line.
- Totals card (same shape as Dashboard's, for consistency) — one section per currency in use, each exact and never blended into the others.
- Approximate combined total (2026-08-02) directly below the totals card, same rule as the Dashboard — only when the period spans more than one currency, visually distinct, never treated as authoritative. Shows the actual rate(s) used inline (e.g. "1 USD ≈ 300.00 LKR, set 1 Aug 2026") so reading it never requires a trip to Currencies admin — also carried into the CSV/PDF export.
- Revenue by platform: bar plus an authoritative table underneath — chart is never the only way to read a value (`04-ui-ux-principles.md` §6).
- Expenses by category: same pattern, rolled up to top-level categories (a sub-category's activity counts toward its parent's total here — `07-domain-model-and-schema.md` §3).
- **Housekeeping** (manager/administrator only, shipped 2026-08-24): one completion percentage for the selected period ("[pct]% ([done] of [due])"), an on-time/late split underneath, and a short "Areas needing attention" list (room name, tasks overdue, "last cleaned [time ago]") that links to Today's schedule — deliberately kept this simple rather than a full trend chart; Jalie flagged this section might read as confusing or long against real data and asked to ship the simple version now and refine once there's real data to judge it against (2026-08-23). Uses the same period/property selectors as the rest of the page rather than its own "this week" control.
- Every row is tappable and drills into the filtered Transactions list — for a category row this filters by every sub-category id rolled into that total, not just the top-level id, so the drill-down always reconciles with the number shown (2026-07-21, migration 0008).
- States: loading skeleton; no data for the selected period ("No transactions in [period]. Try a different period."); the per-currency totals never carry a "mixed currency" caveat since they're never blended — see the currency conversion policy in `06-development-roadmap.md` (2026-07-21 initial decision, revised 2026-08-02). The Housekeeping block has no separate empty state of its own — it's simply absent when there's nothing due and no rooms need attention.

## Housekeeping

**Purpose:** "What needs cleaning, who's doing it, and is it getting done?" — administrator/manager only in the hub/Today's schedule/Rooms/Staff form below; a Staff (caretaker) account instead lands directly on its own Today view with no hub around it. See `docs/housekeeping-in-app-prototype.html` for the working interactive prototype this was built from, and `07-domain-model-and-schema.md` §3/§10/§11 for the schema and permissions this renders.

- **Hub**: three rows — "Today's schedule," "Rooms," "Staff" — same list-row pattern as Administration's landing screen.
- **Today / Today's schedule**: one shared screen, two audiences. A caretaker's own Today (`housekeeping-today`, any authenticated member, no nav chrome around it) shows only the rooms round-robin assignment (or a manual override) puts on that person today. Today's schedule (`housekeeping-schedule`, administrator/manager) shows every room and adds a reassign chip-picker per card. Both show: a day-summary progress bar at the top (rooms fully done / total), then one card per room (progress bar, done/total tasks, last-update line). Tapping a room opens its checklist sheet — tick/untick each task (unticking someone else's completed task asks for confirmation first, and is blocked outright for anyone but the completer or an administrator/manager, matching RLS), and once every task is done, a "Mark inspected" action for administrator/manager (a "Pending inspection" pill for anyone else) — inspection is optional, a spot-check, not a gate on anything else.
- **Rooms**: list of rooms with type and booking-linked badge; tapping opens a detail view (booking-sync status card when linked to bookings, plus the room's cleaning checklist — SOP tasks with a cadence badge). The booking-sync card has a manual **Sync now** button (`sync-room-ical` Edge Function) that fetches the calendar URL, parses booking date ranges into `room_bookings` (migration 0013), and reports "OK"/"failed" plus an event count. Administrator only, matching `rooms`' write RLS. The same function also runs automatically once a day via `pg_cron` (2026-08-24) — Sync now is for testing a URL immediately, not the only way it happens anymore. Add/edit room sheet: name, type (chip picker), "Linked to bookings" toggle revealing a calendar export URL field when on. Add/edit task sheet: name, cadence (chip picker: daily/weekly/monthly/quarterly), matching weekday chips (weekly) or day-of-month field (monthly/quarterly). Both use archive, not hard delete.
- **Staff**: two tabs. **Work calendar** — a per-person chip picker above a month grid; tap a day to mark it worked or off (no recurring pattern, no hours/timesheet — matches the 2026-08-06 "no micromanagement" decision). Each day cell also shows a small dot when any linked room has a booking that day (2026-08-24, from `room_bookings`) — independent of which person is selected, so a manager can see occupancy while deciding who to give a day off. **Roster** — list of people with role and app-access badges; add/edit sheet covers name, role (chip picker: Housekeeper/Gardener/Maintenance/Other), an Active toggle, an optional linked app account (must already exist under Administration → Users — no self-serve invite from here), and an optional "Paid via" link to a recurring payment. "Remove from active staff" archives rather than deletes.
- Room assignment for the day is computed, not stored — active Housekeepers not marked off that day, distributed round-robin by creation order across the rooms with anything due; only a manual reassignment persists a row (`room_assignments`).
- States: each list/detail follows the same loading-skeleton/error-retry/empty-state pattern as the rest of the app.

## Recurring payments

**Purpose:** "What's due, and did I already pay it?" — manager/administrator only, per `05-information-architecture.md`; staff and viewer don't see the nav entry at all (matches the RLS on `recurring_payments`, migration 0011). Covers both bills (Wifi, Electricity) and staff wages paid on a standing bank order — NIVA never initiates or moves money itself, this screen is purely a reminder-and-log tool. See `docs/recurring-bills-prototype.html` for the working interactive prototype this was built from, and `12-ux-options-review.md` Part 2/B2 for the decision history.

- Header: title, plus an "Add" button opening the same-shaped bottom sheet as edit.
- List, grouped **Overdue** then **Upcoming**, each card showing name, category · payment method · cadence, amount, and a due-date caption ("3 days overdue" / "Due today" / "Due in 9 days"). Tapping anywhere on a card except the button below opens it for editing.
- Overdue cards additionally show a **Mark paid** button. Upcoming cards don't — a payment that isn't due yet has nothing to mark paid.
- Add/edit sheet: minimalist form language, same as Quick Add — Name (free text, since two payments can share a category), Amount + currency, Category (expense only, chip picker), Payment method (chip picker), Repeats (Monthly-on-day-N or Weekly-on-[weekday], a toggle plus the matching control), Notes (collapsed detail row). Editing shows a "Delete this payment" action below Save; deleting opens the same confirm-dialog pattern used for transaction delete, and only stops future reminders — transactions already logged from it are untouched.
- **Mark paid** opens a small confirm sheet, not an instant action (decided 2026-08-19 after prototyping both directly with Jalie) — pre-filled with the saved amount and today's date, both editable, plus an optional notes field. This is what covers a variable bill (electricity differs month to month) or a housekeeper's overtime week (bump the amount, note "2 extra days worked") without needing a separate overtime concept — that's deferred until the Housekeeping calendar can auto-generate the overtime amount itself (roadmap item 5/6).
- States: loading skeleton; error with retry; empty ("No recurring payments yet. Add a bill or a staff wage to get reminded before it's due." + Add CTA).

## Administration

**Purpose:** manage business values without touching code; visible only to roles permitted per `05-information-architecture.md`.

- Landing screen: a simple list of management areas (Properties, Platforms, Categories, Payment methods, Currencies, Users) — no nested settings maze.
- Each area is the same pattern: list of items with an Active/Archived state pill, "Add [item]" action, and per-item edit/archive actions.
- Archiving an item in use is always allowed; the confirmation explains it will disappear from new-transaction pickers but stays on historical records. Hard delete is not exposed in the UI for items referenced by a transaction (matches the database-level protection in `07-domain-model-and-schema.md` §6).
- Users area additionally shows each member's role and, for administrators, a way to change or revoke it.

## Navigation chrome

**Decided 2026-08-04**, after comparing three patterns side by side (bottom nav + full-screen "More" hub, bottom nav + swipe-up sheet, side drawer only) — chosen for protecting Quick Add's prominence while still scaling to every future feature without another nav redesign.

- Mobile: bottom navigation bar with 5 slots — Dashboard, Transactions, a raised Add button in the center, Housekeeping, and More. Add opens the same Quick Add sheet as before (an action, not a destination). **Housekeeping replaced Reports in this slot 2026-08-24** — used daily, where Reports isn't. More opens a swipe-up sheet, now grouped rather than a flat list: **Money** (Reports, Recurring payments when permitted) and **Account** (Administration when permitted, Account) — same grouped shape as the Screen access sheet in Administration → Users, different job (that one's a checklist, this is a menu).
- Desktop: persistent left sidebar lists every destination inline (Dashboard, Transactions, Housekeeping, Reports, Recurring payments when permitted, Administration when permitted, Account) — there's room, so nothing is collapsed into a hub. The floating Quick Add button stays bottom-right, unchanged from before.
- Every entry (mobile or desktop) is additionally filtered by the signed-in member's `visible_areas`, when set — see "Roles and access direction" in `05-information-architecture.md`.
- A Staff (housekeeping caretaker) account gets none of the above — no sidebar, no bottom nav, no More sheet, just its own Today checklist full-bleed. Redefined 2026-08-24; see `05-information-architecture.md`.
- Administration only appears (mobile sheet or desktop sidebar) for roles permitted per `05-information-architecture.md`.
