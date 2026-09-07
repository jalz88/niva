-- Role-based write permissions within a single workspace (docs/07-domain-model-and-
-- schema.md §6): administrator/manager/staff/viewer each have a different subset of
-- allowed operations on the same tables. See docs/11-coding-standards-and-test-
-- strategy.md §7.

begin;

select plan(10);

select tests.create_user('role-admin@niva.test') as id \gset admin_
select tests.create_user('role-manager@niva.test') as id \gset manager_
select tests.create_user('role-staff@niva.test') as id \gset staff_
select tests.create_user('role-viewer@niva.test') as id \gset viewer_

insert into workspaces (id, name) values ('30000000-0000-0000-0000-000000000001', 'Test Role WS');

insert into workspace_memberships (workspace_id, user_id, role) values
  ('30000000-0000-0000-0000-000000000001', :'admin_id', 'administrator'),
  ('30000000-0000-0000-0000-000000000001', :'manager_id', 'manager'),
  ('30000000-0000-0000-0000-000000000001', :'staff_id', 'staff'),
  ('30000000-0000-0000-0000-000000000001', :'viewer_id', 'viewer');

insert into properties (id, workspace_id, name)
  values ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Role WS Property');
insert into categories (id, workspace_id, name, type)
  values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Role WS Category', 'expense');
insert into payment_methods (id, workspace_id, name)
  values ('30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Role WS Cash');
insert into workspace_currencies (workspace_id, currency_code, is_active, is_default)
  values ('30000000-0000-0000-0000-000000000001', 'USD', true, true);

-- transactions.created_by/recurring_payments.created_by are NOT NULL and get
-- force-set to auth.uid() by their own integrity triggers, so these two fixture
-- rows have to be inserted while authenticated as the administrator, not as the
-- superuser this file starts as.
select tests.authenticate_as(:'admin_id');

-- One pre-existing transaction (created as the administrator) for the
-- update/delete permission checks below.
insert into transactions (
  id, workspace_id, property_id, type, category_id, payment_method_id, currency_code, amount, occurred_on, created_by
) values (
  '30000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002', 'expense',
  '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004',
  'USD', 25, current_date, :'admin_id'
);

insert into recurring_payments (
  id, workspace_id, property_id, name, category_id, payment_method_id, currency_code,
  amount, cadence_type, cadence_day_of_month, next_due_on, created_by
) values (
  '30000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002', 'Role WS Recurring',
  '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004',
  'USD', 50, 'monthly', 1, current_date, :'admin_id'
);

-- staff can insert a transaction (Quick Add is a staff-level action by design).
-- Built via format(..., %L) rather than interpolating the psql variable directly
-- inside the dollar-quoted SQL text, since psql's :'var' substitution inside an
-- already-quoted string is unreliable — passing it as a separate format() argument
-- keeps the substitution and the quoting each happening in exactly one place.
select tests.authenticate_as(:'staff_id');
select lives_ok(
  format(
    $f$insert into transactions (workspace_id, property_id, type, category_id, payment_method_id, currency_code, amount, occurred_on, created_by)
       values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'expense',
               '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 'USD', 5, current_date, %L)$f$,
    :'staff_id'
  ),
  'transactions: staff can insert (Quick Add is a staff-level action)'
);

-- viewer cannot insert a transaction at all.
select tests.authenticate_as(:'viewer_id');
select throws_ok(
  format(
    $f$insert into transactions (workspace_id, property_id, type, category_id, payment_method_id, currency_code, amount, occurred_on, created_by)
       values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'expense',
               '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 'USD', 5, current_date, %L)$f$,
    :'viewer_id'
  ),
  '42501',
  'transactions: a viewer cannot insert — read-only role'
);

-- viewer CAN still read configuration data (categories) — is_workspace_member(), not role-gated.
select is(
  (select count(*) from categories)::int, 1,
  'categories: a viewer can still read workspace categories (select is member-only, not role-gated)'
);

-- staff cannot create a category (administrator-only configuration change).
select tests.authenticate_as(:'staff_id');
select throws_ok(
  $$insert into categories (workspace_id, name, type) values ('30000000-0000-0000-0000-000000000001', 'Staff-added category', 'expense')$$,
  '42501',
  'categories: staff cannot create a category — administrator-only'
);

-- staff cannot update the existing transaction (update is administrator/manager only).
select is(
  (with updated as (
     update transactions set notes = 'staff edit attempt' where id = '30000000-0000-0000-0000-000000000005' returning 1
   ) select count(*) from updated)::int,
  0,
  'transactions: staff cannot update an existing transaction — the row is invisible to UPDATE''s USING clause'
);

-- manager CAN update the same transaction.
select tests.authenticate_as(:'manager_id');
select is(
  (with updated as (
     update transactions set notes = 'manager edit' where id = '30000000-0000-0000-0000-000000000005' returning 1
   ) select count(*) from updated)::int,
  1,
  'transactions: a manager can update an existing transaction'
);

-- manager cannot delete it (delete is administrator-only).
select is(
  (with deleted as (
     delete from transactions where id = '30000000-0000-0000-0000-000000000005' returning 1
   ) select count(*) from deleted)::int,
  0,
  'transactions: a manager cannot delete — delete is administrator-only'
);

-- administrator CAN delete it.
select tests.authenticate_as(:'admin_id');
select is(
  (with deleted as (
     delete from transactions where id = '30000000-0000-0000-0000-000000000005' returning 1
   ) select count(*) from deleted)::int,
  1,
  'transactions: an administrator can delete'
);

-- staff cannot see recurring payments at all (select is administrator/manager only).
select tests.authenticate_as(:'staff_id');
select is(
  (select count(*) from recurring_payments)::int, 0,
  'recurring_payments: staff cannot see recurring payments even though one exists — select is manager/administrator only'
);

-- manager CAN see it.
select tests.authenticate_as(:'manager_id');
select is(
  (select count(*) from recurring_payments)::int, 1,
  'recurring_payments: a manager can see recurring payments'
);

select * from finish();

rollback;
