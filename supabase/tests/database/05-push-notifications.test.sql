-- Push notifications (migration 20261107052954): subscriptions are written only via
-- the register/unregister RPCs, readable only by their owner; preferences are
-- own-row only; the digest/core functions are service-role-only; and the
-- refactored housekeeping_today_checklist wrapper still gates on membership.

begin;

select plan(12);

select tests.create_user('push-a@niva.test') as id \gset a_
select tests.create_user('push-b@niva.test') as id \gset b_
select tests.create_user('push-out@niva.test') as id \gset out_

insert into workspaces (id, name) values ('50000000-0000-0000-0000-000000000001', 'Push WS');
insert into workspace_memberships (workspace_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000001', :'a_id', 'administrator'),
  ('50000000-0000-0000-0000-000000000001', :'b_id', 'staff');

-- A caller with no membership anywhere (the null-role bypass class).
select tests.authenticate_as(:'out_id');
select throws_ok(
  $$select register_push_subscription('50000000-0000-0000-0000-000000000001', 'https://push.example/x', 'p', 'a')$$,
  '42501',
  'register_push_subscription: a non-member is rejected'
);

-- Member registers a device.
select tests.authenticate_as(:'a_id');
select lives_ok(
  $$select register_push_subscription('50000000-0000-0000-0000-000000000001', 'https://push.example/dev1', 'p', 'a')$$,
  'register_push_subscription: a member can register a device'
);
select is((select count(*)::int from push_subscriptions), 1, 'owner sees their own subscription');

-- Other member cannot see it, and cannot delete it via unregister.
select tests.authenticate_as(:'b_id');
select is((select count(*)::int from push_subscriptions), 0, 'another member cannot see it');
select lives_ok($$select unregister_push_subscription('https://push.example/dev1')$$, 'unregister of someone else''s endpoint is a no-op');

-- Shared device: b registering the same endpoint takes it over.
select lives_ok(
  $$select register_push_subscription('50000000-0000-0000-0000-000000000001', 'https://push.example/dev1', 'p2', 'a2')$$,
  'a shared device endpoint can be taken over by the new signed-in member'
);
select is((select count(*)::int from push_subscriptions), 1, 'the new owner now sees it');

-- No direct writes from the client.
select throws_ok(
  $$insert into push_subscriptions (user_id, workspace_id, endpoint, p256dh, auth) values (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'https://push.example/direct', 'p', 'a')$$,
  '42501',
  'direct inserts into push_subscriptions are denied'
);

-- Preferences: own row only.
select lives_ok(
  $$insert into push_preferences (user_id, payments_enabled) values (auth.uid(), false)$$,
  'a user can write their own push preferences'
);
select throws_ok(
  $$insert into push_preferences (user_id) values (gen_random_uuid())$$,
  '42501',
  'a user cannot write another user''s push preferences'
);

-- Service-role-only functions.
select throws_ok(
  $$select * from push_daily_digest(current_date)$$,
  '42501',
  'push_daily_digest is not callable by authenticated users'
);

-- The checklist wrapper still returns nothing to a non-member.
select tests.authenticate_as(:'out_id');
select is(
  (select count(*)::int from housekeeping_today_checklist('50000000-0000-0000-0000-000000000001', current_date)),
  0,
  'housekeeping_today_checklist still returns nothing to a non-member'
);

select * from finish();

rollback;
