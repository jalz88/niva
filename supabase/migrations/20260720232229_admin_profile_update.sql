-- Real-user-testing follow-up (2026-07-21): profiles.display_name defaults
-- to the user's email (migration 0003's handle_new_user fallback), and the
-- only way to set a real name was profiles_update, which is self-only
-- (id = auth.uid()). That's fine for self-service (see the new Account
-- screen), but Jalie also wants to set a member's name for them from the
-- Users admin screen at the point of adding their account — mirrors the
-- profiles_select cross-membership join pattern below.
-- Source of truth: docs/07-domain-model-and-schema.md — keep in sync.

create policy profiles_update_by_admin on profiles
  for update to authenticated using (
    exists (
      select 1 from workspace_memberships m1
      join workspace_memberships m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = auth.uid()
        and m1.role = 'administrator'
        and m2.user_id = profiles.id
    )
  );
