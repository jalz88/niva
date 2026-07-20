import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { Role } from '@/types/database'

export interface MemberRow {
  membershipId: string
  userId: string
  email: string | null
  displayName: string | null
  role: Role
}

// Session-scoped cache — see useConfigItems.ts for why.
const cache = new Map<string, MemberRow[]>()

export function useMembers() {
  const members = ref<MemberRow[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cached = cache.get(workspaceId)
    if (cached) {
      members.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    // workspace_memberships and profiles both reference auth.users
    // independently (no direct FK between them), so PostgREST can't embed
    // this join automatically — fetch and merge client-side instead.
    const membershipResult = await supabase
      .from('workspace_memberships')
      .select('id, user_id, role')
      .eq('workspace_id', workspaceId)
      .order('role')

    if (membershipResult.error) {
      loading.value = false
      if (!cached) error.value = toNivaError(membershipResult.error)
      return
    }

    const userIds = membershipResult.data.map((m) => m.user_id)
    const profilesResult = userIds.length
      ? await supabase.from('profiles').select('id, email, display_name').in('id', userIds)
      : { data: [], error: null }

    loading.value = false
    if (profilesResult.error) {
      if (!cached) error.value = toNivaError(profilesResult.error)
      return
    }

    const profileById = new Map(profilesResult.data.map((p) => [p.id, p]))
    members.value = membershipResult.data.map((m) => ({
      membershipId: m.id,
      userId: m.user_id,
      role: m.role as Role,
      email: profileById.get(m.user_id)?.email ?? null,
      displayName: profileById.get(m.user_id)?.display_name ?? null,
    }))
    cache.set(workspaceId, members.value)
  }

  async function updateRole(membershipId: string, role: Role): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('workspace_memberships')
      .update({ role })
      .eq('id', membershipId)
      .select('id, role, workspace_id')
      .single()

    if (dbError) return toNivaError(dbError)
    members.value = members.value.map((m) => (m.membershipId === membershipId ? { ...m, role: data.role as Role } : m))
    cache.set(data.workspace_id, members.value)
    return null
  }

  // The added user must already have a Supabase Auth account (created via
  // the Supabase dashboard — there is no self-serve signup by design, see
  // 00-project-blueprint.md §10). The administrator pastes that user's ID.
  async function addByUserId(workspaceId: string, userId: string, role: Role): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('workspace_memberships')
      .insert({ workspace_id: workspaceId, user_id: userId, role })

    if (dbError) return toNivaError(dbError)
    await list(workspaceId)
    return null
  }

  async function remove(workspaceId: string, membershipId: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('workspace_memberships').delete().eq('id', membershipId)

    if (dbError) return toNivaError(dbError)
    members.value = members.value.filter((m) => m.membershipId !== membershipId)
    cache.set(workspaceId, members.value)
    return null
  }

  return { members, loading, error, list, updateRole, addByUserId, remove }
}
