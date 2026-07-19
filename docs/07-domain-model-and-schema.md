# Domain Model and Database Schema

**Status:** Foundation — approved direction, implementation pending
**Depends on:** `00-project-blueprint.md`, `03-technology-stack.md`, `05-information-architecture.md`

This document is the schema specification referenced as a pending artifact in the blueprint. It defines entities, columns, constraints, indexes, and row-level security (RLS) at a level detailed enough to generate the first Supabase migration. Exact migration files are written during Phase 1 implementation; this document is the source of truth they must match.

## 1. Foundational decisions this schema encodes

- **Multi-tenant-ready from Release 1.** Every business table carries `workspace_id`. NIVA is built for the owner's own properties today, with the explicit option to onboard unrelated property owners later. RLS enforces workspace isolation from the first migration, so this never needs retrofitting.
- **Self-serve tenant onboarding is out of scope for Release 1.** Workspaces are created manually (via a seed script or admin action), not through a signup flow. Self-serve signup and billing are backlog items for if/when NIVA is offered to other owners.
- **Roles:** `administrator`, `manager`, `staff`, `viewer`, matching the roles table in `05-information-architecture.md`.
- **Staff can create transactions but cannot edit or delete/archive them.** Corrections are a manager/administrator action.
- **Configuration items are archived, never hard-deleted, once referenced by a transaction.**
- **Money is `numeric`, never floating point.** Currency is stored per transaction; no cross-currency aggregation.

## 2. Entity overview

```text
workspaces
├── workspace_memberships (links auth.users → workspace, with role)
├── properties
├── platforms
├── categories
├── payment_methods
├── workspace_currencies (which ISO currencies this workspace uses)
├── suppliers
└── transactions
    ├── belongs to one property
    ├── belongs to one category (category.type must match transaction.type)
    ├── uses one payment method
    ├── has one currency_code + numeric amount
    ├── may reference one platform (typically income)
    └── may reference one supplier (typically expense)

iso_currencies (global reference table, not workspace-scoped)
```

## 3. Table specifications

### `workspaces`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | default `gen_random_uuid()` |
| name | text, not null | e.g. "Kandy BnB Group" |
| created_at | timestamptz, not null | default `now()` |

### `workspace_memberships`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| user_id | uuid, not null, fk → auth.users.id | |
| role | text, not null | check in (`administrator`,`manager`,`staff`,`viewer`) |
| created_at | timestamptz, not null | default `now()` |

Unique constraint on `(workspace_id, user_id)` — one role per user per workspace.

### `profiles`

Mirrors `auth.users` for display purposes only; Supabase Auth remains the identity source of truth.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk, fk → auth.users.id | |
| display_name | text | |
| email | text | kept in sync via trigger on auth.users, or read at login |
| created_at | timestamptz, not null | default `now()` |

### Configuration tables

`properties`, `platforms`, `categories`, `payment_methods`, `suppliers` share the same shape:

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| name | text, not null | unique per `(workspace_id, name)` |
| is_active | boolean, not null | default `true`; set `false` to archive |
| created_by | uuid, fk → auth.users.id | |
| created_at | timestamptz, not null | default `now()` |
| updated_by | uuid, fk → auth.users.id | |
| updated_at | timestamptz, not null | default `now()` |

`categories` has one additional column:

| Column | Type | Notes |
| --- | --- | --- |
| type | text, not null | check in (`income`,`expense`) |

A category's `type` is fixed at creation. A transaction's `category_id` must reference a category whose `type` matches the transaction's own `type` (enforced by trigger — see §5).

### `iso_currencies` (global reference)

| Column | Type | Notes |
| --- | --- | --- |
| code | text, pk | ISO 4217, e.g. `LKR`, `USD` |
| name | text, not null | |
| minor_unit | smallint, not null | decimal places, e.g. 2 |

Seeded once with common codes; not workspace-scoped; readable by any authenticated user; not writable from the client.

### `workspace_currencies`

Which currencies a given workspace has enabled.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| currency_code | text, not null, fk → iso_currencies.code | |
| is_active | boolean, not null | default `true` |
| is_default | boolean, not null | default `false`; exactly one default per workspace (enforced by partial unique index) |

Unique on `(workspace_id, currency_code)`.

