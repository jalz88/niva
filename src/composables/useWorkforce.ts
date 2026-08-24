import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { WorkforceMember, WorkforceDayOff, RoomAssignment, CrewRole } from '@/types/database'

export interface WorkforceMemberPayload {
  name: string
  crewRole: CrewRole
  isActive: boolean
  membershipId: string | null
  recurringPaymentId: string | null
}

function toDbFields(payload: WorkforceMemberPayload) {
  return {
    name: payload.name,
    crew_role: payload.crewRole,
    is_active: payload.isActive,
    membership_id: payload.membershipId,
    recurring_payment_id: payload.recurringPaymentId,
  }
}

// Bumped on any mutation across members/days-off/assignments.
const revision = ref(0)

const membersCache = new Map<string, WorkforceMember[]>()

export function useWorkforce() {
  const members = ref<WorkforceMember[]>([])
  const daysOff = ref<WorkforceDayOff[]>([])
  const assignments = ref<RoomAssignment[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  async function list(workspaceId: string) {
    const cached = membersCache.get(workspaceId)
    if (cached) {
      members.value = cached
      loading.value = false
    } else {
      loading.value = true
    }
    error.value = null

    // Ordered by created_at, not name — this order is what the round-robin
    // assignment below distributes rooms across, so it needs to be stable
    // and deterministic across every device rather than alphabetical.
    const { data, error: dbError } = await supabase
      .from('workforce_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at')

    loading.value = false
    if (dbError) {
      if (!cached) error.value = toNivaError(dbError)
      return
    }
    members.value = data
    membersCache.set(workspaceId, data)
  }

  async function create(workspaceId: string, payload: WorkforceMemberPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('workforce_members')
      .insert({ workspace_id: workspaceId, ...toDbFields(payload) })

    if (dbError) return toNivaError(dbError)
    membersCache.delete(workspaceId)
    revision.value++
    return null
  }

  async function update(id: string, workspaceId: string, payload: WorkforceMemberPayload): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('workforce_members').update(toDbFields(payload)).eq('id', id)

    if (dbError) return toNivaError(dbError)
    membersCache.delete(workspaceId)
    revision.value++
    return null
  }

  // The prototype's "Remove from staff" button — deactivates rather than
  // hard-deletes. A hard delete would be blocked at the FK level anyway
  // once the person has any days-off history or room assignments (no
  // cascade on those references), same defence-in-depth as every other
  // configuration table.
  async function setActive(id: string, workspaceId: string, isActive: boolean): Promise<NivaError | null> {
    const { error: dbError } = await supabase.from('workforce_members').update({ is_active: isActive }).eq('id', id)

    if (dbError) return toNivaError(dbError)
    membersCache.delete(workspaceId)
    revision.value++
    return null
  }

  // ---- Days off ---------------------------------------------------------
  //
  // Loads every member's days off within a date range in one query (used
  // both to render a selected member's month calendar and, combined with
  // members above, to compute who's on shift for round-robin assignment)
  // rather than one query per member.
  async function loadDaysOff(workspaceId: string, rangeStart: string, rangeEnd: string) {
    const { data, error: dbError } = await supabase
      .from('workforce_days_off')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('day_off', rangeStart)
      .lte('day_off', rangeEnd)

    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    daysOff.value = data
  }

  function isOff(workforceMemberId: string, dateIso: string): boolean {
    return daysOff.value.some((d) => d.workforce_member_id === workforceMemberId && d.day_off === dateIso)
  }

  // Tap a day to mark it worked or off — no reason/type field, explicitly
  // ruled out (docs §3 workforce_days_off).
  async function toggleDayOff(workspaceId: string, workforceMemberId: string, dateIso: string): Promise<NivaError | null> {
    if (isOff(workforceMemberId, dateIso)) {
      const { error: dbError } = await supabase
        .from('workforce_days_off')
        .delete()
        .eq('workforce_member_id', workforceMemberId)
        .eq('day_off', dateIso)
      if (dbError) return toNivaError(dbError)
      daysOff.value = daysOff.value.filter((d) => !(d.workforce_member_id === workforceMemberId && d.day_off === dateIso))
    } else {
      const { data, error: dbError } = await supabase
        .from('workforce_days_off')
        .insert({ workspace_id: workspaceId, workforce_member_id: workforceMemberId, day_off: dateIso })
        .select()
        .single()
      if (dbError) return toNivaError(dbError)
      daysOff.value = [...daysOff.value, data]
    }
    revision.value++
    return null
  }

  // ---- Room assignment ----------------------------------------------------
  //
  // Only manual overrides live in room_assignments — the default
  // round-robin below is computed client-side and needs no row at all for
  // an un-reassigned day (docs §3).

  async function loadAssignments(workspaceId: string, dateIso: string) {
    const { data, error: dbError } = await supabase
      .from('room_assignments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('assigned_on', dateIso)

    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    assignments.value = data
  }

  // Upsert on (room_id, assigned_on) — reassigning the same room on the
  // same day again just replaces who it's pointed at.
  async function setAssignment(
    workspaceId: string,
    roomId: string,
    dateIso: string,
    workforceMemberId: string,
  ): Promise<NivaError | null> {
    const { data, error: dbError } = await supabase
      .from('room_assignments')
      .upsert(
        { workspace_id: workspaceId, room_id: roomId, assigned_on: dateIso, workforce_member_id: workforceMemberId },
        { onConflict: 'room_id,assigned_on' },
      )
      .select()
      .single()

    if (dbError) return toNivaError(dbError)
    assignments.value = [...assignments.value.filter((a) => a.room_id !== roomId), data]
    revision.value++
    return null
  }

  // Reverts a room, that day, back to the computed default.
  async function clearAssignment(roomId: string, dateIso: string): Promise<NivaError | null> {
    const { error: dbError } = await supabase
      .from('room_assignments')
      .delete()
      .eq('room_id', roomId)
      .eq('assigned_on', dateIso)

    if (dbError) return toNivaError(dbError)
    assignments.value = assignments.value.filter((a) => a.room_id !== roomId)
    revision.value++
    return null
  }

  // Active Housekeepers not off on dateIso, distributed across dueRoomIds
  // by index modulo — manual overrides (already loaded into `assignments`)
  // take precedence. Pure function of already-loaded state, so it stays in
  // sync across every device without a dedicated RPC: any client with the
  // same members/daysOff/assignments data computes the same result.
  function computeAssignments(dueRoomIds: string[], dateIso: string): Record<string, string | undefined> {
    const onShift = members.value.filter((m) => m.crew_role === 'housekeeper' && m.is_active && !isOff(m.id, dateIso))
    const overrideByRoom = new Map(assignments.value.map((a) => [a.room_id, a.workforce_member_id]))
    const result: Record<string, string | undefined> = {}
    if (!onShift.length) return result
    dueRoomIds.forEach((roomId, i) => {
      // Non-null: the `!onShift.length` guard above means this index is
      // always in range — TS's noUncheckedIndexedAccess can't see that.
      result[roomId] = overrideByRoom.get(roomId) ?? onShift[i % onShift.length]!.id
    })
    return result
  }

  return {
    members,
    daysOff,
    assignments,
    loading,
    error,
    revision,
    list,
    create,
    update,
    setActive,
    loadDaysOff,
    isOff,
    toggleDayOff,
    loadAssignments,
    setAssignment,
    clearAssignment,
    computeAssignments,
  }
}
