-- Local development seed data. Not applied to production automatically —
-- run explicitly with `supabase db reset` or `psql -f` against a local/dev
-- Supabase instance only.

insert into iso_currencies (code, name, minor_unit) values
  ('LKR', 'Sri Lankan Rupee', 2),
  ('USD', 'US Dollar', 2),
  ('EUR', 'Euro', 2),
  ('GBP', 'British Pound', 2),
  ('AUD', 'Australian Dollar', 2),
  ('INR', 'Indian Rupee', 2)
on conflict (code) do nothing;

-- Example workspace + seed values matching docs/06-development-roadmap.md
-- Phase 2 ("Kandy BnB; Airbnb and Agoda; LKR; agreed categories and payment
-- methods"). Uncomment and adjust once a real administrator user id exists
-- (create the user via Supabase Auth first, then paste their id below).

-- insert into workspaces (id, name) values
--   ('00000000-0000-0000-0000-000000000001', 'Kandy BnB Group');
--
-- insert into workspace_memberships (workspace_id, user_id, role) values
--   ('00000000-0000-0000-0000-000000000001', '<administrator-user-id>', 'administrator');
--
-- insert into properties (workspace_id, name) values
--   ('00000000-0000-0000-0000-000000000001', 'Kandy BnB');
--
-- insert into platforms (workspace_id, name) values
--   ('00000000-0000-0000-0000-000000000001', 'Airbnb'),
--   ('00000000-0000-0000-0000-000000000001', 'Agoda');
--
-- insert into payment_methods (workspace_id, name) values
--   ('00000000-0000-0000-0000-000000000001', 'Cash'),
--   ('00000000-0000-0000-0000-000000000001', 'Bank transfer'),
--   ('00000000-0000-0000-0000-000000000001', 'Card');
--
-- insert into categories (workspace_id, name, type) values
--   ('00000000-0000-0000-0000-000000000001', 'Booking payout', 'income'),
--   ('00000000-0000-0000-0000-000000000001', 'Cleaning & supplies', 'expense'),
--   ('00000000-0000-0000-0000-000000000001', 'Utilities', 'expense'),
--   ('00000000-0000-0000-0000-000000000001', 'Repairs & maintenance', 'expense');
--
-- insert into workspace_currencies (workspace_id, currency_code, is_default) values
--   ('00000000-0000-0000-0000-000000000001', 'LKR', true);
