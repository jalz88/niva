// iCal sync — Housekeeping's "Sync now" button (RoomsView.vue) AND the
// daily automatic sync (pg_cron, see migration notes / docs §11). Fetches
// a room's ical_url, parses booking date ranges into room_bookings
// (migration 0013), and stamps ical_last_synced_at/ical_sync_status.
//
// Two callers, two modes:
//
// 1. Manual, from the browser — Authorization is the signed-in user's own
//    JWT. Body is { room_id }. Every read/write runs under that user's own
//    RLS (no service-role key on this path), so a non-administrator's
//    write to rooms/room_bookings affects 0 rows and gets reported back as
//    a real "not permitted" error rather than a false success — same
//    "permissions enforced in data access" rule as everywhere else.
//
// 2. Automatic, from pg_cron — Authorization is the service role key
//    (stored in Supabase Vault, never in this file or in git). No body is
//    required. There's no signed-in user for a scheduled job to act as, so
//    this mode bypasses RLS on purpose and loops over every
//    linked_to_bookings room across every workspace, syncing each in turn.
//
// Booking dates ARE now something the app acts on: the Staff work
// calendar overlays them so a manager can plan days off around occupancy
// (2026-08-24 ask). Still nothing here changes cleaning cadence/scheduling
// itself — no sop_task cadence type reads room_bookings (yet).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Hosting security review (2026-08-27): this was '*' (any origin). Because
// verify_jwt is on for this function (Supabase platform setting), a forged
// or missing Authorization header never reaches the code below regardless
// of Origin, so '*' wasn't directly exploitable today. Tightened anyway as
// defense-in-depth — the manual-call path (RoomsView.vue's "Sync now")
// only ever runs from niva.h28ha.uk, so there's no legitimate reason for
// any other origin to be allowed to read the response.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://niva.h28ha.uk',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Always HTTP 200 for anything the client should read as a normal outcome
// — the JSON body's `ok` field carries that, not the status code. See the
// note above the (removed) old json() calls this replaced: reserved
// non-200 codes are only for genuine request misuse.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ---- Minimal ICS parsing ---------------------------------------------------
// Just enough RFC5545 to read Airbnb/Agoda-style export calendars: line
// unfolding, VEVENT blocks, DTSTART/DTEND (all-day or timed, any TZID —
// only the date portion is kept, since room_bookings is date-range not
// timestamp-range). Not a general-purpose ICS library on purpose — this
// only needs to answer "which days is this room unavailable."

interface ParsedEvent {
  uid: string | null
  startsOn: string
  endsOn: string
}

function unfoldIcs(text: string): string {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function icsDateToIso(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length < 8) return null
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function parseIcsEvents(text: string): ParsedEvent[] {
  const unfolded = unfoldIcs(text)
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0])
  const events: ParsedEvent[] = []

  for (const block of blocks) {
    let uid: string | null = null
    let startsOn: string | null = null
    let endsOn: string | null = null

    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trim()
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const name = line.slice(0, colonIdx).split(';')[0]
      const value = line.slice(colonIdx + 1)
      if (name === 'UID') uid = value
      else if (name === 'DTSTART') startsOn = icsDateToIso(value)
      // DTEND is the checkout/end day per iCal's all-day convention — kept
      // as-is (not shifted back a day), since checkout day is exactly the
      // day housekeeping cares most about.
      else if (name === 'DTEND') endsOn = icsDateToIso(value)
    }
    if (startsOn && endsOn) events.push({ uid, startsOn, endsOn })
  }
  return events
}

// ---- Per-room sync ----------------------------------------------------------

interface RoomRow {
  id: string
  name: string
  ical_url: string | null
  linked_to_bookings: boolean
}

