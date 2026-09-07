-- profiles RLS (docs/07-domain-model-and-schema.md §6, migration 20260720232229):
-- everyone can manage their own profile; an administrator can additionally view and
-- update a co-member's profile (added so admins can fix a housekeeper's display
-- name without asking them to sign in); nobody else can see or touch a profile
-- outside their own workspace. See docs/11-coding-standards-and-test-strategy.md §7.

begin;

select plan(7);

select tests.create_user('profile-admin@niva.test') as id \gset admin_
select tests.create_user('profile-staff@niva.test') as id \gset staff_
select tests.create_user('profile-outsider@niva.test') as id \gset outsider_

insert into workspaces (id, name) values
  ('50000000-0000-0000-0000-000000000001', 'Test Profile WS'),
  ('60000000-0000-0000-0000-000000000001', 'Test Profile Outsider WS');

insert into workspace_memberships (workspace_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000001', :'admin_id', 'administrator'),
  ('50000000-0000-0000-0000-000000000001', :'staff_id', 'staff'),
  ('60000000-0000-0000-0000-000000000001', :'outsider_id', 'administrator');

-- staff can update their own display name.
select tests.authenticate_as(:'staff_id');
select is(
  (with updated as (
     update profiles set display_name = 'Staff Self Edit' where id = :'staff_id' returning 1
   ) select count(*) from updated)::int,
  1,
  'profiles: a user can update their own display name'
);

-- staff cannot update the administrator's profile (same workspace, but not an admin themselves).
select is(
  (with updated as (
     update profiles set display_name = 'Hijacked' where id = :'admin_id' returning 1
   ) select count(*) from updated)::int,
  0,
  'profiles: a non-administrator cannot update a co-member''s profile'
);

-- administrator CAN see the staff member's profile.
select tests.authenticate_as(:'admin_id');
select is(
  (select count(*) from profiles where id = :'staff_id')::int, 1,
  'profiles: an administrator can see a co-member''s profile'
);

-- administrator CAN update the staff member's profile.
select is(
  (with updated as (
     update profiles set display_name = 'Admin-corrected name' where id = :'staff_id' returning 1
   ) select count(*) from updated)::int,
  1,
  'profiles: an administrator can update a co-member''s profile'
);

-- an outsider (different workspace entirely) cannot see the staff member's profile.
select tests.authenticate_as(:'outsider_id');
select is(
  (select count(*) from profiles where id = :'staff_id')::int, 0,
  'profiles: a member of a different workspace cannot see this workspace''s profiles'
);

-- ...and cannot update it either.
select is(
  (with updated as (
     update profiles set display_name = 'Outsider edit' where id = :'staff_id' returning 1
   ) select count(*) from updated)::int,
  0,
  'profiles: a member of a different workspace cannot update this workspace''s profiles'
);

-- but the outsider CAN still update their own profile — being locked out of someone
-- else's workspace doesn't mean locked out of their own account.
select is(
  (with updated as (
     update profiles set display_name = 'Outsider Self Edit' where id = :'outsider_id' returning 1
   ) select count(*) from updated)::int,
  1,
  'profiles: a user can always update their own profile, regardless of workspace'
);

select * from finish();

rollback;
