-- SECURITY FIX (white-hat audit, 2026-08-27): six SECURITY DEFINER functions
-- guarded access with `if current_role_in_workspace(x) not in ('administrator',
-- 'manager') then raise exception`. current_role_in_workspace() returns NULL
-- for a caller with no membership row in the target workspace (not just a
-- caller with a disallowed role) — and in PL/pgSQL, `IF <null-condition> THEN`
-- is treated as false, silently skipping the RAISE. This meant ANY
-- authenticated user, regardless of which workspace (if any) they actually
-- belonged to, could call these functions against someone else's
-- workspace_id/task_id/recurring_payment_id and have it succeed.
--
-- Confirmed live and reverted (no persisted rows) against this project: an
-- account whose only membership is in an unrelated E2E test workspace
-- successfully called sop_task_skip_today against a real task in the primary
-- workspace, and mark_recurring_payment_paid successfully inserted a real
-- transaction row into the primary workspace, both with zero role check
-- actually stopping them.
--
-- Fix: wrap the role lookup in coalesce(..., '') so a non-member's NULL role
-- becomes an empty string, which correctly fails the `not in (...)` check
-- and raises the exception. Mirrors the null-safe pattern already used
-- correctly in set_default_workspace_currency ("is distinct from").

create or replace function public.sop_task_skip_today(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if coalesce(current_role_in_workspace(t.workspace_id), '') not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can skip a task' using errcode = '42501';
  end if;

  insert into sop_task_skips (workspace_id, room_id, task_id, due_on, skipped_by)
  values (t.workspace_id, t.room_id, p_task_id, p_due_on, auth.uid())
  on conflict (task_id, due_on) do nothing;
end;
$$;

create or replace function public.sop_task_unskip_today(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if coalesce(current_role_in_workspace(t.workspace_id), '') not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can unskip a task' using errcode = '42501';
  end if;

  delete from sop_task_skips where task_id = p_task_id and due_on = p_due_on;
end;
$$;

create or replace function public.sop_task_add_for_today(p_room_id uuid, p_name text, p_name_si text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_workspace_id uuid;
  v_task_id uuid;
begin
  select workspace_id into v_workspace_id from rooms where id = p_room_id;
  if v_workspace_id is null then
    raise exception 'not_found: room % does not exist', p_room_id using errcode = 'P0002';
  end if;
  if coalesce(current_role_in_workspace(v_workspace_id), '') not in ('administrator', 'manager') then
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

create or replace function public.sop_task_include_today(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if coalesce(current_role_in_workspace(t.workspace_id), '') not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can include a task' using errcode = '42501';
  end if;

  insert into sop_task_occupancy_overrides (workspace_id, room_id, task_id, due_on, included_by)
  values (t.workspace_id, t.room_id, p_task_id, p_due_on, auth.uid())
  on conflict (task_id, due_on) do nothing;
end;
$$;

create or replace function public.sop_task_uninclude_today(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  t sop_tasks;
begin
  select * into t from sop_tasks where id = p_task_id;
  if not found then
    raise exception 'not_found: sop task % does not exist', p_task_id using errcode = 'P0002';
  end if;
  if coalesce(current_role_in_workspace(t.workspace_id), '') not in ('administrator', 'manager') then
    raise exception 'forbidden: only an administrator or manager can remove an inclusion' using errcode = '42501';
  end if;

  delete from sop_task_occupancy_overrides where task_id = p_task_id and due_on = p_due_on;
end;
$$;

create or replace function public.mark_recurring_payment_paid(p_recurring_payment_id uuid, p_amount numeric, p_occurred_on date, p_notes text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  rp recurring_payments;
  new_transaction_id uuid;
  next_month_start date;
  days_in_next_month int;
  new_next_due date;
begin
  select * into rp from recurring_payments where id = p_recurring_payment_id;
  if not found then
    raise exception 'not_found: recurring payment % does not exist', p_recurring_payment_id using errcode = 'P0002';
  end if;

  if coalesce(current_role_in_workspace(rp.workspace_id), '') not in ('administrator', 'manager') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  insert into transactions (
    workspace_id, property_id, type, category_id, payment_method_id,
    currency_code, amount, occurred_on, notes, created_by, recurring_payment_id
  ) values (
    rp.workspace_id, rp.property_id, 'expense', rp.category_id, rp.payment_method_id,
    rp.currency_code, p_amount, p_occurred_on, nullif(trim(p_notes), ''), auth.uid(), rp.id
  )
  returning id into new_transaction_id;

  if rp.cadence_type = 'weekly' then
    new_next_due := rp.next_due_on + interval '7 days';
  else
    next_month_start := date_trunc('month', rp.next_due_on) + interval '1 month';
    days_in_next_month := extract(day from (next_month_start + interval '1 month' - interval '1 day'));
    new_next_due := next_month_start + (least(rp.cadence_day_of_month, days_in_next_month) - 1) * interval '1 day';
  end if;

  update recurring_payments
  set next_due_on = new_next_due, updated_by = auth.uid(), updated_at = now()
  where id = p_recurring_payment_id;

  return new_transaction_id;
end;
$$;
