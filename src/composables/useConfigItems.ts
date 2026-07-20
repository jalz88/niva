import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { Property, Platform, PaymentMethod } from '@/types/database'

// properties, platforms, and payment_methods share the exact same shape in
// the schema (docs/07-domain-model-and-schema.md §3 "Configuration
// tables") — one composable factory covers all three rather than repeating
// the same list/create/rename/archive logic per entity.
type ConfigTable = 'properties' | 'platforms' | 'payment_methods'
type ConfigItem = Property | Platform | PaymentMethod

// Session-scoped cache, keyed by `${table}:${workspaceId}`. Without this,
// every navigation into a screen re-fetches from empty and flashes the
// loading skeleton, even seconds after the same data was already shown —
// that's what read as "glitchy" when clicking between admin screens.
// First visit still shows the skeleton; repeat visits show cached data
// immediately and revalidate silently in the background.
const cache = new Map<string, ConfigItem[]>()

export function useConfigItems(table: ConfigTable) {
  const items = ref<ConfigItem[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cacheKey = `${table}:${workspaceId}`
    const cached = cache.get(cacheKey)

    if (cached) {
      items.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    const { data, error: dbError } = await supabase
      .from(table)
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name')

    loading.value = false
    if (dbError) {
      // A background revalidation failure shouldn't blank out data the
      // user can already see — only surface the error if there was
      // nothing cached to fall back on.
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    items.value = data
    cache.set(cacheKey, data)
  }

  async function create(workspaceId: string, name: string): Promise<NivaError | null> {
    // created_by/updated_by are stamped server-side by the
    // set_audit_fields trigger — see migration 0002.
    const { data, error: dbError } = await supabase
      .from(table)
      .insert({ workspace_id: workspaceId, name })
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = [...items.value, data].sort((a, b) => a.name.localeCompare(b.name))
    cache.set(`${table}:${workspaceId}`, items.value)
    return null
  }

  async function rename(id: string, name: string): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase.from(table).update({ name }).eq('id', id).select().single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(`${table}:${data.workspace_id}`, items.value)
    return null
  }

  async function setActive(id: string, isActive: boolean): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from(table)
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
    cache.set(`${table}:${data.workspace_id}`, items.value)
    return null
  }

  return { items, loading, error, list, create, rename, setActive }
}
