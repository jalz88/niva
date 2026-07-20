import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'

export interface WorkspaceCurrencyRow {
  code: string
  name: string
  enabled: boolean
  isDefault: boolean
}

export function useCurrencies() {
  const rows = ref<WorkspaceCurrencyRow[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    loading.value = true
    error.value = null

    const [allCurrencies, enabled] = await Promise.all([
      supabase.from('iso_currencies').select('code, name').order('code'),
      supabase.from('workspace_currencies').select('currency_code, is_active, is_default').eq('workspace_id', workspaceId),
    ])

    loading.value = false
    if (allCurrencies.error) {
      error.value = toNivaError(allCurrencies.error)
      return
    }
    if (enabled.error) {
      error.value = toNivaError(enabled.error)
      return
    }

    const enabledByCode = new Map(enabled.data.map((row) => [row.currency_code, row]))
    rows.value = allCurrencies.data.map((c) => {
      const match = enabledByCode.get(c.code)
      return {
        code: c.code,
        name: c.name,
        enabled: match?.is_active ?? false,
        isDefault: match?.is_default ?? false,
      }
    })
  }

  async function enable(workspaceId: string, code: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('workspace_currencies')
      .upsert({ workspace_id: workspaceId, currency_code: code, is_active: true }, { onConflict: 'workspace_id,currency_code' })

    if (dbError) return toNivaError(dbError)
    rows.value = rows.value.map((r) => (r.code === code ? { ...r, enabled: true } : r))
    return null
  }

  async function disable(workspaceId: string, code: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('workspace_currencies')
      .update({ is_active: false })
      .eq('workspace_id', workspaceId)
      .eq('currency_code', code)

    if (dbError) return toNivaError(dbError)
    rows.value = rows.value.map((r) => (r.code === code ? { ...r, enabled: false } : r))
    return null
  }

  // Atomic swap via RPC — see migration 0002 for why this can't just be a
  // plain client-side update of two rows.
  async function setDefault(workspaceId: string, code: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase.rpc('set_default_workspace_currency', {
      target_workspace: workspaceId,
      target_currency: code,
    })

    if (dbError) return toNivaError(dbError)
    rows.value = rows.value.map((r) => ({ ...r, isDefault: r.code === code, enabled: r.enabled || r.code === code }))
    return null
  }

  return { rows, loading, error, list, enable, disable, setDefault }
}
