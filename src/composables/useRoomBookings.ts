import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { RoomBooking } from '@/types/database'

// Read-only from the client — every row is written server-side by the
// sync-room-ical Edge Function (manual "Sync now" or the daily cron), per
// migration 0013. Backs the Staff work calendar's booked-day overlay
// (2026-08-24 ask): "if any linked room is booked, show it, so a manager
// can plan days off around occupancy" — independent of which worker is
// selected, since it's about the property, not the person.
export function useRoomBookings() {
  const items = ref<RoomBooking[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  // Every booking overlapping [rangeStart, rangeEnd] in one query — a
  // booking that starts before the visible month but ends inside it (or
  // vice versa) still needs to show up.
  async function load(workspaceId: string, rangeStart: string, rangeEnd: string) {
    loading.value = true
    error.value = null

    const { data, error: dbError } = await supabase
      .from('room_bookings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .lte('starts_on', rangeEnd)
      .gte('ends_on', rangeStart)

    loading.value = false
    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    items.value = data
  }

  function isBooked(dateIso: string): boolean {
    return items.value.some((b) => b.starts_on <= dateIso && dateIso <= b.ends_on)
  }

  return { items, loading, error, load, isBooked }
}
