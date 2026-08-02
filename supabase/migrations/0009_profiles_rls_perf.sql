-- Perf fixes flagged by the Supabase advisor on public.profiles:
-- 1) auth_rls_initplan: auth.uid() was being re-evaluated per row instead of
--    once per statement. Wrapping it as (select auth.uid()) lets Postgres
--    cache it (see https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
-- 2) multiple_permissive_policies: profiles_update and profiles_update_by_admin
--    were two separate permissive UPDATE policies for the same role/action,
--    so both had to run on every UPDATE. Combined into one policy with OR.
-- Logic is unchanged in both cases — same rows accessible as before.
-- Applied live via the Supabase MCP on 2026-07-23; this file exists so
-- supabase/migrations/ matches what's actually in the database.

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from workspace_memberships m1
      join workspace_memberships m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = (select auth.uid())
        and m2.user_id = profiles.id
    )
  );

drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_update_by_admin on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from workspace_memberships m1
      join workspace_memberships m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = (select auth.uid())
        and m1.role = 'administrator'
        and m2.user_id = profiles.id
    )
  );
