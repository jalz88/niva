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

  return { items, loading, error, list, create, rename, setActive }
}
