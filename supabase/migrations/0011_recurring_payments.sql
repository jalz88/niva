-- Recurring payments — docs/12-ux-options-review.md Part 2/B2, decided
-- 2026-08-19 (renamed from "Recurring bills" once the second real use case
-- came up: not just bills like Wifi/Electricity, but staff wages paid on a
-- standing bank order, e.g. weekly to a housekeeper). A recurring payment
-- is a reminder to log something that already happens on a schedule — NIVA
-- never initiates or moves money itself; "Mark paid" just creates the real
-- transaction and advances the schedule. Manager/administrator only: staff
-- and viewer get no policy on this table at all, so it's invisible to them
-- rather than merely read-only.

create table recurring_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  property_id uuid not null references properties(id),
  -- Short free-text label ("Wifi", "Electricity", "Maria — wages") — kept
  -- separate from category because two payments can share one category
  -- (e.g. two rental units' electricity, or two staff members' wages)
  -- and would otherwise be indistinguishable in the list.
  name text not null,
  category_id uuid not null references categories(id),
  payment_method_id uuid not null references payment_methods(id),
  currency_code text not null references iso_currencies(code),
  -- The expected/default amount — editable at Mark-paid time for a month
  -- that genuinely differs (a variable utility bill, an overtime week),
  -- so this is a starting point, not a locked figure.
  amount numeric(14, 2) not null check (amount > 0),
  cadence_type text not null check (cadence_type in ('monthly', 'weekly')),
  cadence_day_of_month smallint check (cadence_day_of_month between 1 and 31),
  -- 0 = Sunday .. 6 = Saturday, matching JS Date#getDay() so the client
  -- never has to remap an index.
  cadence_day_of_week smallint check (cadence_day_of_week between 0 and 6),
  next_due_on date not null,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint recurring_payments_cadence_fields check (
    (cadence_type = 'monthly' and cadence_day_of_month is not null and cadence_day_of_week is null)
    or
    (cadence_type = 'weekly' and cadence_day_of_week is not null and cadence_day_of_month is null)
  )
);

create index recurring_payments_workspace_due_idx on recurring_payments (workspace_id, next_due_on);

-- Traceability only — deleting a recurring payment (the prototype's
-- "Delete this payment") never touches transactions already logged from
-- it, so this is ON DELETE SET NULL rather than cascading or restricting.
alter table transactions
  add column recurring_payment_id uuid references recurring_payments(id) on delete set null;

create index transactions_recurring_payment_idx on transactions (recurring_payment_id)
  where recurring_payment_id is not null;

-- ---- Data integrity, same shape as check_transaction_integrity() -------

create function check_recurring_payment_integrity()
returns trigger
language plpgsql
as $$
declare
  category_type text;
  currency_enabled boolean;
begin
  select type into category_type from categories where id = new.category_id;
  if category_type is distinct from 'expense' then
    raise exception 'category_must_be_expense: recurring payments never use an income category (% is %)',
      new.category_id, category_type
      using errcode = '23514';
  end if;

  select exists (
    select 1 from workspace_currencies
    where workspace_id = new.workspace_id
      and currency_code = new.currency_code
      and is_active
  ) into currency_enabled;

  if not currency_enabled then
    raise exception 'currency_not_enabled: % is not enabled for workspace %',
      new.currency_code, new.workspace_id
      using errcode = '23514';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger recurring_payments_check_integrity
  before insert or update on recurring_payments
  for each row execute function check_recurring_payment_integrity();

-- ---- Mark paid: atomically log the transaction and advance the schedule ---
--
-- Advances next_due_on from the *scheduled* date, not the date actually
-- paid — so a payment logged a few days early or late doesn't drift the
-- whole future schedule. Monthly cadence clamps to the last day of the
-- target month when cadence_day_of_month doesn't exist there (e.g. day 31
-- into a 30-day month), the same way a calendar app would.
create or replace function mark_recurring_payment_paid(
  p_recurring_payment_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  if current_role_in_workspace(rp.workspace_id) not in ('administrator', 'manager') then
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

revoke execute on function mark_recurring_payment_paid(uuid, numeric, date, text) from public, anon;
grant execute on function mark_recurring_payment_paid(uuid, numeric, date, text) to authenticated;

-- ============================================================================
-- Row Level Security — manager/administrator only, no policy for staff or
-- viewer at all (they don't get read-only access either; the row set is
-- invisible to them, matching "needs to be shown only to managers and
-- admin").
-- ============================================================================

alter table recurring_payments enable row level security;

create policy recurring_payments_select on recurring_payments
  for select to authenticated using (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

create policy recurring_payments_insert on recurring_payments
  for insert to authenticated with check (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

create policy recurring_payments_update on recurring_payments
  for update to authenticated using (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

create policy recurring_payments_delete on recurring_payments
  for delete to authenticated using (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );
