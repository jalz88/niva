-- Web Push notifications (roadmap post-release item 8, docs/12-ux-options-review.md C.5).
--
-- Three pieces:
--   1. push_subscriptions — one row per (device) browser push endpoint, owned by a
--      user. Written ONLY through register/unregister RPCs below (never directly),
--      because a shared device can be signed into by different people over time and
--      the same endpoint must then move to the new owner, which plain RLS can't do.
--   2. push_preferences — per-person opt-in per category (payments, housekeeping).
--      No row = both on (the person already opted in by enabling push on a device).
--   3. A service-role-only "daily digest" function the send-push Edge Function calls
--      each morning, built on housekeeping_today_checklist_core (the existing
--      checklist logic, split out so a scheduled job with no signed-in user can reuse
--      it instead of duplicating it).

-- ---- 1. Subscriptions --------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index push_subscriptions_workspace_id_idx on public.push_subscriptions (workspace_id);

alter table public.push_subscriptions enable row level security;

-- Own rows only, read-only from the client (so Account can tell whether *this*
-- device is subscribed). The p256dh/auth keys are only ever visible to their owner.
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- Register (or take over) a device endpoint for the calling user.
create or replace function public.register_push_subscription(
  p_workspace_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Null-safe guard (the 2026-08-27 lesson): current_role_in_workspace() is NULL
  -- for a non-member, and `if NULL then` silently skips the raise.
  if coalesce(current_role_in_workspace(p_workspace_id), '') = '' then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if coalesce(trim(p_endpoint), '') = '' or coalesce(trim(p_p256dh), '') = '' or coalesce(trim(p_auth), '') = '' then
    raise exception 'validation: endpoint and keys are required' using errcode = '23514';
  end if;

  insert into push_subscriptions (user_id, workspace_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_workspace_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        workspace_id = excluded.workspace_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

revoke execute on function public.register_push_subscription(uuid, text, text, text, text) from public, anon;
revoke execute on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.register_push_subscription(uuid, text, text, text, text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- ---- 2. Preferences ------------------------------------------------------------

create table public.push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payments_enabled boolean not null default true,
  housekeeping_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.push_preferences enable row level security;

create policy push_preferences_select on public.push_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_preferences_insert on public.push_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_preferences_update on public.push_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.push_preferences from anon;

-- ---- 3. Checklist core + daily digest -------------------------------------------

-- The body of housekeeping_today_checklist, unchanged, minus the
-- is_workspace_member() gate (a scheduled job has no auth.uid()). Not callable
-- by clients — only the public wrapper below (which keeps the gate) and the
-- service role can reach it.
create or replace function public.housekeeping_today_checklist_core(p_workspace_id uuid, p_as_of date default current_date)
returns table(
  room_id uuid, room_name text, room_name_si text, room_type text, linked_to_bookings boolean,
  task_id uuid, task_name text, task_name_si text, cadence_type text, due_on date,
  is_done boolean, is_skipped boolean, completed_by uuid, completed_at timestamptz,
  inspected_by uuid, inspected_at timestamptz,
  occupancy_scope text, occupancy_excluded boolean, is_force_included boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with booking as (
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
  order by a.room_name, a.task_name
$function$;

revoke execute on function public.housekeeping_today_checklist_core(uuid, date) from public, anon, authenticated;
grant execute on function public.housekeeping_today_checklist_core(uuid, date) to service_role;

-- Same signature, same columns, same ordering, same is_workspace_member() gate as
-- before — now just a thin wrapper over the core.
create or replace function public.housekeeping_today_checklist(p_workspace_id uuid, p_as_of date default current_date)
returns table(
  room_id uuid, room_name text, room_name_si text, room_type text, linked_to_bookings boolean,
  task_id uuid, task_name text, task_name_si text, cadence_type text, due_on date,
  is_done boolean, is_skipped boolean, completed_by uuid, completed_at timestamptz,
  inspected_by uuid, inspected_at timestamptz,
  occupancy_scope text, occupancy_excluded boolean, is_force_included boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select * from housekeeping_today_checklist_core(p_workspace_id, p_as_of)
  where is_workspace_member(p_workspace_id)
  order by room_name, task_name
$function$;

-- One row per workspace: what the morning push needs to say. Service role only.
create or replace function public.push_daily_digest(p_as_of date)
returns table(
  workspace_id uuid,
  payments_overdue int,
  payments_due_today int,
  rooms_to_clean int,
  checkouts_today int,
  tasks_open int
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    w.id as workspace_id,
    (select count(*)::int from recurring_payments rp where rp.workspace_id = w.id and rp.next_due_on < p_as_of) as payments_overdue,
    (select count(*)::int from recurring_payments rp where rp.workspace_id = w.id and rp.next_due_on = p_as_of) as payments_due_today,
    (select count(distinct c.room_id)::int
       from housekeeping_today_checklist_core(w.id, p_as_of) c
      where not c.is_done and not c.is_skipped and (not c.occupancy_excluded or c.is_force_included)) as rooms_to_clean,
    (select count(distinct b.room_id)::int
       from room_bookings b
       join rooms r on r.id = b.room_id and r.is_active
      where b.workspace_id = w.id and b.ends_on = p_as_of) as checkouts_today,
    (select count(*)::int
       from housekeeping_today_checklist_core(w.id, p_as_of) c
      where not c.is_done and not c.is_skipped and (not c.occupancy_excluded or c.is_force_included)) as tasks_open
  from workspaces w
$function$;

revoke execute on function public.push_daily_digest(date) from public, anon, authenticated;
grant execute on function public.push_daily_digest(date) to service_role;
