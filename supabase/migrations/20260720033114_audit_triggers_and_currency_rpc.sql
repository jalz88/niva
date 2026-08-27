-- Phase 2: audit fields are now stamped server-side from auth.uid() rather
-- than trusted from client input on insert — the client composables no
-- longer send created_by/updated_by at all. Also adds an atomic RPC for
-- swapping a workspace's default currency (the partial unique index on
-- workspace_currencies means "set a new default" is a two-row change that
-- needs to happen together).

create or replace function set_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

drop trigger if exists properties_set_updated_at on properties;
drop trigger if exists platforms_set_updated_at on platforms;
drop trigger if exists payment_methods_set_updated_at on payment_methods;
drop trigger if exists suppliers_set_updated_at on suppliers;
drop trigger if exists categories_set_updated_at on categories;

create trigger properties_set_audit_fields before insert or update on properties
  for each row execute function set_audit_fields();
create trigger platforms_set_audit_fields before insert or update on platforms
  for each row execute function set_audit_fields();
create trigger payment_methods_set_audit_fields before insert or update on payment_methods
  for each row execute function set_audit_fields();
create trigger suppliers_set_audit_fields before insert or update on suppliers
  for each row execute function set_audit_fields();
create trigger categories_set_audit_fields before insert or update on categories
  for each row execute function set_audit_fields();

-- Extend the transaction integrity trigger (0001) to also stamp audit
-- fields, so the client no longer needs to supply created_by there either.
create or replace function check_transaction_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  category_type text;
  currency_enabled boolean;
begin
  select type into category_type from categories where id = new.category_id;
  if category_type is distinct from new.type then
    raise exception 'category_type_mismatch: category % is type %, transaction is type %',
      new.category_id, category_type, new.type
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

-- Atomic default-currency swap. SECURITY DEFINER because it needs to
-- update two rows as one unit; the administrator check inside replaces
-- what RLS would otherwise enforce per-statement.
create or replace function set_default_workspace_currency(target_workspace uuid, target_currency text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_role_in_workspace(target_workspace) is distinct from 'administrator' then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update workspace_currencies set is_default = false
  where workspace_id = target_workspace and is_default;

  update workspace_currencies set is_default = true, is_active = true
  where workspace_id = target_workspace and currency_code = target_currency;

  if not found then
    insert into workspace_currencies (workspace_id, currency_code, is_active, is_default)
    values (target_workspace, target_currency, true, true);
  end if;
end;
$$;

revoke execute on function set_default_workspace_currency(uuid, text) from public, anon;
grant execute on function set_default_workspace_currency(uuid, text) to authenticated;
