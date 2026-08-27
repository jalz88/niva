-- Model A: manager skip/add flexibility for the daily checklist.
-- Decided 2026-08-26 after mocking two models with Jalie/Maria
-- (docs/housekeeping-daily-task-flexibility-mockup.html) — Model A
-- (automatic cadence stays as-is; administrator/manager can skip a specific
-- task for just today, or add a one-off extra task for today) won over
-- requiring a daily confirm step for everything.

-- ---- 1. Extend sop_tasks for one-off ("added today") tasks -----------------
alter table sop_tasks add column once_on date;

alter table sop_tasks drop constraint sop_tasks_cadence_type_check;
alter table sop_tasks add constraint sop_tasks_cadence_type_check
  check (cadence_type in ('daily', 'weekly', 'monthly', 'quarterly', 'once'));

alter table sop_tasks drop constraint sop_tasks_cadence_fields;
alter table sop_tasks add constraint sop_tasks_cadence_fields check (
  (cadence_type = 'daily' and cadence_day_of_week is null and cadence_day_of_month is null and once_on is null)
  or (cadence_type = 'weekly' and cadence_day_of_week is not null and cadence_day_of_month is null and once_on is null)
  or (cadence_type in ('monthly', 'quarterly') and cadence_day_of_month is not null and cadence_day_of_week is null and once_on is null)
  or (cadence_type = 'once' and once_on is not null and cadence_day_of_week is null and cadence_day_of_month is null)
);

-- ---- 2. Skips (append-only, one row per skipped occurrence) ----------------
create table sop_task_skips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references rooms(id),
  task_id uuid not null references sop_tasks(id),
  due_on date not null,
  skipped_by uuid not null references auth.users(id),
  skipped_at timestamptz not null default now(),
  unique (task_id, due_on)
);

create index sop_task_skips_workspace_room_due_idx on sop_task_skips (workspace_id, room_id, due_on);

alter table sop_task_skips enable row level security;

-- Any workspace member can read (Jane's Today view needs to know a task is
-- skipped, same "any member reads" pattern as sop_task_completions). No
-- direct insert/update/delete policy at all — the only writers are the
-- SECURITY DEFINER functions below, which do their own administrator/manager
-- check, same pattern as mark_recurring_payment_paid (0011).
create policy sop_task_skips_select on sop_task_skips
  for select to authenticated using (is_workspace_member(workspace_id));

-- ---- 3. Occurrence math: 'once' is just its stored date --------------------
create or replace function sop_task_current_due_on(
  p_cadence_type text,
  p_cadence_day_of_week smallint,
  p_cadence_day_of_month smallint,
  p_reference_month smallint,
  p_as_of date default current_date,
  p_once_on date default null
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
  if p_cadence_type = 'once' then
    return p_once_on;
  end if;

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

-- ---- 4. Ripple the new p_once_on argument through every call site ----------
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
    extract(month from t.created_at)::smallint, current_date, t.once_on
  );
  new.completed_at := now();
  new.completed_by := auth.uid();
  new.is_late := new.due_on < new.completed_at::date;
  return new;
end;
$$;

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
      extract(month from t.created_at)::smallint, days.d, t.once_on
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
    select t.id, t.room_id, t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month, t.created_at, t.once_on
    from sop_tasks t
    join rooms r on r.id = t.room_id
    where t.workspace_id = p_workspace_id and t.is_active and r.is_active
  ),
  due_today as (
    select id as task_id, room_id,
      sop_task_current_due_on(cadence_type, cadence_day_of_week, cadence_day_of_month, extract(month from created_at)::smallint, current_date, once_on) as due_on
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

-- ---- 5. Today's checklist: add is_skipped, only show a 'once' task on its
--         own day (it's meant to vanish afterward, not linger like a real
--         recurring cadence would) --------------------------------------
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
  is_skipped boolean,
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
      sop_task_current_due_on(t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month, extract(month from t.created_at)::smallint, p_as_of, t.once_on) as due_on,
      r.id as room_id, r.name as room_name, r.name_si as room_name_si, r.room_type, r.linked_to_bookings
    from sop_tasks t
    join rooms r on r.id = t.room_id
    where t.workspace_id = p_workspace_id and t.is_active and r.is_active and r.workspace_id = p_workspace_id
      and (t.cadence_type <> 'once' or t.once_on = p_as_of)
  )
  select
    a.room_id, a.room_name, a.room_name_si, a.room_type, a.linked_to_bookings,
    a.task_id, a.task_name, a.task_name_si, a.cadence_type, a.due_on,
    (c.id is not null) as is_done,
    (s.id is not null) as is_skipped,
    c.completed_by, c.completed_at,
    ri.inspected_by, ri.inspected_at
  from active a
  left join sop_task_completions c on c.task_id = a.task_id and c.due_on = a.due_on
  left join sop_task_skips s on s.task_id = a.task_id and s.due_on = a.due_on
  left join room_inspections ri on ri.room_id = a.room_id and ri.inspected_on = p_as_of
  where is_workspace_member(p_workspace_id)
  order by a.room_name, a.task_name
$$;

revoke execute on function public.housekeeping_today_checklist(uuid, date) from public, anon;
grant execute on function public.housekeeping_today_checklist(uuid, date) to authenticated;

-- ---- 6. Manager actions: skip a task for today, add a one-off task --------
-- Both bypass sop_tasks/sop_task_skips' base RLS (administrator-only writes
-- on sop_tasks; no direct write policy at all on sop_task_skips) via their
-- own explicit administrator/manager check, same pattern as
-- mark_recurring_payment_paid (0011) — day-to-day checklist adjustments
-- shouldn't need the same access as editing the room/task structure itself.
create or replace function public.sop_task_skip_today(p_task_id uuid, p_due_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if current_role_in_workspace(t.workspace_id) not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can skip a task' using errcode = '42501';
  end if;

  insert into sop_task_skips (workspace_id, room_id, task_id, due_on, skipped_by)
  values (t.workspace_id, t.room_id, p_task_id, p_due_on, auth.uid())
  on conflict (task_id, due_on) do nothing;
end;
$$;

create or replace function public.sop_task_unskip_today(p_task_id uuid, p_due_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if current_role_in_workspace(t.workspace_id) not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can unskip a task' using errcode = '42501';
  end if;

  delete from sop_task_skips where task_id = p_task_id and due_on = p_due_on;
end;
$$;

create or replace function public.sop_task_add_for_today(
  p_room_id uuid,
  p_name text,
  p_name_si text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_task_id uuid;
begin
  select workspace_id into v_workspace_id from rooms where id = p_room_id;
  if v_workspace_id is null then
    raise exception 'not_found: room % does not exist', p_room_id using errcode = 'P0002';
  end if;
  if current_role_in_workspace(v_workspace_id) not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can add a task' using errcode = '42501';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'validation: task name is required' using errcode = '23514';
  end if;

  insert into sop_tasks (workspace_id, room_id, name, name_si, cadence_type, once_on)
  values (v_workspace_id, p_room_id, trim(p_name), nullif(trim(coalesce(p_name_si, '')), ''), 'once', current_date)
  returning id into v_task_id;

  return v_task_id;
end;
$$;

revoke execute on function public.sop_task_skip_today(uuid, date) from public, anon;
revoke execute on function public.sop_task_unskip_today(uuid, date) from public, anon;
revoke execute on function public.sop_task_add_for_today(uuid, text, text) from public, anon;
grant execute on function public.sop_task_skip_today(uuid, date) to authenticated;
grant execute on function public.sop_task_unskip_today(uuid, date) to authenticated;
grant execute on function public.sop_task_add_for_today(uuid, text, text) to authenticated;
