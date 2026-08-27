-- Fixes from get_advisors security lint after 0001_init:
-- 1. Pin search_path on every function (mutable search_path is a known
--    privilege-escalation vector for SECURITY DEFINER functions).
-- 2. Restrict the two SECURITY DEFINER helper functions to the
--    `authenticated` role only — anon has no legitimate reason to call
--    them directly via PostgREST RPC.

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

  new.updated_at = now();
  return new;
end;
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function current_role_in_workspace(uuid) from public, anon;
revoke execute on function is_workspace_member(uuid) from public, anon;
grant execute on function current_role_in_workspace(uuid) to authenticated;
grant execute on function is_workspace_member(uuid) to authenticated;
