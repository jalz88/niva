import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { TodayChecklistRow } from '@/types/database'

export interface TodayTask {
  taskId: string
  name: string
  cadence: string
  dueOn: string
  isDone: boolean
  completedBy: string | null
  completedAt: string | null
}

export interface RoomToday {
  roomId: string
  roomName: string
  roomType: string
  linkedToBookings: boolean
  tasks: TodayTask[]
  inspectedBy: string | null
  inspectedAt: string | null
}

function groupRooms(rows: TodayChecklistRow[]): RoomToday[] {
  const byRoom = new Map<string, RoomToday>()
  for (const row of rows) {
    let room = byRoom.get(row.room_id)
    if (!room) {
      room = {
        roomId: row.room_id,
        roomName: row.room_name,
        roomType: row.room_type,
        linkedToBookings: row.linked_to_bookings,
        tasks: [],
        inspectedBy: row.inspected_by,
        inspectedAt: row.inspected_at,
      }
      byRoom.set(row.room_id, room)
    }
    room.tasks.push({
      taskId: row.task_id,
      name: row.task_name,
      cadence: row.cadence_type,
      dueOn: row.due_on,
      isDone: row.is_done,
      completedBy: row.completed_by,
      completedAt: row.completed_at,
    })
  }
  return [...byRoom.values()].sort((a, b) => a.roomName.localeCompare(b.roomName))
}

// Bumped on complete/uncomplete/markInspected — Today and Today's schedule
// both watch this to know when to refetch, same pattern as every other
// composable's revision counter.
const revision = ref(0)

export function useHousekeepingToday() {
  const rooms = ref<RoomToday[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  // p_as_of isn't passed unless given — the RPC defaults to the database
  // server's current_date. Known simplification: for a single property in
  // one timezone this is fine; a true multi-timezone "today" boundary is
  // out of scope until multi-property support is (see 06-development-
  // roadmap.md's deferred items).
  async function load(workspaceId: string, asOf?: string) {
    loading.value = true
    error.value = null

    const { data, error: dbError } = await supabase.rpc('housekeeping_today_checklist', {
      p_workspace_id: workspaceId,
      ...(asOf ? { p_as_of: asOf } : {}),
    })

    loading.value = false
    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    rooms.value = groupRooms((data ?? []) as TodayChecklistRow[])
  }

  // The client only ever sends task_id — room_id, workspace_id, due_on,
  // completed_at, and completed_by are all stamped server-side by
  // set_sop_task_completion_fields (migration 0012), never trusted from
  // client input.
  async function complete(workspaceId: string, taskId: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('sop_task_completions')
      .insert({ workspace_id: workspaceId, task_id: taskId })

    if (dbError) return toNivaError(dbError)
    revision.value++
    return null
  }

  // Deletes today's occurrence's completion row. RLS (migration 0012)
  // allows this for the completing user's own same-day row, or an
  // administrator/manager correcting anyone's — matches the prototype's
  // "confirm before un-ticking someone else's completed task" guard, which
  // the calling view is responsible for showing before calling this.
  async function uncomplete(taskId: string, dueOn: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('sop_task_completions').delete().eq('task_id', taskId).eq('due_on', dueOn)

    if (dbError) return toNivaError(dbError)
    revision.value++
    return null
  }

  // Mom's optional, non-mandatory spot-check — one row per room per day
  // (unique constraint), so calling this twice for the same room/day
  // fails with a conflict rather than silently double-logging.
  async function markInspected(workspaceId: string, roomId: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('room_inspections').insert({ workspace_id: workspaceId, room_id: roomId })

    if (dbError) return toNivaError(dbError)
    revision.value++
    return null
  }

  return { rooms, loading, error, revision, load, complete, uncomplete, markInspected }
}
