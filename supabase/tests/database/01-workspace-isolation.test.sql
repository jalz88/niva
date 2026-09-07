-- Cross-workspace isolation — the core RLS boundary (docs/07-domain-model-and-schema.md
-- §6): a member of one workspace must never see another workspace's rows, on any
-- table, under any query shape (not just default list queries but direct lookups by
-- a known id too). See docs/11-coding-standards-and-test-strategy.md §7.

begin;

select plan(6);

-- Fixture: two independent workspaces, each with its own administrator, property,
-- category, payment method, and one transaction. Fixed literal ids (rather than
-- gen_random_uuid()) so the "known id direct lookup" test below can reference the
-- other workspace's row without a round trip.
select tests.create_user('ws1-admin@niva.test') as id \gset ws1_admin_
select tests.create_user('ws2-admin@niva.test') as id \gset ws2_admin_

insert into workspaces (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Test WS1'),
  ('20000000-0000-0000-0000-000000000001', 'Test WS2');

insert into workspace_memberships (workspace_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', :'ws1_admin_id', 'administrator'),
  ('20000000-0000-0000-0000-000000000001', :'ws2_admin_id', 'administrator');

insert into properties (id, workspace_id, name) values
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'WS1 Property'),
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'WS2 Property');

insert into categories (id, workspace_id, name, type) values
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'WS1 Category', 'expense'),
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'WS2 Category', 'expense');

insert into payment_methods (id, workspace_id, name) values
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'WS1 Cash'),
  ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'WS2 Cash');

-- Every workspace needs its currency explicitly enabled (workspace_currencies) —
-- check_transaction_integrity() rejects a transaction in a currency the workspace
-- hasn't turned on, exactly as it would for a real workspace.
insert into workspace_currencies (workspace_id, currency_code, is_active, is_default) values
  ('10000000-0000-0000-0000-000000000001', 'USD', true, true),
  ('20000000-0000-0000-0000-000000000001', 'USD', true, true);

-- transactions.created_by is NOT NULL and is force-set to auth.uid() by the
-- check_transaction_integrity() trigger regardless of what's supplied, so each
-- workspace's transaction has to be inserted while authenticated as that
-- workspace's own user, not as the superuser this file starts as.
select tests.authenticate_as(:'ws1_admin_id');
insert into transactions (
  id, workspace_id, property_id, type, category_id, payment_method_id, currency_code, amount, occurred_on, created_by
) values (
  '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002', 'expense',
  '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004',
  'USD', 10, current_date, :'ws1_admin_id'
);

select tests.authenticate_as(:'ws2_admin_id');
insert into transactions (
  id, workspace_id, property_id, type, category_id, payment_method_id, currency_code, amount, occurred_on, created_by
) values (
  '20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002', 'expense',
  '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004',
  'USD', 10, current_date, :'ws2_admin_id'
);

-- Act as WS1's administrator for every assertion below.
select tests.authenticate_as(:'ws1_admin_id');

select is(
  (select count(*) from workspaces)::int, 1,
  'workspaces: a member sees only their own workspace, not every workspace in the database'
);

select is(
  (select array_agg(id) from workspaces),
  array['10000000-0000-0000-0000-000000000001'::uuid],
  'workspaces: the one workspace visible is the caller''s own, not the other tenant''s'
);

select is(
  (select count(*) from transactions)::int, 1,
  'transactions: RLS hides the other workspace''s transactions entirely, not just from a filtered view'
);

select is(
  (select count(*) from transactions where id = '20000000-0000-0000-0000-000000000005')::int, 0,
  'transactions: even a direct lookup by the other workspace''s known row id returns nothing'
);

select is(
  (select count(*) from categories)::int, 1,
  'categories: RLS hides the other workspace''s categories'
);

select is(
  (select count(*) from workspace_memberships)::int, 1,
  'workspace_memberships: a member cannot enumerate another workspace''s membership list'
);

select * from finish();

rollback;
