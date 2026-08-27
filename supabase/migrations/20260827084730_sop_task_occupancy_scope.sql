-- Booking-linked checklist (decided 2026-08-27 with Jalie and Maria, mocked in
-- docs/housekeeping-booking-linked-checklist-mockup.html): the deferred half
-- of the Model A request (migration 0015) — hold the checklist against the
-- booking calendar so it shrinks itself automatically, on top of the existing
-- manual skip/add flexibility rather than replacing it.

-- 1. Per-task occupancy scope, alongside cadence_type. 'always' preserves
--    today's behavior exactly (every existing task defaults to it). 'occupied'
--    covers both checkout and stayover days (a guest is physically present).
--    'checkout_only' is the heavy turnover-specific work that only makes
--    sense the day a guest actually leaves.
alter table public.sop_tasks
  add column occupancy_scope text not null default 'always'
    check (occupancy_scope in ('always', 'occupied', 'checkout_only'));

-- 2. Append-only override log: a row here means an administrator/manager
--    deliberately pulled an occupancy-hidden task back into a specific day's
--    list, mirroring sop_task_skips' shape but for the opposite direction
--    (force-include rather than force-exclude). RPC-only writes, same
--    reasoning as sop_task_skips — staff can see the effect but never
--    creates/removes one directly.
create table public.sop_task_occupancy_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  room_id uuid not null references public.rooms(id),
  task_id uuid not null references public.sop_tasks(id),
  due_on date not null,
  included_by uuid not null references auth.users(id),
  included_at timestamptz not null default now(),
  unique (task_id, due_on)
);

alter table public.sop_task_occupancy_overrides enable row level security;

create policy "sop_task_occupancy_overrides_select"
  on public.sop_task_occupancy_overrides for select
  using (is_workspace_member(workspace_id));

-- 3. housekeeping_today_checklist gains three columns: the task's own
--    occupancy_scope (so the client can label a hidden task), whether that
--    scope actually excludes it today given the room's booking status
--    (occupancy_excluded), and whether an override already pulled it back in
--    (is_force_included). Every existing task defaults to occupancy_scope
--    'always', so occupancy_excluded is false for the entire existing
--    checklist until an admin deliberately narrows a task — no behavior
--    change on upgrade.
drop function if exists public.housekeeping_today_checklist(uuid, date);

create function public.housekeeping_today_checklist(p_workspace_id uuid, p_as_of date default current_date)
returns table(
  room_id uuid, room_name text, room_name_si text, room_type text, linked_to_bookings boolean,
  task_id uuid, task_name text, task_name_si text, cadence_type text, due_on date,
  is_done boolean, is_skipped boolean, completed_by uuid, completed_at timestamptz,
  inspected_by uuid, inspected_at timestamptz,
  occupancy_scope text, occupancy_excluded boolean, is_force_included boolean
)
language sql stable security definer set search_path to 'public' as $$
  with booking as (
    -- At most one booking covers a given room/day in practice (the sync
    -- deletes-and-reinserts a room's full booking set, no overlap expected).
    -- 'checkout' the day a guest leaves, 'stayover' any other day they're in.
    select room_id, case when ends_on = p_as_of then 'checkout' else 'stayover' end as status
    from room_bookings
    where workspace_id = p_workspace_id and starts_on <= p_as_of and ends_on >= p_as_of
  ),
  active as (
    select t.id as task_id, t.name as task_name, t.name_si as task_name_si, t.cadence_type, t.occupancy_scope,
      sop_task_current_due_on(t.cadence_type, t.cadence_day_of_week, t.cadence_day_of_month, extract(month from t.created_at)::smallint, p_as_of, t.once_on) as due_on,
      r.id as room_id, r.name as room_name, r.name_si as room_name_si, r.room_type, r.linked_to_bookings,
      case
        when t.occupancy_scope = 'always' then false
        when t.occupancy_scope = 'occupied' then coalesce(b.status, 'vacant') = 'vacant'
        when t.occupancy_scope = 'checkout_only' then coalesce(b.status, 'vacant') <> 'checkout'
        else false
      end as occupancy_excluded
    from sop_tasks t
    join rooms r on r.id = t.room_id
    left join booking b on b.room_id = r.id
    where t.workspace_id = p_workspace_id and t.is_active and r.is_active and r.workspace_id = p_workspace_id
      and (t.cadence_type <> 'once' or t.once_on = p_as_of)
  )
  select
    a.room_id, a.room_name, a.room_name_si, a.room_type, a.linked_to_bookings,
    a.task_id, a.task_name, a.task_name_si, a.cadence_type, a.due_on,
    (c.id is not null) as is_done,
    (s.id is not null) as is_skipped,
    c.completed_by, c.completed_at,
    ri.inspected_by, ri.inspected_at,
    a.occupancy_scope, a.occupancy_excluded, (o.id is not null) as is_force_included
  from active a
  left join sop_task_completions c on c.task_id = a.task_id and c.due_on = a.due_on
  left join sop_task_skips s on s.task_id = a.task_id and s.due_on = a.due_on
  left join room_inspections ri on ri.room_id = a.room_id and ri.inspected_on = p_as_of
  left join sop_task_occupancy_overrides o on o.task_id = a.task_id and o.due_on = a.due_on
  where is_workspace_member(p_workspace_id)
  order by a.room_name, a.task_name
$$;

revoke all on function public.housekeeping_today_checklist(uuid, date) from public;
grant execute on function public.housekeeping_today_checklist(uuid, date) to authenticated;

-- 4. Include/uninclude RPCs — same administrator/manager-only SECURITY
--    DEFINER pattern as sop_task_skip_today/sop_task_unskip_today, since
--    sop_task_occupancy_overrides has no direct client write policy.
create function public.sop_task_include_today(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if current_role_in_workspace(t.workspace_id) not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can include a task' using errcode = '42501';
  end if;

  insert into sop_task_occupancy_overrides (workspace_id, room_id, task_id, due_on, included_by)
  values (t.workspace_id, t.room_id, p_task_id, p_due_on, auth.uid())
  on conflict (task_id, due_on) do nothing;
end;
$$;

create function public.sop_task_uninclude_today(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if current_role_in_workspace(t.workspace_id) not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can remove an inclusion' using errcode = '42501';
  end if;

  delete from sop_task_occupancy_overrides where task_id = p_task_id and due_on = p_due_on;
end;
$$;

revoke all on function public.sop_task_include_today(uuid, date) from public;
revoke all on function public.sop_task_uninclude_today(uuid, date) from public;
grant execute on function public.sop_task_include_today(uuid, date) to authenticated;
grant execute on function public.sop_task_uninclude_today(uuid, date) to authenticated;
