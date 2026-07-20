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

export function useConfigItems(table: ConfigTable) {
  const items = ref<ConfigItem[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    loading.value = true
    error.value = null
    const { data, error: dbError } = await supabase
      .from(table)
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name')

    loading.value = false
    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    items.value = data
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
    return null
  }

  async function rename(id: string, name: string): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase.from(table).update({ name }).eq('id', id).select().single()

    if (dbError) return toNivaError(dbError)
    items.value = items.value.map((item) => (item.id === id ? data : item))
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
    return null
  }

  return { items, loading, error, list, create, rename, setActive }
}
