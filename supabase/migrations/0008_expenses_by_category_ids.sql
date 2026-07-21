-- Reports' "Expenses by category" rolls sub-category totals up into their
-- parent (migration 0005's one-level category hierarchy, applied to
-- reporting in migration 0007). Without this, a drill-down into
-- Transactions filtered by just the top-level category_id would silently
-- miss any transaction actually recorded against a sub-category — the
-- summary total would include it, the drill-down list wouldn't, which is
-- exactly the kind of "numbers don't add up" bug real-user-testing has
-- caught before in this project. category_ids carries every contributing
-- category id (top + subs) so the client can filter Transactions with
-- .in() instead of .eq().
drop function if exists public.expenses_by_category(uuid, uuid, date, date);

create or replace function public.expenses_by_category(
  p_workspace_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  currency_code text,
  category_id uuid,
  category_name text,
  category_ids uuid[],
  total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.currency_code,
    top.id as category_id,
    top.name as category_name,
    array_agg(distinct c.id) as category_ids,
    sum(t.amount) as total
  from transactions t
  join categories c on c.id = t.category_id
  join categories top on top.id = coalesce(c.parent_category_id, c.id)
  where is_workspace_member(p_workspace_id)
    and t.workspace_id = p_workspace_id
    and t.status = 'active'
    and t.type = 'expense'
    and (p_property_id is null or t.property_id = p_property_id)
    and t.occurred_on >= p_period_start
    and t.occurred_on <= p_period_end
  group by t.currency_code, top.id, top.name
  order by total desc
$$;

-- Dropping and recreating clears prior grants — reapply the same
-- authenticated-only access as migration 0007.
revoke execute on function public.expenses_by_category(uuid, uuid, date, date) from public;
revoke execute on function public.expenses_by_category(uuid, uuid, date, date) from anon;
grant execute on function public.expenses_by_category(uuid, uuid, date, date) to authenticated;
