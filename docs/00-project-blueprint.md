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

See `07-domain-model-and-schema.md` for how these decisions are implemented in the schema.
