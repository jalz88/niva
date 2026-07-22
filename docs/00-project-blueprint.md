# NIVA Project Blueprint

**Status:** Foundation — approved direction, implementation pending  
**Product:** NIVA — *Your property operating system.*  
**Primary principle:** NIVA is a lightweight, mobile-first property operations tool. Every feature must reduce operational effort without increasing operational complexity.

## 1. Purpose of this blueprint

This is the initial charter and decision framework for NIVA. It prevents the product from drifting into an overly broad accounting package or hotel-management system while ensuring that the foundation can support future properties, platforms, currencies, and operational modules.

The Markdown files in this repository are the single source of truth. Code must follow them; when a durable decision changes, update the relevant document in the same change set.

## 2. Product in one sentence

NIVA lets a small BnB owner record financial activity quickly and understand how each property is performing without needing traditional accounting software.

## 3. Initial release boundary

### Included

- Secure sign-in and role-aware access.
- One configurable financial **transaction** model for both income and expenses.
- Income reporting by configurable platform; initially Airbnb and Agoda.
- Configurable properties, categories, payment methods, platforms, currencies, and users.
- Month-to-date dashboard and monthly financial reports.
- A fast mobile transaction-entry flow.
- Responsive PWA installation experience and safe caching of the application shell.

### Explicitly excluded

- Booking calendar, guest messaging, channel manager, or reservation management.
- Double-entry accounting, tax engines, payroll, depreciation, invoices, and formal ledger workflows.
- Receipt or document uploads, OCR, and file storage.
- Offline creation or editing of financial data.
- Inventory, maintenance, housekeeping, assets, Home Assistant, and third-party booking integrations.

An excluded item is not rejected forever. It is deferred until there is a clear operational need and the core transaction workflow is proven.

## 4. Product guardrails

1. **Build a foundation, not speculative features.** Data structures may anticipate reasonable growth; screens and workflows are built only when needed.
2. **Everything configurable, nothing complicated.** Values that owners reasonably change live in data, not source code.
3. **One source of financial truth.** Income and expenses are transactions distinguished by type, not separate competing workflows.
4. **Clarity over cleverness.** The UI explains what happened, what will happen, and how to recover from a mistake.
5. **Mobile first, desktop complete.** The quickest everyday task must be comfortable with one hand; reports remain useful on larger screens.
6. **Financial records deserve care.** Validation, permissions, audit fields, confirmation for destructive actions, and report accuracy take priority over visual novelty.
7. **Prefer portable, mature technology.** NIVA must not require a rewrite to move hosts or add a future module.

## 5. Core domain language

Use these names consistently in copy, code, schema, and documentation.

| Term | Meaning |
| --- | --- |
| Property | A business location or accommodation operation, such as Kandy BnB or a future Bali villa. |
| Transaction | A single financial movement, either income or expense. |
| Platform | A revenue source or sales channel, such as Airbnb or Agoda. Optional for expenses. |
| Category | An owner-managed classification of a transaction, constrained to income or expense. |
| Payment method | How the money was received or paid, such as cash, bank transfer, card, or e-wallet. |
| Supplier | A business or person paid for an expense. Optional in the initial release. |
| Reporting period | A date range used to aggregate transactions. The initial default is the current calendar month. |

## 6. Initial data model direction

The future schema specification will define fields and constraints, but these relationships are non-negotiable:

```text
Organisation / workspace
├── Properties
├── Platforms
├── Categories
├── Payment methods
├── Currencies
├── Users and memberships
└── Transactions
    ├── belongs to one property
    ├── has income or expense type
    ├── belongs to one compatible category
    ├── uses one payment method
    ├── has one currency and stored amount
    ├── may reference one platform (primarily income)
    ├── may reference one supplier (primarily expense)
    └── records its creator and audit timestamps
```

Rooms are not required for the first release because NIVA is not managing bookings. A future room entity may be linked to transactions without changing the core model.

## 7. Decision rules

Use these questions before adding a feature or dependency:

1. Does it solve a real, repeated owner or staff task?
2. Does it make the common task faster or less error-prone?
3. Can the feature be represented by an existing core object?
4. Does it need a configurable value rather than a hard-coded list?
5. What feedback, empty state, error state, permission, and recovery path does it need?
6. Can it be deferred without weakening the financial foundation?

If the answer to question 2 is no, do not add it. If the answer to question 6 is yes, add it to the backlog rather than the release.

## 8. Documentation map and next artifacts

This initial set establishes intent. The next set, created before corresponding implementation, should include:

