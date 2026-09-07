-- pgTAP test setup — see docs/11-coding-standards-and-test-strategy.md §7/§11.
--
-- Not wrapped in BEGIN/ROLLBACK: this file installs the pgtap extension and a small
-- `tests` helper schema that every other file in this directory depends on, and is
-- meant to persist for the lifetime of the ephemeral database `supabase test db`
-- spins up (a fresh, throwaway Postgres container — never the real project). Every
-- other file in this directory wraps its own fixtures in BEGIN ... ROLLBACK so tests
-- never leak state into each other.
--
-- `supabase test db` runs files in this directory in alphabetical order via pg_prove,
-- which is why this one is prefixed 00 — it must run before every numbered test file.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

-- iso_currencies is static reference data in production (never workspace-scoped),
-- seeded once here so fixture transactions/recurring_payments in the numbered test
-- files have a valid currency_code to reference. Not wrapped in a transaction that
-- rolls back, same reasoning as the extension/schema above.
insert into public.iso_currencies (code, name, minor_unit)
values ('USD', 'US Dollar', 2)
on conflict (code) do nothing;

-- Creates a minimal, real auth.users row (satisfying every FK that RLS-relevant
-- tables have back to auth.users — profiles, workspace_memberships, created_by/
-- updated_by columns, etc.) and returns its id. `handle_new_user`'s trigger fires
-- normally, so a matching public.profiles row is created too, exactly like a real
-- sign-up. No password is set — these users are never signed in for real; the
-- session is instead switched to act as them via tests.authenticate_as() below,
-- the same mechanism PostgREST itself uses.
create or replace function tests.create_user(user_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
  ) values (
    new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    user_email, now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false
  );
  return new_id;
end;
$$;

-- Switches the current (transaction-local) session to act as `user_id`, by setting
-- the same `role` and `request.jwt.claims` that PostgREST sets per-request in
-- production. auth.uid() — read by every RLS policy and SECURITY DEFINER guard in
-- this project via current_role_in_workspace()/is_workspace_member() — resolves
-- from request.jwt.claims, so this is a faithful simulation, not an approximation.
--
-- Deliberately NOT security definer: Postgres refuses to let a security-definer
-- function change the "role" GUC at all (a hardening rule against exactly the kind
-- of privilege-flip this function performs), so the switch has to run with the
-- caller's own privileges — the superuser `supabase test db` connects as. The
-- grants below give the `authenticated` role reached by the *first* call enough
-- access to call this function again for the *next* persona in the same test.
create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Drops back to an unauthenticated (anon-role) session, mirroring a signed-out
-- client. Not currently used by name in the numbered test files (each starts a
-- fresh transaction anyway) but kept available for any test that needs to assert
-- anon-role behavior explicitly.
create or replace function tests.clear_authentication()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- Needed because authenticate_as()/clear_authentication() are called from within
-- the `authenticated`/`anon` roles they themselves switch to (a test authenticating
-- as a second persona is no longer running as the superuser) — without this, the
-- second call in any test fails with "permission denied for schema tests".
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
