import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'

export interface WorkspaceCurrencyRow {
  code: string
  name: string
  enabled: boolean
  isDefault: boolean
  // Manually maintained, used only for the Dashboard/Reports "approximate
  // combined total" line — see migration 0010. Always null for the default
  // currency itself (it doesn't need converting into itself) and for any
  // currency an administrator hasn't set a rate for yet.
  referenceRateToDefault: number | null
  referenceRateUpdatedAt: string | null
}

// Session-scoped cache — see useConfigItems.ts for why.
const cache = new Map<string, WorkspaceCurrencyRow[]>()

export function useCurrencies() {
  const rows = ref<WorkspaceCurrencyRow[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cached = cache.get(workspaceId)
    if (cached) {
      rows.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    const [allCurrencies, enabled] = await Promise.all([
      supabase.from('iso_currencies').select('code, name').order('code'),
      supabase
        .from('workspace_currencies')
        .select('currency_code, is_active, is_default, reference_rate_to_default, reference_rate_updated_at')
        .eq('workspace_id', workspaceId),
    ])

    loading.value = false
    if (allCurrencies.error) {
      if (!cached) error.value = toNivaError(allCurrencies.error)
      return
    }
    if (enabled.error) {
      if (!cached) error.value = toNivaError(enabled.error)
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
        referenceRateToDefault: match?.reference_rate_to_default != null ? Number(match.reference_rate_to_default) : null,
        referenceRateUpdatedAt: match?.reference_rate_updated_at ?? null,
      }
    })
    cache.set(workspaceId, rows.value)
  }

  async function enable(workspaceId: string, code: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('workspace_currencies')
      .upsert({ workspace_id: workspaceId, currency_code: code, is_active: true }, { onConflict: 'workspace_id,currency_code' })

    if (dbError) return toNivaError(dbError)
    rows.value = rows.value.map((r) => (r.code === code ? { ...r, enabled: true } : r))
    cache.set(workspaceId, rows.value)
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
    cache.set(workspaceId, rows.value)
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
    cache.set(workspaceId, rows.value)
    return null
  }

  // rate is "1 unit of `code` equals `rate` units of the workspace default
  // currency" — e.g. if LKR is default and USD is 300, USD 10 ≈ LKR 3,000.
  // Only meaningful for non-default currencies; the caller (Currencies
  // admin screen) doesn't offer this field for the default row.
  async function setReferenceRate(workspaceId: string, code: string, rate: number): Promise<NivaError | null> {
    const now = new Date().toISOString()
    const { error: dbError } = await supabase
      .from('workspace_currencies')
      .update({ reference_rate_to_default: rate, reference_rate_updated_at: now })
      .eq('workspace_id', workspaceId)
      .eq('currency_code', code)

    if (dbError) return toNivaError(dbError)
    rows.value = rows.value.map((r) =>
      r.code === code ? { ...r, referenceRateToDefault: rate, referenceRateUpdatedAt: now } : r,
    )
    cache.set(workspaceId, rows.value)
    return null
  }

  return { rows, loading, error, list, enable, disable, setDefault, setReferenceRate }
}