### `transactions`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| property_id | uuid, not null, fk → properties.id | |
| type | text, not null | check in (`income`,`expense`) |
| category_id | uuid, not null, fk → categories.id | type must match (trigger) |
| payment_method_id | uuid, not null, fk → payment_methods.id | |
| platform_id | uuid, null, fk → platforms.id | typically set for income |
| supplier_id | uuid, null, fk → suppliers.id | typically set for expense |
| currency_code | text, not null, fk → iso_currencies.code | must be enabled for the workspace (trigger) |
| amount | numeric(14,2), not null | check `amount > 0` |
| occurred_on | date, not null | the business date of the transaction |
| notes | text, null | |
| status | text, not null | default `active`; check in (`active`,`archived`) |
| created_by | uuid, not null, fk → auth.users.id | |
| created_at | timestamptz, not null | default `now()` |
| updated_by | uuid, fk → auth.users.id | |
| updated_at | timestamptz, not null | default `now()`, refreshed on update |

Delete is not exposed in Release 1 application logic; "delete" in the UI sets `status = 'archived'`. A true `DELETE` remains available at the database level for corrections/GDPR-style requests, restricted to administrators.

## 4. Indexes

- `transactions (workspace_id, occurred_on)` — dashboard/report period queries.
- `transactions (workspace_id, property_id, occurred_on)` — property-filtered views.
- `transactions (workspace_id, type, category_id)` — category reports.
- `transactions (workspace_id, platform_id)` — revenue-by-platform report.
- `workspace_memberships (user_id)` — RLS lookups.
- Partial unique index on `workspace_currencies (workspace_id) WHERE is_default` — one default currency per workspace.

## 5. Data integrity beyond column constraints

Two rules can't be expressed as simple foreign keys and need a `BEFORE INSERT OR UPDATE` trigger on `transactions`:

1. **Category/type match.** Reject if `categories.type <> transactions.type` for the referenced `category_id`.
2. **Currency enabled.** Reject if `currency_code` has no active row in `workspace_currencies` for the transaction's `workspace_id`.

Both should raise a clear error the application layer can map to a plain-language message (per the UI/UX validation principles), not a raw constraint-violation string.

## 6. Row Level Security

A `SECURITY DEFINER` helper function avoids recursive RLS lookups:

```sql
create function public.current_role_in_workspace(target_workspace uuid)
returns text
language sql stable security definer
as $$
  select role from public.workspace_memberships
  where workspace_id = target_workspace and user_id = auth.uid()
  limit 1;
$$;
```

Policy pattern applied per table (illustrative, not exhaustive):

| Table group | SELECT | INSERT | UPDATE | DELETE/Archive |
| --- | --- | --- | --- | --- |
| `transactions` | any member of the workspace | administrator, manager, staff | administrator, manager | administrator, manager (sets `status='archived'`); hard `DELETE` restricted to administrator |
| Configuration tables (properties, platforms, categories, payment_methods, suppliers, workspace_currencies) | any member of the workspace | administrator | administrator | administrator (blocked by FK/trigger if referenced by a transaction — see below) |
| `workspace_memberships` | any member of the workspace | administrator | administrator | administrator |
| `profiles` | self, and any workspace co-member | self (own row) | self (own row) | n/a |

Every policy's `USING`/`WITH CHECK` clause is scoped by `workspace_id = <row's workspace> AND current_role_in_workspace(workspace_id) = ANY(<allowed roles>)`. `viewer` never appears in an INSERT/UPDATE/DELETE allow-list.

Archiving a configuration item that is referenced by an existing transaction is allowed (it just stops appearing as a selectable option); hard-deleting one that is referenced is blocked at the database level, independent of what the UI prevents — this is the "defence in depth" the technology-stack document calls for.

## 7. Audit trail

`created_by`/`created_at`/`updated_by`/`updated_at` on every business table is the Release 1 audit baseline. A dedicated `transaction_history` table (full field-level change log) is deferred — it is not required to meet the blueprint's "financial records deserve care" guardrail at this scale, but is a natural post-release candidate if reviewers need to see who changed what value.

## 8. Open items for Phase 1 implementation

- Confirm decimal precision `numeric(14,2)` is sufficient for all currencies in scope (2 decimal places covers LKR/USD/EUR; revisit if a zero-decimal or 3-decimal currency is enabled).
- Decide whether `profiles.email` is synced via a Postgres trigger on `auth.users` or read from the session on the client — either is fine, pick the one that's less fragile to Supabase Auth changes.
- Write the actual seed migration for `iso_currencies` (ISO 4217 list, or a trimmed list covering only realistically needed codes).
- Confirm sort/display order for configuration lists (e.g. an `sort_order` column) is needed for Release 1 or can wait.
