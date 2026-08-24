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
    ├── may reference one supplier (typically expense)
    └── may reference one recurring_payment (set by mark_recurring_payment_paid)
├── recurring_payments (manager/administrator only — migration 0011)
    ├── belongs to one property, one category (must be `expense`), one payment method
    └── has a cadence: monthly (day of month) or weekly (day of week)

iso_currencies (global reference table, not workspace-scoped)

rooms (belongs to one property — migration 0012)
├── sop_tasks (the cleaning checklist for that room; cadence: daily/weekly/monthly/quarterly)
│   └── sop_task_completions (append-only — one row per time a task is actually ticked)
└── room_inspections (append-only — one row per room per day Mom spot-checks it, optional/non-blocking)

workforce_members (the operational roster — Housekeepers, Gardeners, Maintenance)
├── separate from workspace_memberships — not everyone on the roster signs into NIVA
├── may reference one workspace_membership (only when "Give app access" is on)
├── may reference one recurring_payment (the wage link, "Paid via")
├── workforce_days_off (explicit dates, no recurring weekly pattern)
└── room_assignments (who owes which room, per day — only manual overrides are stored)
```

## 3. Table specifications

### `workspaces`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | default `gen_random_uuid()` |
| name | text, not null | e.g. "hashtag28" |
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

`categories` has three additional columns (added by migration 0005, 2026-07-20, after real-user-testing feedback):

| Column | Type | Notes |
| --- | --- | --- |
| type | text, not null | check in (`income`,`expense`) |
| is_favorite | boolean, not null | default `false`; max 3 favorites per `(workspace_id, type)`, enforced by trigger |
| parent_category_id | uuid, null, fk → categories.id | a non-null value makes this row a sub-category; one level deep only — a sub-category can't itself have a parent |

`payment_methods` has one additional column, same rule minus the type split (one shared set of 3, not per-type):

| Column | Type | Notes |
| --- | --- | --- |
| is_favorite | boolean, not null | default `false`; max 3 favorites per `workspace_id`, enforced by trigger |

Favorites exist to drive one-tap quick-entry chips on the transaction form, configured by an administrator in the Categories/Payment methods admin screens. A category can't be both a favorite and a sub-category (check constraint) — sub-categories are an optional, hidden-unless-used refinement for reporting, not part of the fast-entry path.

A category's `type` is fixed at creation, and a sub-category always inherits its parent's `type`. A transaction's `category_id` must reference a category whose `type` matches the transaction's own `type` (enforced by trigger — see §5); it may point directly at a sub-category, in which case the sub-category *is* the recorded category — there is no separate `subcategory_id` column on `transactions`.

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
| reference_rate_to_default | numeric, nullable | migration 0010. Administrator-maintained: "1 unit of this currency ≈ this many units of the default currency." Never set for the default row itself. Used only for Dashboard/Reports' approximate combined total, computed at report display time — see "Currency conversion policy" in `06-development-roadmap.md`. |
| reference_rate_updated_at | timestamptz, nullable | migration 0010. When the rate above was last set — shown in reports so the approximation is never presented as more current than it is. |

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

### `recurring_payments` (migration 0011)

Reminders for something that recurs on a schedule and is always an expense — a bill (Wifi, Electricity) or a staff wage paid on a standing bank order. NIVA never initiates or moves money; "Mark paid" (`mark_recurring_payment_paid`, below) just logs the transaction and advances the schedule. Manager/administrator only — staff and viewer get no RLS policy on this table at all, so it's invisible to them, not merely read-only. Docs: `12-ux-options-review.md` Part 2/B2.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| property_id | uuid, not null, fk → properties.id | silently assigned, same single-active-property convention as `transactions` |
| name | text, not null | short free-text label ("Wifi", "Maria — wages") — kept separate from category so two payments sharing a category stay distinguishable |
| category_id | uuid, not null, fk → categories.id | must be `type = 'expense'` (trigger) |
| payment_method_id | uuid, not null, fk → payment_methods.id | |
| currency_code | text, not null, fk → iso_currencies.code | must be enabled for the workspace (trigger) |
| amount | numeric(14,2), not null | check `amount > 0`; the expected/default amount — editable per-payment at Mark-paid time |
| cadence_type | text, not null | check in (`monthly`,`weekly`) |
| cadence_day_of_month | smallint, null | 1–31; set only when `cadence_type = 'monthly'` |
| cadence_day_of_week | smallint, null | 0 (Sunday) – 6 (Saturday), matching JS `Date#getDay()`; set only when `cadence_type = 'weekly'` |
| next_due_on | date, not null | advanced by `mark_recurring_payment_paid`, never by a cron/scheduled job |
| notes | text, null | |
| created_by / created_at / updated_by / updated_at | | standard audit columns |

