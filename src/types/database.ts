// Hand-written to match docs/07-domain-model-and-schema.md until the first
// migration is applied to a live project and `supabase gen types typescript`
// can generate this file for real. Keep both in sync until then.

export type Role = 'administrator' | 'manager' | 'staff' | 'viewer'
export type TransactionType = 'income' | 'expense'
export type TransactionStatus = 'active' | 'archived'

export interface Workspace {
  id: string
  name: string
  created_at: string
}

export interface WorkspaceMembership {
  id: string
  workspace_id: string
  user_id: string
  role: Role
  created_at: string
  // migration 0012 — a navigation-filtering hint only (07-domain-model-
  // and-schema.md §10). null/empty means "see everything permitted by
  // role"; a non-null array restricts which screen ids the client's nav
  // shows this specific person. RLS is the real security boundary, not this.
  visible_areas: string[] | null
}

export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  created_at: string
}

interface ConfigItemBase {
  id: string
  workspace_id: string
  name: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export type Property = ConfigItemBase
export type Platform = ConfigItemBase
export type Supplier = ConfigItemBase

export interface PaymentMethod extends ConfigItemBase {
  is_favorite: boolean
}

export interface Category extends ConfigItemBase {
  type: TransactionType
  is_favorite: boolean
  // A category with a parent is a sub-category. Sub-categories can't
  // themselves have children or be favorited — see migration 0005.
  parent_category_id: string | null
}

export interface IsoCurrency {
  code: string
  name: string
  minor_unit: number
}

export interface WorkspaceCurrency {
  id: string
  workspace_id: string
  currency_code: string
  is_active: boolean
  is_default: boolean
}

export interface Transaction {
  id: string
  workspace_id: string
  property_id: string
  type: TransactionType
  category_id: string
  payment_method_id: string
  platform_id: string | null
  supplier_id: string | null
  currency_code: string
  // numeric(14,2). PostgREST actually returns this as a JSON number, not a
  // string — useTransactions' flatten() normalizes it to string on the way
  // out so every consumer (esp. the edit form's Zod schema) can rely on it.
  amount: string
  occurred_on: string
  notes: string | null
  status: TransactionStatus
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
}

// Joined shape returned by useTransactions().get() — see docs/10-api-data-access-spec.md
export interface TransactionWithLabels extends Transaction {
  property_name: string
  category_name: string
  payment_method_name: string
  platform_name: string | null
  supplier_name: string | null
}

export type RecurringPaymentCadence = 'monthly' | 'weekly'

// docs/12-ux-options-review.md Part 2/B2 — migration 0011. Always an
// expense (no income variant); manager/administrator only, both in RLS
// and in the app's own nav gating.
export interface RecurringPayment {
  id: string
  workspace_id: string
  property_id: string
  name: string
  category_id: string
  payment_method_id: string
  currency_code: string
  amount: string
  cadence_type: RecurringPaymentCadence
  // 1-31, set only when cadence_type is 'monthly'.
  cadence_day_of_month: number | null
  // 0 (Sunday) - 6 (Saturday), matching JS Date#getDay(); set only when
  // cadence_type is 'weekly'.
  cadence_day_of_week: number | null
  next_due_on: string
  notes: string | null
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
}

export interface RecurringPaymentWithLabels extends RecurringPayment {
  category_name: string
  payment_method_name: string
}

// ---------------------------------------------------------------------------
// Housekeeping, rooms & staff — migration 0012, docs/07-domain-model-and-
// schema.md §3/§10/§11. Designed and prototyped 2026-08-19 to 2026-08-24
// (docs/housekeeping-in-app-prototype.html).
// ---------------------------------------------------------------------------

export type RoomType = 'bedroom' | 'bathroom' | 'common_area' | 'outdoor'
// 'once' (migration 0015) is a manager-added ad hoc task for a single day —
// see sop_task_add_for_today() — not a real recurring cadence, so it's kept
// out of the admin cadence chip picker in RoomsView.vue and only ever
// created via the Today checklist's "add for today" action.
export type SopCadenceType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'once'
// Booking-linked checklist (migration sop_task_occupancy_scope, 2026-08-27):
// 'always' preserves prior behavior — every task defaults to it. 'occupied'
// applies whenever a guest is physically present (checkout day or stayover).
// 'checkout_only' is the heavy turnover-specific work that only makes sense
// the day a guest actually leaves. See docs/09-wireframes.md's "Booking-
// linked checklist" note.
export type SopOccupancyScope = 'always' | 'occupied' | 'checkout_only'
export type CrewRole = 'housekeeper' | 'gardener' | 'maintenance' | 'other'

export interface Room {
  id: string
  workspace_id: string
  property_id: string
  name: string
  // Optional Sinhala name (migration 0014) — free text, admin-entered,
  // shown in place of `name` only when the viewer's locale is Sinhala and
  // this is set. Never auto-translated; there's no translation service in
  // this app, just a second field.
  name_si: string | null
  room_type: RoomType
  is_active: boolean
  linked_to_bookings: boolean
  ical_url: string | null
  ical_last_synced_at: string | null
  ical_sync_status: 'ok' | 'error' | 'pending' | null
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
}

export interface SopTask {
  id: string
  workspace_id: string
  room_id: string
  name: string
  // See Room.name_si — same optional-second-field pattern.
  name_si: string | null
  cadence_type: SopCadenceType
  // 0 (Sunday) - 6 (Saturday); set only when cadence_type is 'weekly'.
  cadence_day_of_week: number | null
  // 1-31; set only when cadence_type is 'monthly' or 'quarterly'.
  cadence_day_of_month: number | null
  // Set only when cadence_type is 'once' — the single day this ad hoc task
  // is due (migration 0015). Never set by the Rooms admin form.
  once_on: string | null
  // Booking-linked checklist (2026-08-27) — see SopOccupancyScope above.
  occupancy_scope: SopOccupancyScope
  is_active: boolean
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
}

// One row per (room, task) for a given day — the shape
// housekeeping_today_checklist() returns, already joined against that
// occurrence's completion and the room's inspection for the day. Not a
// plain table row; see useHousekeepingToday.ts.
export interface TodayChecklistRow {
  room_id: string
  room_name: string
  room_name_si: string | null
  room_type: RoomType
  linked_to_bookings: boolean
  task_id: string
  task_name: string
  task_name_si: string | null
  cadence_type: SopCadenceType
  due_on: string
  is_done: boolean
  // True when an administrator/manager skipped this occurrence for today
  // (migration 0015, sop_task_skips) — excluded from progress totals, shown
  // struck through with an "Undo skip" affordance for admin/manager.
  is_skipped: boolean
  completed_by: string | null
  completed_at: string | null
  inspected_by: string | null
  inspected_at: string | null
  // Booking-linked checklist (2026-08-27, sop_task_occupancy_overrides).
  // occupancy_scope is the task's own setting; occupancy_excluded is whether
  // that scope actually hides it today given the room's booking status;
  // is_force_included is whether an administrator/manager already pulled it
  // back in for today via sop_task_include_today. A task is hidden from a
  // caretaker's Today view exactly when occupancy_excluded && !is_force_included.
  occupancy_scope: SopOccupancyScope
  occupancy_excluded: boolean
  is_force_included: boolean
}

export interface WorkforceMember {
  id: string
  workspace_id: string
  membership_id: string | null
  name: string
  crew_role: CrewRole
  is_active: boolean
  recurring_payment_id: string | null
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
}

export interface WorkforceDayOff {
  id: string
  workspace_id: string
  workforce_member_id: string
  day_off: string
  hours_worked: string | null
}

export interface RoomAssignment {
  id: string
  workspace_id: string
  room_id: string
  assigned_on: string
  workforce_member_id: string
}

// Parsed iCal booking date range — migration 0013, written server-side by
// the sync-room-ical Edge Function only (see useRoomBookings.ts).
export interface RoomBooking {
  id: string
  workspace_id: string
  room_id: string
  starts_on: string
  ends_on: string
  uid: string | null
  synced_at: string
  created_at: string
}

// housekeeping_completion_summary() row — see docs §8.
export interface HousekeepingCompletionDay {
  report_date: string
  tasks_due: number
  tasks_completed: number
  tasks_on_time: number
  tasks_late: number
}

// housekeeping_attention_rooms() row — see docs §8.
export interface HousekeepingAttentionRoom {
  room_id: string
  room_name: string
  tasks_overdue: number
  last_completed_at: string | null
  last_inspected_at: string | null
}
