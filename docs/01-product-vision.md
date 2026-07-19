# Product Vision

## Vision

**NIVA is the calm, simple operating system a small property owner opens to understand the business and record what happened.**

It begins with financial operations: money received, money spent, and a clear monthly view of profit and revenue sources. It is designed for a small hospitality business today and multiple properties tomorrow.

## The problem

Small BnB owners often track payouts, cash, and expenses across memory, messages, bank statements, notes, and spreadsheets. Traditional accounting tools can be expensive or too complex; booking platforms already handle reservations but do not present one simple operational picture across the business.

The immediate questions NIVA must answer are:

- How much money came in this month?
- How much did we spend?
- What is our simple operating profit for the selected period?
- How much did Airbnb, Agoda, and future platforms pay us?
- What are our largest expense categories?
- Can I record a transaction without interrupting my day?

## Primary users

| User | Need | Typical device/context |
| --- | --- | --- |
| Owner / administrator | Trustworthy overview, configuration, reports, and full control. | Phone, tablet, laptop. |
| Manager | Add and correct everyday transactions; see operational totals. | Mostly phone. |
| Staff member | Record permitted operational expenses with minimal typing. | Phone, possibly on a weak mobile connection. |
| Viewer | Read reports without being able to change financial records. | Phone or desktop. |

The initial real-world team is small: the owner, spouse, and close family. NIVA should feel approachable to people who are not accountants or software specialists.

## Desired outcomes

### Owner outcomes

- Open the dashboard and understand the current month in seconds.
- Enter an income or expense in roughly ten seconds when common values are already configured.
- Trust that reports reconcile with the transactions shown.
- Add a new property, platform, category, or payment method without changing code.

### Product outcomes

- A dependable daily habit replaces ad-hoc notes and disconnected spreadsheets.
- NIVA remains focused, fast, and low-maintenance.
- The data model accommodates expansion from Kandy to future properties and currencies.

## Release 1 product scope

### Financial tracking

- Create, view, edit, and safely delete transactions.
- Record transaction date, amount, currency, type, category, property, payment method, optional platform/supplier, and notes.
- Use a single transaction flow that adapts for income or expense.
- Make common input choices easy to reuse.

### Insight

- Dashboard: current-month income, expenses, simple net result, and revenue by platform.
- Reports: selected-period totals, revenue by platform, and expenses by category.
- Transaction list with useful date, property, type, category, and platform filters.

### Administration

- Manage properties, platforms, categories, payment methods, currencies, and users according to role.
- Seed the first workspace with Airbnb and Agoda as enabled income platforms. Other platforms are added by configuration, not code.

## Non-goals and language caution

NIVA reports a simple operating net result: **income minus expenses**. It must not label this result as official statutory profit, tax-ready profit, or a complete set of accounts. It is not a replacement for a professional accountant or a legally required bookkeeping system.

NIVA does not manage bookings in Release 1. A platform payout may be recorded as income, but NIVA will not attempt to match it to stays, guests, or booking-platform calendars.

## Success measures

These are initial targets and must be measured only after a usable release exists.

| Area | Target |
| --- | --- |
| Entry speed | A typical transaction can be saved in 10 seconds or less after opening Quick Add. |
| Comprehension | A user can identify current-month income, expenses, and net result without training. |
| Reliability | A saved transaction appears correctly in its list and relevant report after refresh. |
| Error prevention | Every destructive action requires a clear, reversible-or-confirmed path. |
| Responsiveness | Primary screens feel immediate on a typical modern mobile connection; performance budgets will be set before build. |
| Adoption | The operating team records financial activity consistently enough for month-end reports to be useful. |

## Future vision, deliberately deferred

NIVA may later include bills, assets, maintenance, housekeeping, inventory, staff operations, receipt capture and OCR, integrations, notifications, and multi-currency reporting. These are opportunities, not commitments. Each must earn its place using the blueprint decision rules.