async function syncOneRoom(supabase: SupabaseClient, room: RoomRow): Promise<{ ok: boolean; eventCount: number; error?: string }> {
  let status: 'ok' | 'error' = 'error'
  let message = ''
  let events: ParsedEvent[] = []

  try {
    const res = await fetch(room.ical_url!, { headers: { 'User-Agent': 'NIVA/1.0 (+housekeeping ical sync)' } })
    if (!res.ok) {
      message = `Calendar host returned ${res.status}.`
    } else {
      const text = await res.text()
      if (!text.includes('BEGIN:VCALENDAR')) {
        message = "That URL didn't return a calendar file (no BEGIN:VCALENDAR)."
      } else {
        events = parseIcsEvents(text)
        status = 'ok'
      }
    }
  } catch (err) {
    message = err instanceof Error ? `Could not reach that URL: ${err.message}` : 'Could not reach that URL.'
  }

  const syncedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from('rooms')
    .update({ ical_last_synced_at: syncedAt, ical_sync_status: status })
    .eq('id', room.id)
    .select('id')
    .maybeSingle()

  if (updateError) return { ok: false, eventCount: 0, error: updateError.message }
  if (!updated) return { ok: false, eventCount: 0, error: 'Only an administrator can sync a room’s calendar.' }

  if (status === 'ok') {
    // No stable diff from an ICS feed (Airbnb doesn't send deltas) — wipe
    // this room's set and reinsert fresh every sync, per migration 0013.
    const { error: deleteError } = await supabase.from('room_bookings').delete().eq('room_id', room.id)
    if (deleteError) return { ok: false, eventCount: 0, error: deleteError.message }

    if (events.length) {
      const { error: insertError } = await supabase.from('room_bookings').insert(
        events.map((e) => ({ room_id: room.id, starts_on: e.startsOn, ends_on: e.endsOn, uid: e.uid, synced_at: syncedAt })),
      )
      if (insertError) return { ok: false, eventCount: 0, error: insertError.message }
    }
  }

  return status === 'ok' ? { ok: true, eventCount: events.length } : { ok: false, eventCount: 0, error: message || 'Sync failed.' }
}

// ---- Request handling -------------------------------------------------------

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)?.role ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Not signed in.' })
  const token = authHeader.replace(/^Bearer\s+/i, '')

  let roomId: string | undefined
  try {
    const body = await req.text()
    roomId = body ? JSON.parse(body)?.room_id : undefined
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const isServiceRole = decodeJwtRole(token) === 'service_role'

  // Cron mode: no room_id, service-role auth — sync every linked room in
  // every workspace. Bypasses RLS on purpose (see file header).
  if (isServiceRole && !roomId) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, name, ical_url, linked_to_bookings')
      .eq('linked_to_bookings', true)
      .eq('is_active', true)
      .not('ical_url', 'is', null)

    if (roomsError) return json({ ok: false, error: roomsError.message })

    const results = []
    for (const room of (rooms ?? []) as RoomRow[]) {
      const result = await syncOneRoom(supabase, room)
      results.push({ roomId: room.id, roomName: room.name, ...result })
    }
    return json({ ok: true, mode: 'cron', synced: results.length, results })
  }

  if (!roomId) return json({ ok: false, error: 'room_id is required.' }, 400)

  // Manual mode: scoped to the calling user via their forwarded JWT — every
  // query runs under that user's RLS, not a service role, even if this
  // happened to be called with a service-role token and an explicit
  // room_id (kept simple: same code path either way, RLS is the boundary).
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, name, ical_url, linked_to_bookings')
    .eq('id', roomId)
    .maybeSingle()

  if (roomError) return json({ ok: false, error: roomError.message })
  if (!room) return json({ ok: false, error: 'Room not found, or you do not have access to it.' })
  if (!room.linked_to_bookings || !room.ical_url) {
    return json({ ok: false, error: 'This room has no calendar URL set.' })
  }

  const result = await syncOneRoom(supabase, room as RoomRow)
  if (!result.ok) return json({ ok: false, error: result.error })
  return json({ ok: true, eventCount: result.eventCount, roomName: room.name })
})
