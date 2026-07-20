import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { PaymentMethod } from '@/types/database'

// Payment methods used to be handled by the generic useConfigItems('payment_methods')
// factory alongside properties/platforms. Split into its own composable once
// is_favorite was added (2026-07-20) — properties/platforms don't have that
// column, so keeping payment methods in the shared factory would have meant
// a union type lying about fields that don't exist on every member.
// Session-scoped cache — see useConfigItems.ts for why.
const cache = new Map<string, PaymentMethod[]>()

export function usePaymentMethods() {
  const items = ref<PaymentMethod[]>([])
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
      .from('payment_methods')
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

  async function create(workspaceId: string, name: string): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('payment_methods')
      .insert({ workspace_id: workspaceId, name })
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = [...items.value, data].sort((a, b) => a.name.localeCompare(b.name))
    cache.set(workspaceId, items.value)
    return null
  }

  async function rename(id: string, name: string): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase.from('payment_methods').update({ name }).eq('id', id).select().single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(data.workspace_id, items.value)
    return null
  }

  async function setActive(id: string, isActive: boolean): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('payment_methods')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(data.workspace_id, items.value)
    return null
  }

  // Server enforces the max-3 limit (migration 0005) — this surfaces that
  // as a NivaError instead of a raw Postgres exception.
  async function setFavorite(id: string, isFavorite: boolean): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('payment_methods')
      .update({ is_favorite: isFavorite })
      .eq('id', id)
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(data.workspace_id, items.value)
    return null
  }

  return { items, loading, error, list, create, rename, setActive, setFavorite }
}
