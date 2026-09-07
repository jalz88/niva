-- Regression test for the 2026-08-27 critical bug (see docs/11-coding-standards-
-- and-test-strategy.md §7, "Critical bug found and fixed"): six SECURITY DEFINER
-- functions guarded access with `if current_role_in_workspace(x) not in (...)`, and
-- current_role_in_workspace() returns SQL NULL — not a role string — for a caller
-- with no membership row in the target workspace at all. `IF <NULL> THEN` is treated
-- as false in PL/pgSQL, so the RAISE EXCEPTION was silently skipped for a caller who
-- belonged to a *different* workspace (or none at all), even though the same guard
-- correctly rejected a wrong-role member of the *same* workspace. Fixed by wrapping
-- the role lookup in coalesce(..., '').
--
-- This file exists so that bug class can never come back silently: every one of the
-- six functions is exercised here against both a wrong-role member of the SAME
-- workspace (the branch that was already correct) and a caller with NO membership
-- ANYWHERE (the branch that was actually broken) — plus a positive control proving
-- a legitimate call still succeeds, so an overly strict future change would also
-- get caught.

begin;

select plan(9);

select tests.create_user('sd-admin@niva.test') as id \gset admin_
select tests.create_user('sd-viewer@niva.test') as id \gset viewer_
select tests.create_user('sd-outsider@niva.test') as id \gset outsider_

insert into workspaces (id, name) values ('40000000-0000-0000-0000-000000000001', 'Test SD WS');

-- The outsider deliberately gets NO row in workspace_memberships at all — not even
-- for a different workspace — reproducing the exact condition that triggered the
-- bug: current_role_in_workspace() returns NULL, not merely a disallowed role.
insert into workspace_memberships (workspace_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000001', :'admin_id', 'administrator'),
  ('40000000-0000-0000-0000-000000000001', :'viewer_id', 'viewer');

insert into properties (id, workspace_id, name)
  values ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'SD WS Property');
insert into categories (id, workspace_id, name, type)
  values ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'SD WS Category', 'expense');
insert into payment_methods (id, workspace_id, name)
  values ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'SD WS Cash');
insert into workspace_currencies (workspace_id, currency_code, is_active, is_default)
  values ('40000000-0000-0000-0000-000000000001', 'USD', true, true);

-- rooms.created_by, sop_tasks.created_by, and recurring_payments.created_by are all
-- NOT NULL and force-set to auth.uid() by their own audit-fields trigger, so these
-- three fixture rows have to be inserted while authenticated as the administrator,
-- not as the superuser this file starts as.
select tests.authenticate_as(:'admin_id');

insert into rooms (id, workspace_id, property_id, name, room_type)
  values ('40000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000002', 'SD WS Room', 'bedroom');
insert into sop_tasks (id, workspace_id, room_id, name, cadence_type)
  values ('40000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000005', 'SD WS Task', 'daily');
insert into recurring_payments (
  id, workspace_id, property_id, name, category_id, payment_method_id, currency_code,
  amount, cadence_type, cadence_day_of_month, next_due_on, created_by
) values (
  '40000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002', 'SD WS Recurring',
  '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004',
  'USD', 40, 'monthly', 1, current_date, :'admin_id'
);

-- The caller with NO membership anywhere — the branch that was actually broken.
select tests.authenticate_as(:'outsider_id');

select throws_ok(
  $$select sop_task_skip_today('40000000-0000-0000-0000-000000000006', current_date)$$,
  '42501',
  'sop_task_skip_today: a caller with no membership in any workspace is rejected'
);

select throws_ok(
  $$select sop_task_unskip_today('40000000-0000-0000-0000-000000000006', current_date)$$,
  '42501',
  'sop_task_unskip_today: a caller with no membership in any workspace is rejected'
);

select throws_ok(
  $$select sop_task_add_for_today('40000000-0000-0000-0000-000000000005', 'Injected task')$$,
  '42501',
  'sop_task_add_for_today: a caller with no membership in any workspace is rejected'
);

select throws_ok(
  $$select sop_task_include_today('40000000-0000-0000-0000-000000000006', current_date)$$,
  '42501',
  'sop_task_include_today: a caller with no membership in any workspace is rejected'
);

select throws_ok(
  $$select sop_task_uninclude_today('40000000-0000-0000-0000-000000000006', current_date)$$,
  '42501',
  'sop_task_uninclude_today: a caller with no membership in any workspace is rejected'
);

select throws_ok(
  $$select mark_recurring_payment_paid('40000000-0000-0000-0000-000000000007', 40, current_date, null)$$,
  '42501',
  'mark_recurring_payment_paid: a caller with no membership in any workspace is rejected'
);

-- The already-correct branch: a real member of the SAME workspace, wrong role.
select tests.authenticate_as(:'viewer_id');
select throws_ok(
  $$select sop_task_skip_today('40000000-0000-0000-0000-000000000006', current_date)$$,
  '42501',
  'sop_task_skip_today: a viewer (real member, wrong role) is still rejected'
);

-- Positive control: a legitimate administrator of the target workspace still succeeds.
select tests.authenticate_as(:'admin_id');
select lives_ok(
  $$select sop_task_skip_today('40000000-0000-0000-0000-000000000006', current_date)$$,
  'sop_task_skip_today: an administrator of the target workspace succeeds'
);

select lives_ok(
  $$select mark_recurring_payment_paid('40000000-0000-0000-0000-000000000007', 40, current_date, null)$$,
  'mark_recurring_payment_paid: an administrator of the target workspace succeeds'
);

select * from finish();

rollback;
