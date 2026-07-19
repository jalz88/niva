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

**Purpose:** "How is the business this month?" — answered within seconds of opening the app.

Mobile layout, top to bottom:

1. Header: property selector (defaults to owner's default property or "All properties"), reporting period ("This month ▾").
2. Summary card: Income, Expenses, Net result — each with amount, currency, and a sign-bearing icon (never color alone).
3. Revenue by platform: small horizontal bar list (Airbnb, Agoda, ...), tied to the same period/property.
4. Recent transactions: last 5, "View all" link to Transactions.
5. Floating Quick Add button, bottom-right, always reachable while scrolling.
6. Bottom navigation: Dashboard, Transactions, Reports, More (→ Administration).

Desktop delta: summary card and platform revenue sit side by side; recent transactions becomes a wider table; navigation moves to a persistent left sidebar.

States: loading (skeleton cards, no fake numbers); empty (no transactions yet this period → "No transactions this month. Add your first transaction." with Quick Add shortcut); error (period totals failed to load → inline retry, does not block Quick Add).

## Quick Add (Income / Expense)

**Purpose:** record a transaction in ~10 seconds.

- Opens as a bottom sheet on mobile, a side panel or modal on desktop — never a full navigation away from context.
- Step 1: Income/Expense toggle (two large pill buttons) — determines every field below.
- Form (single screen, no wizard): Amount (numeric keypad, currency prefix), Date (defaults to today), Property (defaults to last-used), Category (type-filtered), Payment method, Platform (income only), Supplier (expense only, optional), Notes (optional, collapsed by default).
- Primary action: **Save income** / **Save expense**, label changes with the toggle.
- States: validating inline per field as the user leaves it; saving (button → spinner + disabled, rest of form remains visible and unchanged); success (sheet closes, toast confirms "Expense saved — LKR 4,500 · Utilities", list/dashboard update without manual refresh); failure (sheet stays open, every value retained, error message near the top, **Try again** on the primary button).

## Transactions

**Purpose:** "What money moved?" — the full, filterable record.

- Header: active filters as removable chips (period, property, type, category, platform); "Filters" control to add more.
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

- Period and property selectors at the top, persistent while scrolling.
- Totals card (same shape as Dashboard's, for consistency).
- Revenue by platform: bar or donut plus an authoritative table underneath — chart is never the only way to read a value (`04-ui-ux-principles.md` §6).
- Expenses by category: same pattern.
- Every row/segment is tappable and drills into the filtered Transactions list.
- States: loading skeleton; no data for the selected period ("No transactions in [period]. Try a different period."); explicit "mixed currency" notice suppressed entirely in Release 1 since cross-currency totals are not shown.

## Administration

**Purpose:** manage business values without touching code; visible only to roles permitted per `05-information-architecture.md`.

- Landing screen: a simple list of management areas (Properties, Platforms, Categories, Payment methods, Currencies, Users) — no nested settings maze.
- Each area is the same pattern: list of items with an Active/Archived state pill, "Add [item]" action, and per-item edit/archive actions.
- Archiving an item in use is always allowed; the confirmation explains it will disappear from new-transaction pickers but stays on historical records. Hard delete is not exposed in the UI for items referenced by a transaction (matches the database-level protection in `07-domain-model-and-schema.md` §6).
- Users area additionally shows each member's role and, for administrators, a way to change or revoke it.

## Navigation chrome

- Mobile: bottom navigation bar (Dashboard, Transactions, Reports, More) with the current section visually marked; Quick Add floats above it, never inside it.
- Desktop: persistent left sidebar with the same four destinations plus the active property/period shown in the top bar, not repeated per-page.
