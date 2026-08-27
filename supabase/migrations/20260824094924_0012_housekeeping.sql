-- Housekeeping, rooms & staff — docs/07-domain-model-and-schema.md §3/§10/§11.
-- Designed and prototyped 2026-08-19 to 2026-08-24
-- (docs/housekeeping-in-app-prototype.html); this migration is what makes
-- it real. Also builds workspace_memberships.visible_areas (docs §10),
-- deliberately deferred until there was an actual feature for it to gate.

-- ============================================================================
-- 1. Rooms & SOP tasks
-- ============================================================================

create table rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  property_id uuid not null references properties(id),
  name text not null,
  room_type text not null check (room_type in ('bedroom', 'bathroom', 'common_area', 'outdoor')),
  is_active boolean not null default true,
  -- Only a room guests actually book gets an iCal link; other room types
  -- never show the field in the UI at all.
  linked_to_bookings boolean not null default false,
  ical_url text,
  ical_last_synced_at timestamptz,
  ical_sync_status text check (ical_sync_status in ('ok', 'error', 'pending')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint rooms_ical_url_requires_link check (
    linked_to_bookings or ical_url is null
  )
);

create index rooms_workspace_idx on rooms (workspace_id);
create index rooms_workspace_linked_idx on rooms (workspace_id) where linked_to_bookings;

create trigger rooms_set_audit_fields before insert or update on rooms
  for each row execute function set_audit_fields();

-- The cleaning checklist for a room, admin-defined per room (not per room
-- *type* — too few rooms in Release 1 for a shared-template layer to earn
-- its complexity). Cadence shape mirrors recurring_payments (0011), with
-- monthly/quarterly sharing cadence_day_of_month.
create table sop_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references rooms(id),
  name text not null,
  cadence_type text not null check (cadence_type in ('daily', 'weekly', 'monthly', 'quarterly')),
  cadence_day_of_week smallint check (cadence_day_of_week between 0 and 6),
  cadence_day_of_month smallint check (cadence_day_of_month between 1 and 31),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint sop_tasks_cadence_fields check (
    (cadence_type = 'daily' and cadence_day_of_week is null and cadence_day_of_month is null)
    or (cadence_type = 'weekly' and cadence_day_of_week is not null and cadence_day_of_month is null)
    or (cadence_type in ('monthly', 'quarterly') and cadence_day_of_month is not null and cadence_day_of_week is null)
  )
);

create index sop_tasks_workspace_room_idx on sop_tasks (workspace_id, room_id);

create trigger sop_tasks_set_audit_fields before insert or update on sop_tasks
  for each row execute function set_audit_fields();

-- ---- Occurrence math -------------------------------------------------------
--
-- "What's the most recent date this task was due, on or before p_as_of?"
-- Not a stored schedule (docs §11) — evaluated on demand. Daily is always
-- today. Weekly steps back to the most recent matching weekday. Monthly and
-- quarterly both anchor on a day-of-month, clamped into shorter months the
-- same way mark_recurring_payment_paid (0011) clamps; quarterly only
-- "counts" in months that are a multiple of 3 away from the task's
-- reference month (p_reference_month — the month it was created in), e.g. a
-- task created in February is due Feb/May/Aug/Nov.
create or replace function sop_task_current_due_on(
  p_cadence_type text,
  p_cadence_day_of_week smallint,
  p_cadence_day_of_month smallint,
  p_reference_month smallint,
  p_as_of date default current_date
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  dow int;
  candidate date;
  month_start date;
  days_in_month int;
  months_since_ref int;
begin
  if p_cadence_type = 'daily' then
    return p_as_of;
  end if;

  if p_cadence_type = 'weekly' then
    dow := extract(dow from p_as_of)::int;
    return p_as_of - (((dow - p_cadence_day_of_week) + 7) % 7);
  end if;

  if p_cadence_type = 'monthly' then
    month_start := date_trunc('month', p_as_of)::date;
    days_in_month := extract(day from (month_start + interval '1 month' - interval '1 day'))::int;
    candidate := month_start + (least(p_cadence_day_of_month, days_in_month) - 1) * interval '1 day';
    if candidate <= p_as_of then
      return candidate;
    end if;
    month_start := (month_start - interval '1 month')::date;
    days_in_month := extract(day from (month_start + interval '1 month' - interval '1 day'))::int;
    return month_start + (least(p_cadence_day_of_month, days_in_month) - 1) * interval '1 day';
  end if;

  -- quarterly
  month_start := date_trunc('month', p_as_of)::date;
  months_since_ref := (extract(month from month_start)::int - p_reference_month + 12) % 3;
  month_start := (month_start - (months_since_ref || ' months')::interval)::date;
  days_in_month := extract(day from (month_start + interval '1 month' - interval '1 day'))::int;
  candidate := month_start + (least(p_cadence_day_of_month, days_in_month) - 1) * interval '1 day';
  if candidate <= p_as_of then
    return candidate;
  end if;
  month_start := (month_start - interval '3 months')::date;
  days_in_month := extract(day from (month_start + interval '1 month' - interval '1 day'))::int;
  return month_start + (least(p_cadence_day_of_month, days_in_month) - 1) * interval '1 day';
end;
$$;

-- ---- Task completions (append-only) ----------------------------------------
--
-- One row per time a task is actually ticked. room_id, workspace_id, due_on,
-- completed_at and completed_by are all server-stamped from the referenced
-- task — never trusted from client input, same reasoning as every other
-- audit field in this schema. due_on is the *computed* occurrence date, not
-- necessarily today — a task can be ticked late.
create table sop_task_completions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references rooms(id),
  task_id uuid not null references sop_tasks(id),
  due_on date not null,
  completed_at timestamptz not null,
  completed_by uuid not null references auth.users(id),
  is_late boolean not null
);

