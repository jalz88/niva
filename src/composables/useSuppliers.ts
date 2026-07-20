import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'

// There is no Administration screen for suppliers by design (see
// 00-project-blueprint.md §5) — the expense form collects a plain name and
// this resolves it to a row, creating one if it doesn't exist yet.
export function useSuppliers() {
  async function findOrCreate(workspaceId: string, name: string): Promise<{ id: string | null; error: NivaError | null }> {
    const trimmed = name.trim()
    if (!trimmed) return { id: null, error: null }

    const existing = await supabase
      .from('suppliers')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('name', trimmed)
      .maybeSingle()

    if (existing.error) return { id: null, error: toNivaError(existing.error) }
    if (existing.data) return { id: existing.data.id, error: null }

    const created = await supabase
      .from('suppliers')
      .insert({ workspace_id: workspaceId, name: trimmed })
      .select('id')
      .single()

    if (created.error) return { id: null, error: toNivaError(created.error) }
    return { id: created.data.id, error: null }
  }

  return { findOrCreate }
}
