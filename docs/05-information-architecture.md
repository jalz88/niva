# Information Architecture

## Purpose

This document defines NIVA’s initial navigation and the information each screen owns. It protects the product from turning administration, reporting, and everyday transaction entry into one confusing interface.

## Application map

```text
NIVA
├── Authentication
│   ├── Sign in
│   ├── Password reset / account recovery
│   └── Session handling
├── Dashboard
│   ├── Current-month summary
│   ├── Revenue by platform
│   └── Quick Add
├── Transactions
│   ├── All transactions
│   ├── Filters and search (incrementally introduced)
│   ├── Transaction detail
│   ├── Add income
│   ├── Add expense
│   └── Edit / delete transaction
├── Reports
│   ├── Period summary
│   ├── Revenue by platform
│   └── Expenses by category
├── Recurring payments (manager/administrator only)
│   ├── Overdue / Upcoming list — bills and staff wages on a schedule
│   ├── Add / edit a payment (name, amount, category, payment method, monthly or weekly cadence)
│   └── Mark paid — confirms amount/date/notes, logs the transaction, advances the schedule
└── Administration
    ├── Properties
    ├── Platforms
    ├── Categories (favorite up to 3, optional one-level sub-categories)
    ├── Payment methods (favorite up to 3)
    ├── Suppliers
    ├── Currencies
    └── Users
```

## Global context

After sign-in, NIVA provides a clear active context:

- **Property selector:** defaults to an owner-selected property or “All properties” when multi-property reporting is available.
- **Reporting period:** defaults to the current calendar month and remains visible on dashboard and reports.
- **Currency:** every monetary value retains its own currency everywhere. Dashboard/Reports additionally show one approximate combined total (in the workspace default currency) when a period spans more than one currency, using an administrator-maintained reference rate set in Currencies admin — see the conversion policy decision in `06-development-roadmap.md`. It's explicitly labeled as an estimate, not a real aggregation.

Do not put these controls in every transaction form unless the choice is required there; a form must visibly show its selected property and currency.

## Screen responsibilities

| Area | Primary question | Required initial content | Main action |
| --- | --- | --- | --- |
| Dashboard | How is the business this month? | Income, expenses, net result, platform revenue, visible period/property. | Add transaction. |
| Transactions | What money moved? | Chronological, filterable list with type, date, category, property, platform where relevant, and amount. | Add, inspect, edit. |
| Transaction detail | What exactly was recorded? | All recorded fields, audit context appropriate to role, edit/delete controls when permitted. | Edit or return. |
| Add/edit transaction | How do I record or correct this safely? | Type-aware, validated form. | Save income/expense or save changes. |
| Reports | Where did money come from and go? | Period totals, revenue by platform, expenses by category, source transaction drill-down. | Change period/filter, inspect transactions. |
| Recurring payments (manager/administrator only) | What's due, and did I already pay it? | Overdue/Upcoming list of bills and staff wages, each with amount, category, payment method, and cadence. | Add/edit a payment, Mark paid. |
| Administration | What business values and access are available? | Small management lists with active/inactive state and impact-aware actions. | Add/change configuration. |

## Primary user flows

### Record an Airbnb payout

```text
Dashboard or Transactions
→ Quick Add
→ Income
→ Amount, date, property, category, payment method, Airbnb platform
→ Save income
→ “Income saved” confirmation
→ Updated list and totals
```

### Record a business expense

```text
Dashboard or Transactions
→ Quick Add
→ Expense
→ Amount, date, property, expense category, payment method, optional supplier/note
→ Save expense
→ “Expense saved” confirmation
→ Updated list and totals
```

### Correct an error

```text
Transactions
→ Select transaction
→ Edit
→ Change fields
→ Save changes
→ “Transaction updated” confirmation
```

### Understand month-end platform income

```text
Reports
→ Select month and property
→ Revenue by platform
→ Read totals for Airbnb, Agoda, and enabled future platforms
→ Drill into matching transactions when needed
```