A check constraint enforces exactly one of `cadence_day_of_month`/`cadence_day_of_week` being set, matching `cadence_type`. Deleting a row is a real hard `DELETE` (not an archive) — it only stops future reminders; `transactions.recurring_payment_id` is `ON DELETE SET NULL`, so anything already logged from it is untouched.

`mark_recurring_payment_paid(p_recurring_payment_id, p_amount, p_occurred_on, p_notes)` — `SECURITY DEFINER`, manager/administrator only (checked explicitly inside, same pattern as `set_default_workspace_currency`). Atomically inserts the expense transaction (stamping `recurring_payment_id`) and advances `next_due_on`. Advancement is computed from the *previous scheduled* `next_due_on`, not `p_occurred_on` — paying a few days early or late never drifts the future schedule. Monthly advancement clamps to the last day of the target month when `cadence_day_of_month` doesn't exist there (e.g. day 31 into a 30-day month). Returns the new transaction's id.

### `rooms` (migration 0012)

Physical spaces to clean — bedrooms, bathrooms, common areas, outdoor. A bedroom guests actually book can be linked to its booking calendar; other room types can't (the UI hides the iCal field unless `linked_to_bookings` is on).

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| property_id | uuid, not null, fk → properties.id | silently assigned, same single-active-property convention as `transactions` |
| name | text, not null | "Room 1", "Garden" |
| room_type | text, not null | check in (`bedroom`,`bathroom`,`common_area`,`outdoor`) |
| is_active | boolean, not null | default `true` |
| linked_to_bookings | boolean, not null | default `false`; only `true` rooms may have `ical_url` set |
| ical_url | text, null | calendar export URL from the booking platform/Home Assistant; read-only from NIVA's side |
| ical_last_synced_at | timestamptz, null | |
| ical_sync_status | text, null | check in (`ok`,`error`,`pending`); null until first sync attempt |
| created_by / created_at / updated_by / updated_at | | standard audit columns |

Check constraint: `ical_url is null when linked_to_bookings = false`.

### `sop_tasks` (migration 0012)

The cleaning checklist for a room, admin-defined per room rather than per room *type* — Release 1 has too few rooms for a shared-template layer to earn its complexity; a similar room's list gets copied by hand. Recurs on a schedule, same cadence shape as `recurring_payments`.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| room_id | uuid, not null, fk → rooms.id | |
| name | text, not null | "Remove & replace linen" |
| cadence_type | text, not null | check in (`daily`,`weekly`,`monthly`,`quarterly`) |
| cadence_day_of_week | smallint, null | 0 (Sunday) – 6 (Saturday); set only when `cadence_type = 'weekly'` |
| cadence_day_of_month | smallint, null | 1–31; set only when `cadence_type` is `monthly` or `quarterly` |
| is_active | boolean, not null | default `true`; archive rather than delete once a task has completion history |
| created_by / created_at / updated_by / updated_at | | standard audit columns |

Same one-of-two-cadence-columns check as `recurring_payments` (§5 rule 6). `quarterly` reuses `cadence_day_of_month`, evaluated every three months from the task's `created_at` — good enough for a handful of admin-eyeballed tasks a year; not worth a separate month-offset column.

### `sop_task_completions` (migration 0012)

