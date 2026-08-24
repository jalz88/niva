import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { Room, RoomType } from '@/types/database'

export interface RoomPayload {
  propertyId: string
  name: string
  roomType: RoomType
  linkedToBookings: boolean
  icalUrl?: string | null
}

function toDbFields(payload: RoomPayload) {
  return {
    property_id: payload.propertyId,
    name: payload.name,
    room_type: payload.roomType,
    linked_to_bookings: payload.linkedToBookings,
    // The rooms_ical_url_requires_link check constraint (migration 0012)
    // rejects a non-null URL on a room that isn't linked — clear it here
    // too so a toggled-off room never even attempts the write.
    ical_url: payload.linkedToBookings ? payload.icalUrl || null : null,
  }
}

// Bumped on create/update/archive — same pattern as every other composable
// with a revision counter (useTransactions.ts, useRecurringPayments.ts).
const revision = ref(0)

// Session-scoped cache, same reasoning as useConfigItems.ts.
const cache = new Map<string, Room[]>()

export function useRooms() {
  const items = ref<Room[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cached = cache.get(workspaceId)
    if (cached) {
      items.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    const { data, error: dbError } = await supabase
      .from('rooms')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name')

    loading.value = false
    if (dbError) {
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    items.value = data
    cache.set(workspaceId, data)
  }

  async function create(workspaceId: string, payload: RoomPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('rooms').insert({ workspace_id: workspaceId, ...toDbFields(payload) })

    if (dbError) return toNivaError(dbError)
    cache.delete(workspaceId)
    revision.value++
    return null
  }

  async function update(id: string, workspaceId: string, payload: RoomPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('rooms').update(toDbFields(payload)).eq('id', id)

    if (dbError) return toNivaError(dbError)
    cache.delete(workspaceId)
    revision.value++
    return null
  }

  // "Delete this room" in the UI archives it — a hard delete would be
  // blocked at the FK level anyway once it has any sop_tasks (docs §6),
  // same defence-in-depth as every other configuration table.
  async function setActive(id: string, workspaceId: string, isActive: boolean): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('rooms').update({ is_active: isActive }).eq('id', id)

    if (dbError) return toNivaError(dbError)
    cache.delete(workspaceId)
    revision.value++
    return null
  }

  // Manual "Sync now" (2026-08-24) — calls the sync-room-ical Edge Function,
  // which fetches ical_url server-side (browsers can't reliably fetch
  // cross-origin .ics files, and this keeps the write server-authorized
  // under the calling user's own RLS rather than trusting client input).
  // There's no automatic daily sync yet — see docs §11.
  async function syncIcal(roomId: string, workspaceId: string): Promise<{ ok: boolean; eventCount?: number; error?: string }> {
    const { data, error: fnError } = await supabase.functions.invoke<{ ok: boolean; eventCount?: number; error?: string }>('sync-room-ical', {
      body: { room_id: roomId },
    })
    // Refetch regardless of outcome — ical_last_synced_at/ical_sync_status
    // may have been stamped even on a failed sync (a bad URL still counts
    // as "checked, and it failed"), same as every other mutation here.
    cache.delete(workspaceId)
    revision.value++
    if (fnError) return { ok: false, error: fnError.message }
    if (!data) return { ok: false, error: 'No response from sync.' }
    return data
  }

  return { items, loading, error, revision, list, create, update, archive: (id: string, w: string) => setActive(id, w, false), syncIcal }
}
