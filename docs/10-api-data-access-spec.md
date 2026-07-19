# API and Data-Access Specification

**Status:** Foundation — approved direction, implementation pending
**Depends on:** `03-technology-stack.md`, `07-domain-model-and-schema.md`

NIVA has no hand-written REST/GraphQL API for Release 1. The "API" is a typed data-access layer over the Supabase client, with RLS as the real authorization boundary (per `03-technology-stack.md` §"Data-access posture"). This document specifies that layer's contract so screens are built against a stable shape rather than ad-hoc queries scattered through components.

## 1. Access pattern

- All reads and writes covered by RLS go directly from the Vue app to Supabase via `supabase-js`, using the generated TypeScript types (`supabase gen types typescript`) as the contract's source of truth.
- No Cloudflare Worker exists for Release 1. A Worker is introduced only when a specific operation needs a service-role key, cross-workspace logic, a webhook receiver, or third-party secrets — none of which Release 1 requires. If one is added later, it gets its own numbered doc section here rather than growing informally.
- Every query and mutation used by more than one screen lives in a composable (`useTransactions()`, `useDashboard()`, etc.), not duplicated per component. This is where retry, error-mapping, and loading-state logic live once.

## 2. Entity endpoints (composable contracts)

Each business entity exposes the same shape unless noted otherwise. `Entity` stands for `Property`, `Platform`, `Category`, `PaymentMethod`, `Supplier`, `WorkspaceCurrency`.

| Operation | Shape | Notes |
| --- | --- | --- |
| `list()` | `Promise<Entity[]>` | includes archived items with `is_active: false`; UI filters by default, Administration screen can show all |
| `create(input)` | `Promise<Entity>` | `input` omits `id`, audit fields; server sets `created_by`/`created_at` |
| `update(id, input)` | `Promise<Entity>` | partial update; server sets `updated_by`/`updated_at` |
| `archive(id)` | `Promise<Entity>` | sets `is_active: false`; never a hard delete from the client |

### Transactions

| Operation | Shape | Notes |
| --- | --- | --- |
| `list(filters)` | `Promise<{ items: Transaction[]; total: number }>` | `filters`: `{ workspaceId, propertyId?, type?, categoryId?, platformId?, dateFrom?, dateTo?, page?, pageSize? }`. Default `pageSize` 50. Offset-based paging is sufficient at this data scale. |
| `get(id)` | `Promise<Transaction>` | includes joined display names (property, category, platform, supplier, payment method) so the detail screen doesn't issue five extra queries |
| `create(input)` | `Promise<Transaction>` | `input` matches the fields on the Quick Add form; `type` determines which optional fields are required (validated client-side with Zod and re-checked by the database trigger in `07-domain-model-and-schema.md` §5) |
| `update(id, input, expectedUpdatedAt)` | `Promise<Transaction>` | see §4 Concurrency below — `expectedUpdatedAt` is required, not optional |
| `archive(id)` | `Promise<Transaction>` | sets `status: 'archived'`; returns the archived record so the UI can offer Undo |
| `unarchive(id)` | `Promise<Transaction>` | powers the short-lived Undo action and the Administration "restore" path |

### Reporting

Reports and the dashboard read from Postgres views/RPC functions, not client-side aggregation — the same total must always be reachable two ways (table drill-down and summary) without risking client math diverging from server math.

| Function | Shape | Notes |
| --- | --- | --- |
| `getDashboardSummary(workspaceId, propertyId, periodStart, periodEnd)` | `Promise<{ income: Money; expenses: Money; net: Money }>` | Postgres RPC `dashboard_summary(...)`; single currency at a time, one call per enabled currency if a workspace uses more than one |
| `getRevenueByPlatform(...)` | `Promise<{ platformId, platformName, total: Money }[]>` | RPC `revenue_by_platform(...)` |
| `getExpensesByCategory(...)` | `Promise<{ categoryId, categoryName, total: Money }[]>` | RPC `expenses_by_category(...)` |

`Money` is `{ amount: string; currencyCode: string }` — amounts are transported as strings to avoid floating-point round-tripping through JSON; formatting/display math happens with a decimal-safe library, never native JS arithmetic on the raw number.

### Workspace and membership

| Operation | Shape | Notes |
| --- | --- | --- |
| `getCurrentWorkspace()` | `Promise<Workspace>` | resolved from the signed-in user's membership; Release 1 assumes one active workspace per session (workspace switching UI is a later addition if a user belongs to more than one) |
| `listMembers()` | `Promise<Member[]>` | administrator only, enforced by RLS |
| `updateMemberRole(userId, role)` | `Promise<Member>` | administrator only |

Creating a new workspace or inviting a first user into it is a manual/admin action in Release 1 (per the workspace decision in `00-project-blueprint.md` §10) — no `createWorkspace()` or `inviteMember()` client call exists yet.

## 3. Error contract

Every composable method rejects with a single normalized shape:

```ts
interface NivaError {
  code: NivaErrorCode;
  message: string;       // plain-language, safe to show the user as-is
  field?: string;        // present for field-level validation errors
  retryable: boolean;
}

type NivaErrorCode =
  | 'validation_error'      // failed a client or database check constraint/trigger
  | 'not_found'
  | 'permission_denied'     // RLS rejected the operation
  | 'conflict'              // optimistic concurrency mismatch on update
  | 'network_error'         // request never reached the server
  | 'unknown_error';
```

The data-access layer maps every Postgres/PostgREST error (unique violation, check violation, RLS denial, the category/type-match and currency-enabled triggers from `07-domain-model-and-schema.md` §5) into this shape before it reaches a component. Components never inspect raw Postgres error codes or SQLSTATE values — that mapping happens in one place so copy stays consistent with `04-ui-ux-principles.md` §8 ("Try again," not "Unhandled error").

`permission_denied` and `validation_error` are never shown as a generic failure — the UI already knows, from the signed-in role, when an action shouldn't be attempted, so this code path indicates a real mismatch (e.g. role changed in another tab) and should prompt a refresh rather than a blind retry.

## 4. Concurrency on edit

`transactions.update()` always includes `updated_at = expectedUpdatedAt` in the `WHERE` clause. If the row was already changed by someone else, zero rows match and the client treats that as `conflict`, not silent success. The edit screen then reloads the current values and shows the "changed since you opened it" state specified in `09-wireframes.md`. This is enforced in the query, not inferred from a diff, so it can't be bypassed by a component that forgets to check.

## 5. Filtering, sorting, pagination conventions

- Filters are always explicit query parameters, never free-form client-side `.filter()` over an unbounded fetch.
- Default sort for transaction lists: `occurred_on desc, created_at desc`.
- `pageSize` is capped at 100 server-side regardless of what the client requests.
- Every list response includes `total` so the UI can show "Showing 1–50 of 214" rather than guessing from page length.

## 6. Realtime

Not used in Release 1. Lists and totals refresh after the mutation that caused them to change (per `04-ui-ux-principles.md` §5: "update the transaction list and relevant summary without forcing a manual refresh") — this is a refetch-on-mutation pattern, not a live subscription. Supabase Realtime is a reasonable future addition if multiple staff routinely edit concurrently and the polling/refetch pattern proves insufficient.

## 7. Open items for Phase 1 implementation

- Write the three reporting RPC functions and decide whether they live as `SECURITY DEFINER` functions (bypassing RLS internally but still workspace-scoped by parameter) or as views with RLS applied — the schema doc's trigger-based validation should inform this once real query performance is measured.
- Confirm the exact Zod schemas per form mirror the database constraints so client and server validation never disagree about what's "invalid."
- Decide whether `NivaError.message` is ever localized, or English-only for Release 1.
