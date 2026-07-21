-- Phase 4 (Dashboard and reports) — see docs/06-development-roadmap.md and
-- docs/10-api-data-access-spec.md §2 "Reporting". These read from Postgres
-- RPC functions rather than client-side aggregation, so the same total is
-- always reachable two ways (report summary and Transactions drill-down)
-- without client math ever diverging from server math.
--
-- SECURITY DEFINER + is_workspace_member() guard follows the same pattern
-- as current_role_in_workspace()/set_default_workspace_currency() elsewhere
-- in this schema, rather than relying on RLS on the underlying tables
-- directly — a caller for a workspace they don't belong to gets zero rows,
-- same as a real RLS denial would produce.
--
-- Every result row is grouped by currency_code and never summed across
-- currencies — "no mixed-currency total is shown without an explicit
-- policy" (Phase 4 exit criteria). A workspace with only one active
-- currency in practice just gets one row/section; this is what lets NIVA
-- support Jalie's AED-income / LKR-expense workspace without inventing a
-- conversion rate.

create or replace function public.dashboard_summary(
  p_workspace_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  currency_code text,
  income numeric,
  expenses numeric,
  net numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.currency_code,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0) as income,
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as expenses,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0) as net
  from transactions t
  where is_workspace_member(p_workspace_id)
    and t.workspace_id = p_workspace_id
    and t.status = 'active'
    and (p_property_id is null or t.property_id = p_property_id)
    and t.occurred_on >= p_period_start
    and t.occurred_on <= p_period_end
  group by t.currency_code
  order by t.currency_code
$$;

create or replace function public.revenue_by_platform(
  p_workspace_id uuid,
  p_property_id uuid,
  p_period_start date,
  p_period_end date
)
returns table (
  currency_code text,
  platform_id uuid,
  platform_name text,
  total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.currency_code,
    p.id as platform_id,
    p.name as platform_name,
    sum(t.amount) as total
  from transactions t
  join platforms p on p.id = t.platform_id
  where is_workspace_member(p_workspace_id)
    and t.workspace_id = p_workspace_id
    and t.status = 'active'
    and t.type = 'income'
    and (p_property_id is null or t.property_id = p_property_id)
    and t.occurred_on >= p_period_start
    and t.occurred_on <= p_period_end
  group by t.currency_code, p.id, p.name
  order by total desc
$$;

-- Rolls sub-category totals up to their parent (migration 0005's one-level
-- category hierarchy) — the Reports screen shows top-level categories only,
-- per docs/09-wireframes.md; drill-down into Transactions can still filter
-- by the specific sub-category if the user narrows further there. Note:
-- superseded by migration 0008, which adds a category_ids column so the
-- drill-down can match every contributing sub-category, not just the
-- top-level id.
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

-- Function creation grants EXECUTE to PUBLIC (and, under Supabase's default
-- privileges, directly to anon too) unless revoked — match
-- is_workspace_member/current_role_in_workspace/set_default_workspace_currency,
-- none of which anon or unauthenticated callers can call.
revoke execute on function public.dashboard_summary(uuid, uuid, date, date) from public;
revoke execute on function public.dashboard_summary(uuid, uuid, date, date) from anon;
revoke execute on function public.revenue_by_platform(uuid, uuid, date, date) from public;
revoke execute on function public.revenue_by_platform(uuid, uuid, date, date) from anon;
revoke execute on function public.expenses_by_category(uuid, uuid, date, date) from public;
revoke execute on function public.expenses_by_category(uuid, uuid, date, date) from anon;

grant execute on function public.dashboard_summary(uuid, uuid, date, date) to authenticated;
grant execute on function public.revenue_by_platform(uuid, uuid, date, date) to authenticated;
grant execute on function public.expenses_by_category(uuid, uuid, date, date) to authenticated;
