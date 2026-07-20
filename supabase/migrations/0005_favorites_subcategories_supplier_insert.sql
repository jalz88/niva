-- Phase 3 real-user-testing follow-up (2026-07-20):
-- 1. Favorite categories/payment methods (max 3 each) for one-tap entry.
-- 2. One level of sub-categories under a category, optional.
-- 3. Fix suppliers_insert: it was administrator-only, but
--    useSuppliers().findOrCreate() is called from the transaction form by
--    any role that can create a transaction (staff/manager/administrator —
--    see transactions_insert). A staff member typing a brand-new supplier
--    name would have hit a silent RLS denial. Never actually hit in testing
--    because only an administrator account exists so far.
-- Source of truth: docs/07-domain-model-and-schema.md — keep in sync.

-- ============================================================================
-- Categories: favorites + one level of sub-categories
-- ============================================================================

alter table categories add column is_favorite boolean not null default false;
alter table categories add column parent_category_id uuid references categories(id) on delete set null;

-- A sub-category can't itself be favorited or have children — keeps the
-- hierarchy exactly two levels deep, matching the "optional, one level"
-- scope agreed with Jalie (2026-07-20).
alter table categories add constraint categories_favorite_not_subcategory
  check (not (is_favorite and parent_category_id is not null));

create index categories_parent_idx on categories (parent_category_id) where parent_category_id is not null;

create function validate_category_parent()
returns trigger
language plpgsql
as $$
declare
  parent_type text;
  parent_workspace uuid;
  parent_has_parent uuid;
begin
  if new.parent_category_id is null then
    return new;
  end if;

  if new.parent_category_id = new.id then
    raise exception 'category_self_parent: a category cannot be its own parent'
      using errcode = '23514';
  end if;

  select type, workspace_id, parent_category_id
    into parent_type, parent_workspace, parent_has_parent
    from categories where id = new.parent_category_id;

  if parent_workspace is distinct from new.workspace_id then
    raise exception 'category_parent_cross_workspace: parent category belongs to a different workspace'
      using errcode = '23514';
  end if;

  if parent_type is distinct from new.type then
    raise exception 'category_parent_type_mismatch: parent category is type %, this category is type %',
      parent_type, new.type
      using errcode = '23514';
  end if;

  if parent_has_parent is not null then
    raise exception 'category_parent_too_deep: a sub-category cannot itself have a sub-category'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger categories_validate_parent
  before insert or update of parent_category_id, type, workspace_id on categories
  for each row execute function validate_category_parent();

create function enforce_category_favorite_limit()
returns trigger
language plpgsql
as $$
declare
  favorite_count int;
begin
  if not new.is_favorite then
    return new;
  end if;

  select count(*) into favorite_count
    from categories
    where workspace_id = new.workspace_id
      and type = new.type
      and is_favorite
      and id <> new.id;

  if favorite_count >= 3 then
    raise exception 'category_favorite_limit: at most 3 favorite % categories per workspace', new.type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger categories_enforce_favorite_limit
  before insert or update of is_favorite on categories
  for each row execute function enforce_category_favorite_limit();

-- ============================================================================
-- Payment methods: favorites (no type split — one shared set of 3)
-- ============================================================================

alter table payment_methods add column is_favorite boolean not null default false;

create function enforce_payment_method_favorite_limit()
returns trigger
language plpgsql
as $$
declare
  favorite_count int;
begin
  if not new.is_favorite then
    return new;
  end if;

  select count(*) into favorite_count
    from payment_methods
    where workspace_id = new.workspace_id
      and is_favorite
      and id <> new.id;

  if favorite_count >= 3 then
    raise exception 'payment_method_favorite_limit: at most 3 favorite payment methods per workspace'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payment_methods_enforce_favorite_limit
  before insert or update of is_favorite on payment_methods
  for each row execute function enforce_payment_method_favorite_limit();

-- ============================================================================
-- Suppliers: allow any transaction-creating role to insert
-- ============================================================================

drop policy suppliers_insert on suppliers;

create policy suppliers_insert on suppliers
  for insert to authenticated with check (
    current_role_in_workspace(workspace_id) in ('administrator', 'manager', 'staff')
  );
