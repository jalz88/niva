import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { Category, TransactionType } from '@/types/database'

// Session-scoped cache — see useConfigItems.ts for why.
const cache = new Map<string, Category[]>()

export function useCategories() {
  const items = ref<Category[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cached = cache.get(workspaceId)
    if (cached) {
      items.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    const { data, error: dbError } = await supabase
      .from('categories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name')

    loading.value = false
    if (dbError) {
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    items.value = data
    cache.set(workspaceId, data)
  }

  // A category's type is fixed at creation — see
  // docs/07-domain-model-and-schema.md §3.
  async function create(workspaceId: string, name: string, type: TransactionType): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('categories')
      .insert({ workspace_id: workspaceId, name, type })
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = [...items.value, data].sort((a, b) => a.name.localeCompare(b.name))
    cache.set(workspaceId, items.value)
    return null
  }

  async function rename(id: string, name: string): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase.from('categories').update({ name }).eq('id', id).select().single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(data.workspace_id, items.value)
    return null
  }

  async function setActive(id: string, isActive: boolean): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('categories')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(data.workspace_id, items.value)
    return null
  }

  // The server enforces the max-3-per-type limit (migration 0005) — this
  // just surfaces that as a NivaError instead of a raw Postgres exception.
  async function setFavorite(id: string, isFavorite: boolean): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('categories')
      .update({ is_favorite: isFavorite })
      .eq('id', id)
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(data.workspace_id, items.value)
    return null
  }

  // A category with a parent is a sub-category — see migration 0005.
  // create() always makes a top-level category; this makes one with a
  // parent instead.
  async function createSubcategory(workspaceId: string, name: string, parentCategoryId: string): Promise<NivaError | null> {
    const parent = items.value.find((c) => c.id === parentCategoryId)
    if (!parent) return { code: 'not_found', message: 'That category no longer exists.', retryable: false }

    const { data, error: dbError } = await supabase
      .from('categories')
      .insert({ workspace_id: workspaceId, name, type: parent.type, parent_category_id: parentCategoryId })
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = [...items.value, data].sort((a, b) => a.name.localeCompare(b.name))
    cache.set(workspaceId, items.value)
    return null
  }

  return { items, loading, error, list, create, createSubcategory, rename, setActive, setFavorite }
}

// Pure helpers shared by CategoriesView (admin) and TransactionForm (entry).
// Kept alongside the composable rather than duplicated in both places.

export function topLevelCategories(categories: Category[], type?: TransactionType): Category[] {
  return categories.filter((c) => c.parent_category_id === null && (!type || c.type === type))
}

export function subcategoriesOf(categories: Category[], parentId: string): Category[] {
  return categories.filter((c) => c.parent_category_id === parentId)
}

export function isSubcategory(category: Category): boolean {
  return category.parent_category_id !== null
}