One row per time a task actually gets ticked — append-only, not an editable record. This is what the daily/weekly completion percentage and on-time-vs-delayed reporting (§8, §11) are computed from; there's no history before this migration.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| room_id | uuid, not null, fk → rooms.id | denormalized off `sop_tasks.room_id` so reports can query by room without a join, and the row still means something if the task is later archived |
| task_id | uuid, not null, fk → sop_tasks.id | |
| due_on | date, not null | the occurrence's due date, computed from the task's cadence at the moment of completion and stored, not recomputed later — protects history if the cadence rule changes afterward |
| completed_at | timestamptz, not null | default `now()` |
| completed_by | uuid, not null, fk → auth.users.id | |
| is_late | boolean, not null, generated | `due_on < completed_at::date` |

Un-ticking a task in the app deletes its most recent completion row for today, rather than leaving a "reversed" record — matches how the prototype already treats ticking as reversible right up until inspection.

### `room_inspections` (migration 0012)

Mom's optional, non-mandatory spot-check — "Pending Inspection" is soft, never blocking (decided 2026-08-23). One row per room per day, at most.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| room_id | uuid, not null, fk → rooms.id | |
| inspected_on | date, not null | |
| inspected_at | timestamptz, not null | default `now()` |
| inspected_by | uuid, not null, fk → auth.users.id | |

Unique on `(room_id, inspected_on)`.

### `workforce_members` (migration 0012)