- ~~Domain model and database schema, including migrations, constraints, indexes, and row-level access policies.~~ Done — see `07-domain-model-and-schema.md`.
- ~~Design system and detailed wireframes for every initial screen.~~ Done — see `08-design-system.md` and `09-wireframes.md` (companion low-fidelity mockups in `wireframes.html`).
- ~~API/data-access specification and error contract.~~ Done — see `10-api-data-access-spec.md`.
- ~~Coding standards, test strategy, deployment runbook, and AI development guide.~~ Done — see `11-coding-standards-and-test-strategy.md`.

All four Phase 0 documentation artifacts are complete as of 2026-07-19. Phase 0's remaining exit criteria — approving this set and confirming initial seed values (property, currency, categories, payment methods) — are the last steps before Phase 1 technical foundation work begins, per `06-development-roadmap.md`.

## 9. Change control

- Treat the product vision, scope boundary, and terminology as high-impact decisions.
- Record a short rationale whenever changing the data model or technical architecture.
- Resolve contradictions in favor of the newest explicitly approved document, then update older documents immediately.
- Keep implementation decisions close to code; keep enduring product decisions in `docs/`.

## 10. Decision log

Durable decisions that resolve an item this blueprint previously left open, in the order they were made.

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-07-19 | Schema and RLS are multi-tenant-ready from Release 1: every business table carries `workspace_id`, scoped by `workspace_memberships`. | The owner may later offer NIVA to other property owners. The "Organisation / workspace" entity was already the top of the data model (§6); making RLS workspace-scoped from the start costs little and avoids a painful retrofit. |
| 2026-07-19 | Self-serve workspace signup and billing are explicitly deferred to the post-release backlog. Workspaces are created manually for Release 1. | Building tenant-onboarding UI/billing before there is a second real customer is speculative and fails guardrail 1 ("build a foundation, not speculative features"). See `06-development-roadmap.md` post-release priorities. |
| 2026-07-19 | Release 1 sign-in method is email/password. | See `03-technology-stack.md`. |
| 2026-07-19 | Staff can create transactions but cannot edit or delete/archive them; corrections are a manager/administrator action. | Simplest RLS (a single INSERT grant, no ownership-based exception), lowest risk of accidental or unreviewed changes to financial records. See `05-information-architecture.md`. |
| 2026-07-20 | Quick Add/Edit transaction has no Property field. The transaction is recorded against the workspace's one active property automatically. | First real-user test (Jalie's wife) flagged it as an unnecessary tap when there's only one property to choose. A header property selector (not yet built) will take over "which property am I working on" the day a second property exists — the transaction form itself won't need to change. |
| 2026-07-20 | Categories and payment methods each support up to 3 admin-starred "favorites," shown as one-tap chips on the transaction form ahead of a "More…" dropdown. | Same feedback session: the three most-used categories/payment methods should be reachable in one tap, not a dropdown scroll, for a non-technical daily user. |
| 2026-07-20 | Categories support one optional level of sub-categories, hidden on the form unless the chosen category actually has one. | Requested for future reporting granularity, but explicitly must not slow down the common case — most categories will never have a sub-category, and the field is simply absent for them. |
| 2026-07-20 | Suppliers get a real Administration screen; the transaction form's supplier field became a pick-existing-or-add-new combo box instead of plain free text. | Same feedback session: typing a supplier name from scratch every time was friction once the same suppliers recur. |
| 2026-07-21 | Dashboard/Reports show a separate total per currency in use (e.g. income in AED and expenses in LKR sit side by side) — no currency conversion, no blended total, for Release 1. | Answers the open question raised when AED was added as a currency (workspace is paid in AED via a UAE bank, but pays expenses in LKR): converting requires picking and storing an exchange-rate policy, which is speculative scope this workspace hasn't asked for yet. Matches the existing "no cross-currency aggregation" rule (`07-domain-model-and-schema.md` §1) and Phase 4's exit criteria ("no mixed-currency total is shown without an explicit policy" — the explicit policy *is* "don't combine them"). Revisit if/when the owner actually needs a single blended net-worth figure. |
| 2026-07-21 | Dashboard and Reports only show a property selector once a workspace has more than one active property; with one property (today's reality) totals are implicitly scoped to it. | Same reasoning as the 2026-07-20 Quick Add property decision — no picker for a choice that doesn't yet exist. The underlying report queries already accept an optional property filter, so the picker can appear later without a data-model change. |
| 2026-07-22 | Playwright's critical-flow E2E suite runs on every push/PR (not nightly), against a dedicated, RLS-isolated "NIVA E2E Test" workspace + test account in the real Supabase project — no separate Supabase branch/project. | Jalie hit the same sign-in bug twice; a nightly-only run would leave that class of "silent until you refresh" bug live in production for up to a day. Workspace-scoped RLS already makes a same-project test workspace genuinely isolated from real business data, so a disposable branch (the original, unimplemented plan in `11-coding-standards-and-test-strategy.md`) wasn't needed. |

See `07-domain-model-and-schema.md` for how these decisions are implemented in the schema.
