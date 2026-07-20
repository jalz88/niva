import { ref, computed } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { Role } from '@/types/database'

const session = ref<Session | null>(null)
const currentRole = ref<Role | null>(null)
const currentWorkspaceId = ref<string | null>(null)
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

// Shared across every useAuth() call so concurrent callers (the router
// guard, composables mounting on the same tick) await the same resolution
// instead of racing separate session lookups.
let initPromise: Promise<void> | null = null

function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (data.session?.user) await loadMembership(data.session.user)
      ready.value = true

      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        session.value = newSession
        if (newSession?.user) {
          await loadMembership(newSession.user)
        } else {
          currentRole.value = null
          currentWorkspaceId.value = null
        }
      })
    })()
  }
  return initPromise
}

async function signIn(email: string, password: string): Promise<NivaError | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? toNivaError(error) : null
}

async function signOut() {
  await supabase.auth.signOut()
}

export function useAuth() {
  init()
  return {
    session,
    user: computed(() => session.value?.user ?? null),
    isAuthenticated: computed(() => !!session.value),
    role: currentRole,
    workspaceId: currentWorkspaceId,
    /** True once the initial session + membership lookup has resolved. */
    ready,
    /** Resolves once session + membership are loaded — await this before
     * making a workspace-scoped query, rather than guessing with a timer. */
    ensureReady: init,
    signIn,
    signOut,
  }
}
