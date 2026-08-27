-- Supabase's default privileges grant EXECUTE to anon directly (not just
-- via PUBLIC) for every new function in the public schema, which is why
-- revoking from PUBLIC alone didn't remove it. Revoke explicitly so these
-- reporting RPCs match is_workspace_member/current_role_in_workspace/
-- set_default_workspace_currency, none of which anon can call.
revoke execute on function public.dashboard_summary(uuid, uuid, date, date) from anon;
revoke execute on function public.revenue_by_platform(uuid, uuid, date, date) from anon;
revoke execute on function public.expenses_by_category(uuid, uuid, date, date) from anon;