create index sop_task_completions_workspace_room_due_idx on sop_task_completions (workspace_id, room_id, due_on);
create index sop_task_completions_task_due_idx on sop_task_completions (task_id, due_on);

create or replace function set_sop_task_completion_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = new.task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', new.task_id using errcode = 'P0002';
  end if;

  new.room_id := t.room_id;
  new.workspace_id := t.workspace_id;
  new.due_on := sop_task_current_due_on(
    t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month,
    extract(month from t.created_at)::smallint
  );
  new.completed_at := now();
  new.completed_by := auth.uid();
  new.is_late := new.due_on < new.completed_at::date;
  return new;
end;
$$;

create trigger sop_task_completions_set_fields
  before insert on sop_task_completions
  for each row execute function set_sop_task_completion_fields();

-- ---- Room inspections (append-only, optional, non-blocking) ---------------
--
-- Mom's spot-check. One row per room per day, at most. Never mandatory —
-- "Pending Inspection" is a soft status, decided 2026-08-23.
create table room_inspections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references rooms(id),
  inspected_on date not null,
  inspected_at timestamptz not null,
  inspected_by uuid not null references auth.users(id),
  unique (room_id, inspected_on)
);

create index room_inspections_workspace_room_idx on room_inspections (workspace_id, room_id, inspected_on);

create or replace function set_room_inspection_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select workspace_id into new.workspace_id from rooms where id = new.room_id;
  new.inspected_on := current_date;
  new.inspected_at := now();
  new.inspected_by := auth.uid();
  return new;
end;
$$;

create trigger room_inspections_set_fields
  before insert on room_inspections
  for each row execute function set_room_inspection_fields();

-- ============================================================================
-- 2. Workforce (the operational roster — separate from workspace_memberships,
--    since not everyone on the roster signs into NIVA)
-- ============================================================================

