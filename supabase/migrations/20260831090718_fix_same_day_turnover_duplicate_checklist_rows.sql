-- Real bug found 2026-08-31 while investigating Jalie's "check-in shows as
-- stayover" report: the `booking` CTE in housekeeping_today_checklist
-- assumed "at most one booking covers a given room/day in practice" (its
-- own old comment), but a same-day turnover -- one guest's booking ending
-- today, a different guest's booking starting today, same room -- is a
-- completely normal BnB scenario where TWO room_bookings rows both cover
-- today for the same room. With no aggregation, that produced two rows in
-- the `booking` CTE for that room_id, which then fanned out through
-- `left join booking b on b.room_id = r.id` in the `active` CTE and
-- duplicated every one of that room's tasks in the checklist on turnover
-- days. Fixed by grouping to one row per room, with 'checkout' winning
-- whenever any booking on that room ends today -- a turnover day needs the
-- same full-cleaning treatment as a plain checkout day for occupancy_scope
-- purposes, so this doesn't change filtering behavior, just removes the
-- duplication hazard. (The client's own check-in/checkout badge display in
-- TodayView.vue is a separate code path, fixed separately in the same
-- session, and already correctly shows both badges on a turnover day.)
create or replace function public.housekeeping_today_checklist(p_workspace_id uuid, p_as_of date default current_date)
returns table(
  room_id uuid, room_name text, room_name_si text, room_type text, linked_to_bookings boolean,
  task_id uuid, task_name text, task_name_si text, cadence_type text, due_on date,
  is_done boolean, is_skipped boolean, completed_by uuid, completed_at timestamptz,
  inspected_by uuid, inspected_at timestamptz,
  occupancy_scope text, occupancy_excluded boolean, is_force_included boolean
)
language sql stable security definer set search_path to 'public' as $$
  with booking as (
    -- One row per room, even when two bookings (outgoing + incoming guest)
    -- both cover today for the same room. 'checkout' wins whenever any of
    -- them ends today, since that's the superset cleaning requirement.
    select room_id, case when bool_or(ends_on = p_as_of) then 'checkout' else 'stayover' end as status
    from room_bookings
    where workspace_id = p_workspace_id and starts_on <= p_as_of and ends_on >= p_as_of
    group by room_id
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