## Roles and access direction

Exact permissions will be formalised alongside the schema and RLS policies. Initial intent:

| Capability | Administrator | Manager | Staff | Viewer |
| --- | ---: | ---: | ---: | ---: |
| View permitted dashboard/reports | Yes | Yes | No (kiosk mode, see below) | Yes |
| Create transactions | Yes | Yes | No | No |
| Edit transactions | Yes | Yes | No | No |
| Delete/archive transactions | Yes | Yes | No | No |
| Own Today housekeeping checklist | Yes | Yes | Yes | No |
| Housekeeping hub/schedule/rooms/staff | Yes | Yes | No | No |
| Manage configuration | Yes | No | No | No |
| Manage users/roles | Yes | No | No | No |

**Staff redefined 2026-08-24** as the housekeeping caretaker role (e.g. a live-in housekeeper), superseding the 2026-07-19 "create-only transactions" intent above before any real customer used it that way. A staff account gets no nav chrome at all — no sidebar, no bottom nav, no More sheet — and lands directly on its own Today checklist (`housekeeping-today`), filtered to whichever rooms round-robin assignment (or a manual override) puts on that person for the day. It reads and writes only `sop_task_completions` (its own) and `room_inspections`; RLS on `workforce_members`/`workforce_days_off`/`room_assignments` allows read access to any workspace member so Today can resolve "which rooms are mine," but write access (adding/editing roster entries, reassigning rooms) stays administrator/manager only. Someone who needs bookkeeping access should be given the Manager role instead — Staff is deliberately narrow now, not a general limited-access tier.

The Housekeeping hub, Today's schedule (the admin/manager view of every room), Rooms, and Staff screens are all administrator/manager only; Staff and Viewer don't see the nav entry. Within that, an administrator can narrow an individual administrator/manager's own nav further via the Screen access sheet (`visible_areas` on `workspace_memberships`, see `07-domain-model-and-schema.md` §10) — e.g. giving a part-time manager only Transactions and Today's schedule, hiding Rooms/Staff/Recurring payments/Administration. This narrows navigation only; it can never widen what RLS already permits, and Staff's kiosk mode isn't affected by it at all (Staff ignores `visible_areas` entirely — the lockdown is unconditional).

Permissions must be enforced in data access, not merely hidden in navigation.

## Navigation behavior

- Desktop: persistent sidebar listing every destination inline (Dashboard, Transactions, Housekeeping, Reports, Recurring payments when permitted, Administration when permitted, Account) — there's room, so nothing is collapsed.
- Mobile: bottom bar with Dashboard, Transactions, a raised Add, Housekeeping, and More. **Housekeeping replaced Reports in the bottom bar 2026-08-24** — used daily, where Reports isn't — and Reports moved into the More sheet instead. More opens a sheet grouped **Money** (Reports, Recurring payments when permitted) and **Account** (Administration when permitted, Account) — see "Navigation chrome" in `09-wireframes.md`. Quick Add remains prominent either way.
- Every nav entry is additionally filtered by the signed-in member's `visible_areas` (narrowing only, never widening — see the Roles and access direction section above).
- A Staff account bypasses all of the above — no sidebar, no bottom nav, no More sheet, just its own Today checklist full-bleed. See "Staff redefined 2026-08-24" above.
- Deep links: authenticated users can open a transaction or report URL directly; users without access receive a clear permission state. A Staff account deep-linking anywhere but its own Today view is redirected there.
- Back behavior: returns to the prior list/filter state wherever practical.

## Naming and labels

Use “Transactions,” not separate top-level “Income” and “Expenses,” because the list contains both. Quick Add can label the choices “Income” and “Expense.” Use “Administration” rather than “Settings” to signal business configuration; account-level preferences may be added later under a separate user profile.

## Intentional omissions

No Bookings, Guests, Rooms, Calendar, Receipt Library, or Integrations navigation appears in the initial product. Empty navigation for hypothetical modules creates confusion and implies functionality that does not exist.
