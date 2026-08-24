-- 0013_room_bookings: stores parsed booking date ranges from a room's
-- iCal calendar, so the app can actually use "which dates have guests"
-- instead of just proving the URL is reachable (migration 0012's
-- ical_last_synced_at/ical_sync_status). Backs two things Jalie asked for
-- 2026-08-24: booked-date overlay on the Staff work calendar, and a real
-- daily automatic sync (the manual "Sync now" button from 2026-08-24 only
-- validated the URL and counted events, never stored the actual dates).
--
-- Written entirely server-side by the sync-room-ical Edge Function, which
-- deletes and re-inserts a room's full set on every sync (an ICS feed has
-- no stable diff to reconcile against — Airbnb doesn't send deltas) rather
-- than trying to update rows in place. No client ever writes this table
-- directly.

create table room_bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  room_id uuid not null references rooms(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  -- The ICS event's UID, when present — kept for debugging/traceability
  -- only, nothing reads it. Not unique-constrained: a delete-then-reinsert
  -- per sync means there's never more than one live row per UID anyway.
  uid text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint room_bookings_date_order check (ends_on >= starts_on)
);

create index room_bookings_workspace_idx on room_bookings (workspace_id);
create index room_bookings_room_range_idx on room_bookings (room_id, starts_on, ends_on);

-- Stamps workspace_id from the room, same pattern as
-- set_sop_task_completion_fields (migration 0012) — the Edge Function only
-- ever supplies room_id/starts_on/ends_on/uid.
create or replace function set_room_booking_workspace_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  select workspace_id into new.workspace_id from rooms where id = new.room_id;
  if new.workspace_id is null then
    raise exception 'room_id % does not reference an existing room', new.room_id;
  end if;
  return new;
end;
$fn$;

create trigger room_bookings_set_workspace_id
  before insert on room_bookings
  for each row
  execute function set_room_booking_workspace_id();

alter table room_bookings enable row level security;

-- Any workspace member can read booking dates (the Staff work calendar's
-- booked-day overlay needs this for manager AND the housekeeper choosing
-- their own days off) — same "read is open, write is administrator"
-- split already used for rooms/workforce tables.
create policy room_bookings_select on room_bookings
  for select
  using (is_workspace_member(workspace_id));

-- Regular (non-service-role) writes are administrator-only, matching
-- rooms_update — a manager triggering "Sync now" gets the same clear
-- rejection here as they already do on the rooms table itself. The
-- automatic daily cron sync uses the service role key instead, which
-- bypasses RLS entirely by design (there's no signed-in user for a
-- scheduled job to act as).
create policy room_bookings_insert on room_bookings
  for insert
  with check (current_role_in_workspace(workspace_id) = 'administrator');

create policy room_bookings_delete on room_bookings
  for delete
  using (current_role_in_workspace(workspace_id) = 'administrator');
