import { ref, computed } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { Role } from '@/types/database'

const session = ref<Session | null>(null)
const currentRole = ref<Role | null>(null)
const currentWorkspaceId = ref<string | null>(null)
const currentDisplayName = ref<string | null>(null)
const ready = ref(false)

async function loadMembership(user: User) {
  // Release 1 assumes one active workspace per session — see
  // docs/10-api-data-access-spec.md §2 "Workspace and membership".
  const { data, error } = await supabase
    .from('workspace_memberships')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    currentRole.value = null
    currentWorkspaceId.value = null
    return
  }

  currentRole.value = data.role as Role
  currentWorkspaceId.value = data.workspace_id
}

async function loadProfile(user: User) {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  // handle_new_user (migration 0003) defaults display_name to the email
  // address — treat that as "no real name set yet" so the UI can prompt
  // for one instead of silently showing an email where a name belongs.
  currentDisplayName.value = data?.display_name && data.display_name !== user.email ? data.display_name : null
}

// Shared across every useAuth() call so concurrent callers (the router
// guard, composables mounting on the same tick) await the same resolution
// instead of racing separate session lookups.
let initPromise: Promise<void> | null = null

function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (data.session?.user) {
        await Promise.all([loadMembership(data.session.user), loadProfile(data.session.user)])
      }
      ready.value = true

      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        session.value = newSession
        if (newSession?.user) {
          await Promise.all([loadMembership(newSession.user), loadProfile(newSession.user)])
        } else {
          currentRole.value = null
          currentWorkspaceId.value = null
          currentDisplayName.value = null
        }
      })
    })()
  }
  return initPromise
}

async function signIn(email: string, password: string): Promise<NivaError | null> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return toNivaError(error)

  // Set state directly from this call's own result rather than waiting on
  // the onAuthStateChange listener below. That listener fires
  // asynchronously and isn't guaranteed to land before SignInView's
  // router.push({ name: 'dashboard' }) runs right after signIn() resolves.
  // When it lost that race, the router guard read a still-stale
  // isAuthenticated === false and silently bounced back to sign-in with no
  // error — fixed by a manual refresh only because a full reload re-reads
  // the real persisted session from scratch instead of trusting reactive
  // state that hadn't caught up yet. Setting it here makes signIn() always
  // resolve with fully-correct state, so the guard can never lose that race.
  session.value = data.session
  if (data.session?.user) {
    await Promise.all([loadMembership(data.session.user), loadProfile(data.session.user)])
  }
  return null
}

async function signOut() {
  await supabase.auth.signOut()
  // Same reasoning as signIn() above, in reverse: clear state directly
  // instead of only waiting on the listener, so a navigation immediately
  // after signOut() can't read a stale isAuthenticated === true.
  session.value = null
  currentRole.value = null
  currentWorkspaceId.value = null
  currentDisplayName.value = null
}

// Self-service rename — profiles_update RLS allows updating your own row
// (id = auth.uid()). An administrator renaming someone *else* goes through
// useMembers.updateDisplayName instead, which relies on the separate
// profiles_update_by_admin policy from migration 0006.
async function updateDisplayName(name: string): Promise<NivaError | null> {
  const user = session.value?.user
  if (!user) return { code: 'unknown_error', message: 'Not signed in.', retryable: false }

  const trimmed = name.trim()
  const { error } = await supabase.from('profiles').update({ display_name: trimmed || null }).eq('id', user.id)
  if (error) return toNivaError(error)

  currentDisplayName.value = trimmed && trimmed !== user.email ? trimmed : null
  return null
}

export function useAuth() {
  init()
  return {
    session,
    user: computed(() => session.value?.user ?? null),
    isAuthenticated: computed(() => !!session.value),
    role: currentRole,
    workspaceId: currentWorkspaceId,
    /** null until a real name (distinct from the email fallback) is set. */
    displayName: currentDisplayName,
    /** True once the initial session + membership lookup has resolved. */
    ready,
    /** Resolves once session + membership are loaded — await this before
     * making a workspace-scoped query, rather than guessing with a timer. */
    ensureReady: init,
    signIn,
    signOut,
    updateDisplayName,
  }
}
