-- Optional Sinhala name for rooms and SOP tasks (2026-08-26).
--
-- The Housekeeping/Staff module got a Sinhala UI toggle (src/i18n/), but
-- room and task *names* are free text an administrator types in — there's
-- nothing to auto-translate there, since it's data, not a fixed UI string.
-- Jalie's call: add a second, optional name field per room/task rather than
-- forcing a single name into one language or the other. `name` (English, or
-- whatever was already typed) stays required and is always the fallback;
-- `name_si` is nullable and only shown when it's set and the viewer's
-- locale is Sinhala.

alter table rooms add column name_si text;
alter table sop_tasks add column name_si text;

-- Re-published to also select the new column — same body otherwise as
-- migration 0012's version, so the Today/Today's schedule screens can pick
-- room_name_si/task_name_si over room_name/task_name per the client's
-- locale without a second round trip. The returned column set changed
-- (two new columns inserted mid-row), which Postgres won't allow via
-- create-or-replace on a function with OUT-parameter row typing — drop
-- and recreate.
drop function if exists public.housekeeping_today_checklist(uuid, date);
create function public.housekeeping_today_checklist(
  p_workspace_id uuid,
  p_as_of date default current_date
)
returns table (
  room_id uuid,
  room_name text,
  room_name_si text,
  room_type text,
  linked_to_bookings boolean,
  task_id uuid,
  task_name text,
  task_name_si text,
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
    select t.id as task_id, t.name as task_name, t.name_si as task_name_si, t.cadence_type,
      sop_task_current_due_on(t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month, extract(month from t.created_at)::smallint, p_as_of) as due_on,
      r.id as room_id, r.name as room_name, r.name_si as room_name_si, r.room_type, r.linked_to_bookings
    from sop_tasks t
    join rooms r on r.id = t.room_id
    where t.workspace_id = p_workspace_id and t.is_active and r.is_active and r.workspace_id = p_workspace_id
  )
  select
    a.room_id, a.room_name, a.room_name_si, a.room_type, a.linked_to_bookings,
    a.task_id, a.task_name, a.task_name_si, a.cadence_type, a.due_on,
    (c.id is not null) as is_done,
    c.completed_by, c.completed_at,
    ri.inspected_by, ri.inspected_at
  from active a
  left join sop_task_completions c on c.task_id = a.task_id and c.due_on = a.due_on
  left join room_inspections ri on ri.room_id = a.room_id and ri.inspected_on = p_as_of
  where is_workspace_member(p_workspace_id)
  order by a.room_name, a.task_name
$$;

revoke execute on function public.housekeeping_today_checklist(uuid, date) from public, anon;
grant execute on function public.housekeeping_today_checklist(uuid, date) to authenticated;
