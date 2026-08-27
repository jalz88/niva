-- Function creation grants EXECUTE to PUBLIC by default, which includes
-- the anon role — is_workspace_member/current_role_in_workspace/
-- set_default_workspace_currency already have this revoked (only
-- postgres/authenticated/service_role can call them). Match that so the 3
-- new reporting RPCs don't sit alone as anon-callable.
revoke execute on function public.dashboard_summary(uuid, uuid, date, date) from public;
revoke execute on function public.revenue_by_platform(uuid, uuid, date, date) from public;
revoke execute on function public.expenses_by_category(uuid, uuid, date, date) from public;