The operational roster — who gets rooms assigned. Deliberately separate from `workspace_memberships`: some workforce members never sign into NIVA at all (a gardener or maintenance person who's just tracked for pay and days off), so a roster entry can't require a login to exist.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| membership_id | uuid, null, fk → workspace_memberships.id | set only when "Give app access" is on for this person |
| name | text, not null | independent of `profiles.display_name` — doesn't require `membership_id` to be set |
| crew_role | text, not null | check in (`housekeeper`,`gardener`,`maintenance`,`other`) |
| is_active | boolean, not null | default `true` |
| recurring_payment_id | uuid, null, fk → recurring_payments.id, on delete set null | the "Paid via" link |
| created_by / created_at / updated_by / updated_at | | standard audit columns |

### `workforce_days_off` (migration 0012)

Explicit dates, not a recurring weekly pattern — matches the 2026-08-23 decision that days off are set week by week with no default to maintain. No reason/type field: flagging or tracking why someone was off was explicitly ruled out for this version.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| workforce_member_id | uuid, not null, fk → workforce_members.id | |
| day_off | date, not null | |
| hours_worked | numeric(4,1), null | unused in Release 1 — kept so a future per-hour tracking feature (raised as a possible ask from later customers) doesn't need a schema change to switch on |

Unique on `(workforce_member_id, day_off)`.

### `room_assignments` (migration 0012)

Who owes which room, per day. Only manual overrides are stored — the default round-robin (active Housekeepers not off today, distributed by index across today's due rooms) is deterministic and computed live, so most days generate zero rows here.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, pk | |
| workspace_id | uuid, not null, fk → workspaces.id | |
| room_id | uuid, not null, fk → rooms.id | |
| assigned_on | date, not null | |
| workforce_member_id | uuid, not null, fk → workforce_members.id | |

Unique on `(room_id, assigned_on)`. Deleting a row reverts that room, that day, back to the computed default.

## 4. Indexes

- `transactions (workspace_id, occurred_on)` — dashboard/report period queries.
- `transactions (workspace_id, property_id, occurred_on)` — property-filtered views.
- `transactions (workspace_id, type, category_id)` — category reports.
- `transactions (workspace_id, platform_id)` — revenue-by-platform report.
- `transactions (recurring_payment_id) WHERE recurring_payment_id is not null` — traceability lookups, small partial index since most transactions have no recurring origin.
- `recurring_payments (workspace_id, next_due_on)` — the Overdue/Upcoming grouping and Dashboard's "due soon" attention-strip item.
- `workspace_memberships (user_id)` — RLS lookups.
- Partial unique index on `workspace_currencies (workspace_id) WHERE is_default` — one default currency per workspace.
- `sop_tasks (workspace_id, room_id)` — the per-room checklist query.
- `sop_task_completions (workspace_id, room_id, due_on)` — daily/weekly rollups and the "areas needing attention" report.
- `sop_task_completions (task_id, due_on)` — per-task history.
- `room_inspections (workspace_id, room_id, inspected_on)`.
- `workforce_members (workspace_id, is_active)`.
- `workforce_days_off (workforce_member_id, day_off)`.
- `room_assignments (workspace_id, assigned_on)`.
- Partial index on `rooms (workspace_id) WHERE linked_to_bookings` — the daily iCal sync job's scan.

## 5. Data integrity beyond column constraints

Two rules can't be expressed as simple foreign keys and need a `BEFORE INSERT OR UPDATE` trigger on `transactions`:

1. **Category/type match.** Reject if `categories.type <> transactions.type` for the referenced `category_id`.
2. **Currency enabled.** Reject if `currency_code` has no active row in `workspace_currencies` for the transaction's `workspace_id`.

Both should raise a clear error the application layer can map to a plain-language message (per the UI/UX validation principles), not a raw constraint-violation string.

Three more rules, added by migration 0005 for the favorites/sub-category columns:

3. **Sub-category depth and consistency.** A `categories` row with `parent_category_id` set must reference a parent in the same `workspace_id`, the same `type`, and that parent must not itself have a parent (max one level deep).
4. **Favorite limit, categories.** At most 3 rows with `is_favorite = true` per `(workspace_id, type)`.
5. **Favorite limit, payment methods.** At most 3 rows with `is_favorite = true` per `workspace_id`.

One more, added by migration 0011 on `recurring_payments`:

6. **Category must be expense, currency must be enabled.** Same two checks as the `transactions` trigger (rules 1–2 above), applied on insert/update of a recurring payment definition rather than the transaction it eventually generates.

Three more, added by migration 0012 for housekeeping:

7. **Completion room/task match.** `sop_task_completions.room_id` must equal the `room_id` of the referenced `task_id` — trigger-enforced since it's denormalized (§3).
8. **iCal fields.** `rooms.ical_url` must be null when `linked_to_bookings = false` (check constraint).
9. **Cadence column pairing.** `sop_tasks` enforces exactly one of `cadence_day_of_week`/`cadence_day_of_month` set, matching `cadence_type` — same pattern as rule 6.

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
| Configuration tables (properties, platforms, categories, payment_methods, workspace_currencies) | any member of the workspace | administrator | administrator | administrator (blocked by FK/trigger if referenced by a transaction — see below) |
| `suppliers` | any member of the workspace | administrator, manager, staff | administrator | administrator (blocked by FK/trigger if referenced by a transaction) |
| `recurring_payments` | administrator, manager only | administrator, manager | administrator, manager | administrator, manager (real hard delete, not archive) |
| `workspace_memberships` | any member of the workspace | administrator | administrator | administrator |
| `profiles` | self, and any workspace co-member | self (own row) | self (own row) | n/a |
| `rooms`, `sop_tasks` | any member of the workspace | administrator | administrator | administrator (archive via `is_active`) |
| `sop_task_completions` | any member of the workspace | administrator, manager, staff | n/a — append-only | the completing user (own same-day rows only); administrator/manager may delete any |
| `room_inspections` | any member of the workspace | administrator, manager | n/a — append-only | administrator, manager |
| `workforce_members`, `workforce_days_off`, `room_assignments` | any member of the workspace | administrator, manager | administrator, manager | administrator, manager |

Every policy's `USING`/`WITH CHECK` clause is scoped by `workspace_id = <row's workspace> AND current_role_in_workspace(workspace_id) = ANY(<allowed roles>)`. `viewer` never appears in an INSERT/UPDATE/DELETE allow-list.

`suppliers` INSERT is the one configuration table open to staff/manager, not just administrator (fixed 2026-07-20, migration 0005) — the transaction form silently creates a supplier row when a staff member types a new name that isn't in the list yet (`useSuppliers().findOrCreate()`), and that role can already create transactions. Renaming or archiving a supplier is still administrator-only, via the Suppliers admin screen.

Archiving a configuration item that is referenced by an existing transaction is allowed (it just stops appearing as a selectable option); hard-deleting one that is referenced is blocked at the database level, independent of what the UI prevents — this is the "defence in depth" the technology-stack document calls for.

## 7. Audit trail

`created_by`/`created_at`/`updated_by`/`updated_at` on every business table is the Release 1 audit baseline. A dedicated `transaction_history` table (full field-level change log) is deferred — it is not required to meet the blueprint's "financial records deserve care" guardrail at this scale, but is a natural post-release candidate if reviewers need to see who changed what value.

`sop_task_completions` and `room_inspections` (migration 0012) deliberately use a lighter shape — a single `completed_by`/`completed_at` or `inspected_by`/`inspected_at` pair, no separate `created_by`/`updated_by`. Both tables are append-only logs of one action each; there's nothing to "update," so the full four-column pattern would just be unused columns.

## 8. Reporting functions (Phase 4, migrations 0007–0008)

Three read-only `SECURITY DEFINER` functions back the Dashboard and Reports screens — see `10-api-data-access-spec.md` §2 "Reporting" for their exact call shape. All three share a signature: `(p_workspace_id uuid, p_property_id uuid, p_period_start date, p_period_end date)`, with `p_property_id` nullable for "all properties," and are guarded by `where is_workspace_member(p_workspace_id)` in the same style as `current_role_in_workspace` — a caller for a workspace they're not a member of gets zero rows, not an error and not another workspace's data.

- `dashboard_summary` — income/expenses/net, grouped by `currency_code`. Never sums across currencies (§1).
- `revenue_by_platform` — income transactions grouped by `(currency_code, platform_id)`.
- `expenses_by_category` — expense transactions grouped by `(currency_code, top-level category)`. A transaction's `category_id` may point at a sub-category (§3); this function rolls it up via `coalesce(c.parent_category_id, c.id)` and also returns `category_ids` (every contributing category id, top-level plus subs) so a client drill-down can match the total exactly with `.in()` instead of missing sub-category rows on an exact-match filter.

`EXECUTE` on all three is revoked from `anon`/`PUBLIC` and granted only to `authenticated`, matching `set_default_workspace_currency`'s existing grant pattern.

Two more, added by migration 0012, same `is_workspace_member` guard and `authenticated`-only grant:

- `housekeeping_completion_summary(p_workspace_id, p_period_start, p_period_end)` — per-day counts of tasks due, completed, completed-on-time, and completed-late, grouped by `due_on`. The Dashboard glance line and the Reports trend chart read from the same function, just at different granularities — today only vs. the selected period.
- `housekeeping_attention_rooms(p_workspace_id)` — one row per room currently overdue or un-inspected for more than a day, with `last_completed_at` and days-since. Backs the "Areas needing attention" list. Deliberately has no per-person breakdown — Jalie was explicit this isn't meant to be a staff performance metric (§11).
- `housekeeping_today_checklist(p_workspace_id, p_as_of default current_date)` — one row per (room, task) with that task's current occurrence's due date and done/not-done state, already joined against the day's completion and inspection rows. Backs Today / Today's schedule directly, so the cadence math (`sop_task_current_due_on`) lives in one place instead of being duplicated in the client.

## 9. Open items for Phase 1 implementation

- Confirm decimal precision `numeric(14,2)` is sufficient for all currencies in scope (2 decimal places covers LKR/USD/EUR; revisit if a zero-decimal or 3-decimal currency is enabled).
- Decide whether `profiles.email` is synced via a Postgres trigger on `auth.users` or read from the session on the client — either is fine, pick the one that's less fragile to Supabase Auth changes.
- Write the actual seed migration for `iso_currencies` (ISO 4217 list, or a trimmed list covering only realistically needed codes).
- Confirm sort/display order for configuration lists (e.g. an `sort_order` column) is needed for Release 1 or can wait.

## 10. Staff nav visibility — decided 2026-08-04, built alongside migration 0012

Prompted by a real case: a housekeeping/inventory staff member (Jalie's employee) who should mostly see only that area, once it exists (`06-development-roadmap.md` post-release item 5). Decision, applied now that Housekeeping is actually being built (§11):

- Keep the existing `staff` role exactly as-is for permissions — it already restricts transaction editing/deletion and all configuration access at the RLS layer (§6). No security change needed.
- Add a new nullable column, `workspace_memberships.visible_areas` (e.g. `text[]`), scoped per membership row. `null`/empty means "see everything permitted by role" (today's behavior — no migration-day impact on existing members). A non-null value restricts which nav areas the client shows that specific person, administrator-configurable per member in the Users admin screen (prototyped 2026-08-24, `docs/housekeeping-in-app-prototype.html`).
- This is a **navigation-filtering hint only** — it changes what the More sheet (see `09-wireframes.md` "Navigation chrome") renders for that person, nothing else. RLS remains the actual security boundary and is untouched; a restricted staff member who somehow opened a hidden route would still be bound by their role's existing RLS grants, not by `visible_areas`.
- Values are per-screen, not just per top-level nav item — e.g. `housekeeping-schedule` and `housekeeping-calendar` can be granted independently of `housekeeping-roster`, so a manager like Mom can see the work calendar without also getting roster/wage-editing. See the prototype's `SCREEN_GROUPS` for the exact catalogue of toggleable screen ids.

## 11. Housekeeping, staff & rooms — implementation notes (migration 0012)

Schema above (rooms, `sop_tasks`, `sop_task_completions`, `room_inspections`, `workforce_members`, `workforce_days_off`, `room_assignments`) covers the module designed and prototyped through 2026-08-19 to 2026-08-24 (`docs/housekeeping-in-app-prototype.html`). Loose ends to settle during Phase 1 implementation, not before:

- **Occurrence computation isn't a stored schedule.** "What's due today" for monthly/quarterly tasks is evaluated in application/RPC code from `sop_tasks.created_at` + the cadence columns, not a generated occurrences table. Revisit only if a real task ever needs a one-off exception date.
- **"Overdue" definition.** A task is overdue when today is past its computed `due_on` and no `sop_task_completions` row exists for that occurrence yet. Daily tasks are only "overdue" within the same day — tomorrow is a fresh occurrence, not a carried-over debt, matching the "not forcing" tone of the inspection status.
- **iCal sync: manual only so far.** A Supabase Edge Function, `sync-room-ical` (2026-08-24), fetches `ical_url`, sanity-checks it's really a calendar (`BEGIN:VCALENDAR`, counts `BEGIN:VEVENT`), and stamps `ical_last_synced_at`/`ical_sync_status` — triggered by the "Sync now" button on a room's detail screen (RoomsView.vue), not a schedule. It runs under the calling user's own JWT/RLS (no service-role key), so only an administrator's sync actually writes (`rooms_update` is administrator-only) — a manager or staff account calling it gets a clear "only an administrator can sync" back instead of a silent no-op. It does **not** parse booking dates into anything the app acts on yet — no cadence type consumes booking data, so "a room's booking dates feed its cleaning schedule" (the original framing) is still aspirational. The once-a-day automatic sync (1:00 AM property-local time, Jalie's 2026-08-23 call, to stay clear of Cloudflare/Supabase free-tier limits) still isn't built — either Supabase `pg_cron` calling this same function, or a Cloudflare Worker Cron Trigger, would work; pick whichever has less operational overhead when that phase starts.
- **No per-person completion metrics.** `housekeeping_completion_summary`/`housekeeping_attention_rooms` (§8) report at the room/property level only. Jalie was explicit (2026-08-24) that this isn't meant to track individual staff performance, matching the earlier no-hourly-timesheets decision (§3 `workforce_days_off`). A per-person breakdown is an additive query, not a schema change, if a future customer asks for it.
- **`crew_role`/room type enums are intentionally small.** Both are plain `check` constraints, not lookup tables — Release 1 doesn't need admin-editable crew roles or room types, and adding either later is a simple constraint change, not a migration of existing data.
- **`workforce_members`/`workforce_days_off`/`room_assignments` SELECT is any workspace member, not administrator/manager only** (corrected from the first draft of §6, which scoped read the same as write). Jane's own Today view has to read the roster and today's assignments to know which rooms are hers — that's the same "any member reads" shape as `rooms`/`sop_tasks`/`sop_task_completions`. Only the wage amount itself stays hidden from her, via `recurring_payments`' existing administrator/manager-only policy (0011) — `workforce_members.recurring_payment_id` is just an opaque id to her.
