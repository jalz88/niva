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
└── Administration
    ├── Properties
    ├── Platforms
    ├── Categories
    ├── Payment methods
    ├── Currencies
    └── Users
```

## Global context

After sign-in, NIVA provides a clear active context:

- **Property selector:** defaults to an owner-selected property or “All properties” when multi-property reporting is available.
- **Reporting period:** defaults to the current calendar month and remains visible on dashboard and reports.
- **Currency:** every monetary value retains its own currency. Cross-currency aggregation is unavailable until a documented conversion model exists.

Do not put these controls in every transaction form unless the choice is required there; a form must visibly show its selected property and currency.

## Screen responsibilities

| Area | Primary question | Required initial content | Main action |
| --- | --- | --- | --- |
| Dashboard | How is the business this month? | Income, expenses, net result, platform revenue, visible period/property. | Add transaction. |
| Transactions | What money moved? | Chronological, filterable list with type, date, category, property, platform where relevant, and amount. | Add, inspect, edit. |
| Transaction detail | What exactly was recorded? | All recorded fields, audit context appropriate to role, edit/delete controls when permitted. | Edit or return. |
| Add/edit transaction | How do I record or correct this safely? | Type-aware, validated form. | Save income/expense or save changes. |
| Reports | Where did money come from and go? | Period totals, revenue by platform, expenses by category, source transaction drill-down. | Change period/filter, inspect transactions. |
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
| View permitted dashboard/reports | Yes | Yes | Yes (own workspace only) | Yes |
| Create transactions | Yes | Yes | Yes | No |
| Edit transactions | Yes | Yes | No | No |
| Delete/archive transactions | Yes | Yes | No | No |
| Manage configuration | Yes | No | No | No |
| Manage users/roles | Yes | No | No | No |

Staff create transactions but cannot edit or delete/archive them once saved — corrections are a manager/administrator action (decided 2026-07-19). This keeps Staff RLS policies to a single INSERT grant with no ownership-based exceptions to reason about.

Permissions must be enforced in data access, not merely hidden in navigation.

## Navigation behavior

- Desktop: persistent sidebar or equivalent navigation with clear selected state.
- Mobile: compact bottom navigation or similarly reachable pattern for Dashboard, Transactions, Reports, and More/Administration; Quick Add remains prominent.
- Deep links: authenticated users can open a transaction or report URL directly; users without access receive a clear permission state.
- Back behavior: returns to the prior list/filter state wherever practical.

## Naming and labels

Use “Transactions,” not separate top-level “Income” and “Expenses,” because the list contains both. Quick Add can label the choices “Income” and “Expense.” Use “Administration” rather than “Settings” to signal business configuration; account-level preferences may be added later under a separate user profile.

## Intentional omissions

No Bookings, Guests, Rooms, Calendar, Receipt Library, or Integrations navigation appears in the initial product. Empty navigation for hypothetical modules creates confusion and implies functionality that does not exist.
