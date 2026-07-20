// Hand-written to match docs/07-domain-model-and-schema.md until the first
// migration is applied to a live project and `supabase gen types typescript`
// can generate this file for real. Keep both in sync until then.

export type Role = 'administrator' | 'manager' | 'staff' | 'viewer'
export type TransactionType = 'income' | 'expense'
export type TransactionStatus = 'active' | 'archived'

export interface Workspace {
  id: string
  name: string
  created_at: string
}

export interface WorkspaceMembership {
  id: string
  workspace_id: string
  user_id: string
  role: Role
  created_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  email: string | null
  created_at: string
}

interface ConfigItemBase {
  id: string
  workspace_id: string
  name: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export type Property = ConfigItemBase
export type Platform = ConfigItemBase
export type Supplier = ConfigItemBase

export interface PaymentMethod extends ConfigItemBase {
  is_favorite: boolean
}

export interface Category extends ConfigItemBase {
  type: TransactionType
  is_favorite: boolean
  // A category with a parent is a sub-category. Sub-categories can't
  // themselves have children or be favorited — see migration 0005.
  parent_category_id: string | null
}

export interface IsoCurrency {
  code: string
  name: string
  minor_unit: number
}

export interface WorkspaceCurrency {
  id: string
  workspace_id: string
  currency_code: string
  is_active: boolean
  is_default: boolean
}

export interface Transaction {
  id: string
  workspace_id: string
  property_id: string
  type: TransactionType
  category_id: string
  payment_method_id: string
  platform_id: string | null
  supplier_id: string | null
  currency_code: string
  // numeric(14,2). PostgREST actually returns this as a JSON number, not a
  // string — useTransactions' flatten() normalizes it to string on the way
  // out so every consumer (esp. the edit form's Zod schema) can rely on it.
  amount: string
  occurred_on: string
  notes: string | null
  status: TransactionStatus
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string
}

// Joined shape returned by useTransactions().get() — see docs/10-api-data-access-spec.md
export interface TransactionWithLabels extends Transaction {
  property_name: string
  category_name: string
  payment_method_name: string
  platform_name: string | null
  supplier_name: string | null
}
