-- NIVA initial schema
-- Source of truth: docs/07-domain-model-and-schema.md — keep this file and
-- that document in sync when either changes.

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Workspaces and membership
-- ============================================================================

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('administrator', 'manager', 'staff', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_memberships_user_id_idx on workspace_memberships (user_id);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. RLS helper — avoids recursive policy lookups (docs §6)
-- ============================================================================

create function current_role_in_workspace(target_workspace uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role from workspace_memberships
  where workspace_id = target_workspace and user_id = auth.uid()
  limit 1;
$$;

create function is_workspace_member(target_workspace uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_memberships
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

-- ============================================================================
-- 3. Configuration tables
-- ============================================================================

create table properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table platforms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name, type)
);

create table iso_currencies (
  code text primary key,
  name text not null,
  minor_unit smallint not null
);

create table workspace_currencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  currency_code text not null references iso_currencies(code),
  is_active boolean not null default true,
  is_default boolean not null default false,
  unique (workspace_id, currency_code)
);

create unique index workspace_currencies_one_default_idx
  on workspace_currencies (workspace_id)
  where is_default;

-- ============================================================================
-- 4. Transactions
-- ============================================================================

create table transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  property_id uuid not null references properties(id),
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null references categories(id),
  payment_method_id uuid not null references payment_methods(id),
  platform_id uuid references platforms(id),
  supplier_id uuid references suppliers(id),
  currency_code text not null references iso_currencies(code),
  amount numeric(14, 2) not null check (amount > 0),
  occurred_on date not null,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index transactions_workspace_period_idx on transactions (workspace_id, occurred_on);
create index transactions_workspace_property_period_idx on transactions (workspace_id, property_id, occurred_on);
create index transactions_workspace_type_category_idx on transactions (workspace_id, type, category_id);
create index transactions_workspace_platform_idx on transactions (workspace_id, platform_id);

-- ---- Data integrity beyond column constraints (docs §5) --------------------

create function check_transaction_integrity()
returns trigger
language plpgsql
as $$
declare
  category_type text;
  currency_enabled boolean;
begin
  select type into category_type from categories where id = new.category_id;
  if category_type is distinct from new.type then
    raise exception 'category_type_mismatch: category % is type %, transaction is type %',
      new.category_id, category_type, new.type
      using errcode = '23514';
  end if;

  select exists (
    select 1 from workspace_currencies
    where workspace_id = new.workspace_id
      and currency_code = new.currency_code
      and is_active
  ) into currency_enabled;

  if not currency_enabled then
    raise exception 'currency_not_enabled: % is not enabled for workspace %',
      new.currency_code, new.workspace_id
      using errcode = '23514';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_check_integrity
  before insert or update on transactions
  for each row execute function check_transaction_integrity();

-- ---- updated_at maintenance for configuration tables ------------------------

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger properties_set_updated_at before update on properties
  for each row execute function set_updated_at();
create trigger platforms_set_updated_at before update on platforms
  for each row execute function set_updated_at();
create trigger payment_methods_set_updated_at before update on payment_methods
  for each row execute function set_updated_at();
create trigger suppliers_set_updated_at before update on suppliers
  for each row execute function set_updated_at();
create trigger categories_set_updated_at before update on categories
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. Row Level Security (docs §6)
-- ============================================================================

alter table workspaces enable row level security;
alter table workspace_memberships enable row level security;
alter table profiles enable row level security;
alter table properties enable row level security;
alter table platforms enable row level security;
alter table payment_methods enable row level security;
alter table suppliers enable row level security;
alter table categories enable row level security;
alter table workspace_currencies enable row level security;
alter table transactions enable row level security;
-- iso_currencies is a global reference table: readable by any authenticated
-- user, writable by nobody from the client (seeded via migration only).
alter table iso_currencies enable row level security;

create policy iso_currencies_select on iso_currencies
  for select to authenticated using (true);

create policy workspaces_select on workspaces
  for select to authenticated using (is_workspace_member(id));

create policy memberships_select on workspace_memberships
  for select to authenticated using (is_workspace_member(workspace_id));
create policy memberships_insert on workspace_memberships
  for insert to authenticated with check (current_role_in_workspace(workspace_id) = 'administrator');
create policy memberships_update on workspace_memberships
  for update to authenticated using (current_role_in_workspace(workspace_id) = 'administrator');
create policy memberships_delete on workspace_memberships
  for delete to authenticated using (current_role_in_workspace(workspace_id) = 'administrator');

create policy profiles_select on profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1 from workspace_memberships m1
      join workspace_memberships m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );
create policy profiles_update on profiles
  for update to authenticated using (id = auth.uid());
create policy profiles_insert on profiles
  for insert to authenticated with check (id = auth.uid());

-- Configuration tables: any member reads; only administrators write.
do $$
declare
  t text;
begin
  foreach t in array array['properties', 'platforms', 'payment_methods', 'suppliers', 'categories', 'workspace_currencies']
  loop
    execute format('create policy %I_select on %I for select to authenticated using (is_workspace_member(workspace_id));', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (current_role_in_workspace(workspace_id) = ''administrator'');', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (current_role_in_workspace(workspace_id) = ''administrator'');', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (current_role_in_workspace(workspace_id) = ''administrator'');', t, t);
  end loop;
end $$;

-- Transactions: staff can insert only; manager/administrator can also
-- update and archive/delete. Viewer never appears in a write policy.
create policy transactions_select on transactions
  for select to authenticated using (is_workspace_member(workspace_id));

create policy transactions_insert on transactions
  for insert to authenticated with check (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager', 'staff')
  );

create policy transactions_update on transactions
  for update to authenticated using (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager')
  );

create policy transactions_delete on transactions
  for delete to authenticated using (
    current_role_in_workspace(workspace_id) = 'administrator'
  );