create table workforce_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  membership_id uuid references workspace_memberships(id),
  name text not null,
  crew_role text not null check (crew_role in ('housekeeper', 'gardener', 'maintenance', 'other')),
  is_active boolean not null default true,
  recurring_payment_id uuid references recurring_payments(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index workforce_members_workspace_active_idx on workforce_members (workspace_id, is_active);
create unique index workforce_members_membership_idx on workforce_members (membership_id) where membership_id is not null;

create trigger workforce_members_set_audit_fields before insert or update on workforce_members
  for each row execute function set_audit_fields();

-- Explicit dates, not a recurring weekly pattern (decided 2026-08-23: days
-- off are set week by week, no default to maintain). No reason/type field —
-- flagging why someone was off was explicitly ruled out for this version.
create table workforce_days_off (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workforce_member_id uuid not null references workforce_members(id),
  day_off date not null,
  -- Unused in Release 1 — kept so a future per-hour tracking feature (a
  -- possible ask from later customers) doesn't need a schema change.
  hours_worked numeric(4, 1),
  unique (workforce_member_id, day_off)
);

create index workforce_days_off_member_idx on workforce_days_off (workforce_member_id, day_off);

-- Who owes which room, per day. Only manual overrides are stored here — the
-- default round-robin (active Housekeepers not off today, distributed by
-- index across today's due rooms) is deterministic and computed client-side
-- from workforce_members ordered by created_at, so most days generate zero
-- rows in this table.
create table room_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references rooms(id),
  assigned_on date not null,
  workforce_member_id uuid not null references workforce_members(id),
  unique (room_id, assigned_on)
);

create index room_assignments_workspace_date_idx on room_assignments (workspace_id, assigned_on);

-- ============================================================================
-- 3. Staff nav visibility (docs §10) — built now that there's a feature to
--    gate. null/empty means "see everything permitted by role" (today's
--    behavior for every existing member — no migration-day impact).
-- ============================================================================

alter table workspace_memberships add column visible_areas text[];

-- ============================================================================
-- 4. Reporting functions (docs §8) — same is_workspace_member guard and
--    authenticated-only grant as the Phase 4 functions (0007).
-- ============================================================================

create or replace function public.housekeeping_completion_summary(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  report_date date,
  tasks_due bigint,
  tasks_completed bigint,
  tasks_on_time bigint,
  tasks_late bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(p_period_start, p_period_end, interval '1 day')::date as d
  ),
  due_per_day as (
    select days.d as report_date, count(*) as tasks_due
    from days
    join sop_tasks t on t.workspace_id = p_workspace_id and t.is_active
    where sop_task_current_due_on(
      t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month,
      extract(month from t.created_at)::smallint, days.d
    ) = days.d
    group by days.d
  ),
  completed_per_day as (
    select due_on as report_date,
      count(*) as tasks_completed,
      count(*) filter (where not is_late) as tasks_on_time,
      count(*) filter (where is_late) as tasks_late
    from sop_task_completions
    where workspace_id = p_workspace_id
      and due_on between p_period_start and p_period_end
    group by due_on
  )
  select
    days.d as report_date,
    coalesce(due_per_day.tasks_due, 0) as tasks_due,
    coalesce(completed_per_day.tasks_completed, 0) as tasks_completed,
    coalesce(completed_per_day.tasks_on_time, 0) as tasks_on_time,
    coalesce(completed_per_day.tasks_late, 0) as tasks_late
  from days
  left join due_per_day on due_per_day.report_date = days.d
  left join completed_per_day on completed_per_day.report_date = days.d
  where is_workspace_member(p_workspace_id)
  order by days.d
$$;

-- Rooms currently overdue (a due occurrence with no completion row yet).
-- Deliberately has no per-person breakdown — this isn't meant to be a staff
-- performance metric (docs §11).
create or replace function public.housekeeping_attention_rooms(p_workspace_id uuid)
returns table (
  room_id uuid,
  room_name text,
  tasks_overdue bigint,
  last_completed_at timestamptz,
  last_inspected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with active_tasks as (
    select t.id, t.room_id, t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month, t.created_at
    from sop_tasks t
    join rooms r on r.id = t.room_id
    where t.workspace_id = p_workspace_id and t.is_active and r.is_active
  ),
  due_today as (
    select id as task_id, room_id,
      sop_task_current_due_on(cadence_type, cadence_day_of_week, cadence_day_of_month, extract(month from created_at)::smallint) as due_on
    from active_tasks
  ),
  overdue as (
    select d.room_id, count(*) as tasks_overdue
    from due_today d
    where d.due_on < current_date
      and not exists (
        select 1 from sop_task_completions c
        where c.task_id = d.task_id and c.due_on = d.due_on
      )
    group by d.room_id
  ),
  last_completion as (
    select room_id, max(completed_at) as last_completed_at
    from sop_task_completions
    where workspace_id = p_workspace_id
    group by room_id
  ),
  last_inspection as (
    select room_id, max(inspected_at) as last_inspected_at
    from room_inspections
    where workspace_id = p_workspace_id
    group by room_id
  )
  select
    r.id as room_id,
    r.name as room_name,
    overdue.tasks_overdue,
    last_completion.last_completed_at,
    last_inspection.last_inspected_at
  from rooms r
  join overdue on overdue.room_id = r.id
  left join last_completion on last_completion.room_id = r.id
  left join last_inspection on last_inspection.room_id = r.id
  where is_workspace_member(p_workspace_id)
    and r.workspace_id = p_workspace_id
    and r.is_active
  order by overdue.tasks_overdue desc
$$;

-- One row per (room, task) with its current occurrence's due date and
-- done/not-done state, already joined against today's completion and
-- inspection rows. Keeps the cadence math in one place (this file) instead
-- of duplicating sop_task_current_due_on's logic in the client — the Today
-- / Today's schedule screens read this directly rather than fetching raw
-- tasks + completions and recomputing "is this due" in TypeScript.
create or replace function public.housekeeping_today_checklist(
  p_workspace_id uuid,
  p_as_of date default current_date
)
returns table (
  room_id uuid,
  room_name text,
  room_type text,
  linked_to_bookings boolean,
  task_id uuid,
  task_name text,
  cadence_type text,
  due_on date,
  is_done boolean,
  completed_by uuid,
  completed_at timestamptz,
  inspected_by uuid,
  inspected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select t.id as task_id, t.name as task_name, t.cadence_type,
      sop_task_current_due_on(t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month, extract(month from t.created_at)::smallint, p_as_of) as due_on,
      r.id as room_id, r.name as room_name, r.room_type, r.linked_to_bookings
    from sop_tasks t
    join rooms r on r.id = t.room_id
    where t.workspace_id = p_workspace_id and t.is_active and r.is_active and r.workspace_id = p_workspace_id
  )
  select
    a.room_id, a.room_name, a.room_type, a.linked_to_bookings,
    a.task_id, a.task_name, a.cadence_type, a.due_on,
    (c.id is not null) as is_done,
    c.completed_by, c.completed_at,
    ri.inspected_by, ri.inspected_at
  from active a
  left join sop_task_completions c on c.task_id = a.task_id and c.due_on = a.due_on
  left join room_inspections ri on ri.room_id = a.room_id and ri.inspected_on = p_as_of
  where is_workspace_member(p_workspace_id)
  order by a.room_name, a.task_name
$$;

revoke execute on function public.housekeeping_completion_summary(uuid, date, date) from public, anon;
revoke execute on function public.housekeeping_attention_rooms(uuid) from public, anon;
revoke execute on function public.housekeeping_today_checklist(uuid, date) from public, anon;
grant execute on function public.housekeeping_completion_summary(uuid, date, date) to authenticated;
grant execute on function public.housekeeping_attention_rooms(uuid) to authenticated;
grant execute on function public.housekeeping_today_checklist(uuid, date) to authenticated;

-- ============================================================================
-- 5. Row Level Security (docs §6)
-- ============================================================================

alter table rooms enable row level security;
alter table sop_tasks enable row level security;
alter table sop_task_completions enable row level security;
alter table room_inspections enable row level security;
alter table workforce_members enable row level security;
alter table workforce_days_off enable row level security;
alter table room_assignments enable row level security;

-- rooms, sop_tasks: any member reads; administrator writes (archive via
-- is_active is the intended UI path; hard delete is blocked at the FK level
-- if referenced by completions/assignments, same defence-in-depth as every
-- other configuration table).
do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'sop_tasks']
  loop
    execute format('create policy %I_select on %I for select to authenticated using (is_workspace_member(workspace_id));', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (current_role_in_workspace(workspace_id) = ''administrator'');', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (current_role_in_workspace(workspace_id) = ''administrator'');', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (current_role_in_workspace(workspace_id) = ''administrator'');', t, t);
  end loop;
end $$;

-- sop_task_completions: any member reads; administrator/manager/staff
-- insert (ticking a task is day-to-day operational work, same allow-list as
-- transactions); no update policy at all (append-only); delete (un-tick) is
-- either your own same-day row, or an administrator/manager correcting
-- anyone's.
create policy sop_task_completions_select on sop_task_completions
  for select to authenticated using (is_workspace_member(workspace_id));

create policy sop_task_completions_insert on sop_task_completions
  for insert to authenticated with check (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager', 'staff')
  );

create policy sop_task_completions_delete on sop_task_completions
  for delete to authenticated using (
    (completed_by = (select auth.uid()) and completed_at::date = current_date)
    or current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

-- room_inspections: any member reads; administrator/manager insert/delete
-- (matches the earlier design call — inspection is a manager-level action,
-- not something staff do to their own work).
create policy room_inspections_select on room_inspections
  for select to authenticated using (is_workspace_member(workspace_id));

create policy room_inspections_insert on room_inspections
  for insert to authenticated with check (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

create policy room_inspections_delete on room_inspections
  for delete to authenticated using (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

-- workforce_members, workforce_days_off, room_assignments: any member
-- reads — Jane's own Today view needs to read the roster and today's
-- assignments to know which rooms are hers, same as she can already read
-- rooms/sop_tasks/sop_task_completions. Writing (adding/editing roster
-- entries, setting days off, reassigning a room) stays administrator/
-- manager only — this is HR/scheduling territory. (Note: this is a
-- correction from the read/write split first drafted in
-- 07-domain-model-and-schema.md §6, which scoped SELECT the same as write —
-- that would have broken Jane's own Today view, so §6 is being updated to
-- match this.)
do $$
declare
  t text;
begin
  foreach t in array array['workforce_members', 'workforce_days_off', 'room_assignments']
  loop
    execute format('create policy %I_select on %I for select to authenticated using (is_workspace_member(workspace_id));', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (current_role_in_workspace(workspace_id) in (''administrator'', ''manager''));', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (current_role_in_workspace(workspace_id) in (''administrator'', ''manager''));', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (current_role_in_workspace(workspace_id) in (''administrator'', ''manager''));', t, t);
  end loop;
end $$;
