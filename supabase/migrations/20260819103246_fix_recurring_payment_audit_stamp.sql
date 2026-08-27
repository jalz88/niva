create or replace function check_recurring_payment_integrity()
returns trigger
language plpgsql
set search_path = public
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

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
  end if;

  new.updated_at := now();
  return new;
end;
$$;
