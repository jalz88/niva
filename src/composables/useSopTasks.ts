import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { SopTask, SopCadenceType } from '@/types/database'

export interface SopTaskPayload {
  name: string
  cadenceType: SopCadenceType
  cadenceDayOfWeek: number | null
  cadenceDayOfMonth: number | null
}

function toDbFields(roomId: string, payload: SopTaskPayload) {
  return {
    room_id: roomId,
    name: payload.name,
    cadence_type: payload.cadenceType,
    cadence_day_of_week: payload.cadenceDayOfWeek,
    cadence_day_of_month: payload.cadenceDayOfMonth,
  }
}

// Bumped on create/update/archive.
const revision = ref(0)

// Cached per room, not per workspace — the Room detail screen is the only
// place this list is read, and always for one room at a time.
const cache = new Map<string, SopTask[]>()

export function useSopTasks() {
  const items = ref<SopTask[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(roomId: string) {
    const cached = cache.get(roomId)
    if (cached) {
      items.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    const { data, error: dbError } = await supabase
      .from('sop_tasks')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_active', true)
      .order('cadence_type')
      .order('name')

    loading.value = false
    if (dbError) {
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    items.value = data
    cache.set(roomId, data)
  }

  async function create(workspaceId: string, roomId: string, payload: SopTaskPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('sop_tasks')
      .insert({ workspace_id: workspaceId, ...toDbFields(roomId, payload) })

    if (dbError) return toNivaError(dbError)
    cache.delete(roomId)
    revision.value++
    return null
  }

  async function update(id: string, roomId: string, payload: SopTaskPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('sop_tasks').update(toDbFields(roomId, payload)).eq('id', id)

    if (dbError) return toNivaError(dbError)
    cache.delete(roomId)
    revision.value++
    return null
  }

  // "Delete this task" archives it — sop_task_completions.task_id keeps
  // referencing it (no cascade), so history stays intact even after a task
  // is retired from the active checklist.
  async function archive(id: string, roomId: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('sop_tasks').update({ is_active: false }).eq('id', id)

    if (dbError) return toNivaError(dbError)
    cache.delete(roomId)
    revision.value++
    return null
  }

  return { items, loading, error, revision, list, create, update, archive }
}
