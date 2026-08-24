// Manual iCal sync — Housekeeping's "Sync now" button (RoomsView.vue).
// Fetches a room's ical_url, does a minimal sanity check that it's really
// an ICS calendar, and stamps ical_last_synced_at/ical_sync_status.
//
// This is deliberately NOT the daily automatic sync described in
// docs/07-domain-model-and-schema.md §11 ("once a day, ~1am property-
// local") — that still needs a pg_cron or Cron Trigger wired up separately.
// This is the manual "test my URL right now" button Jalie asked for
// 2026-08-24 after adding real Airbnb calendar URLs to three rooms.
//
// Deliberately does NOT parse booking dates into anything the app acts on
// yet (no cadence type consumes booking data — see schema doc §11, "a
// room's booking dates feed its cleaning schedule via the iCal sync" is
// still aspirational). This only proves the URL is reachable and looks
// like a real calendar, and reports how many events it found.
//
// Authorization: no service-role key here on purpose. The incoming
// request's own JWT is forwarded to a Supabase client, so every read and
// write below runs under the calling user's RLS — same "permissions
// enforced in data access, not just navigation" rule as everywhere else.
// rooms_select allows any workspace member to look up the room; rooms_update
// is administrator-only (migration 0012), so a non-administrator's update
// affects 0 rows and this function reports that back as a real error
// rather than a false "synced" success.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Always HTTP 200 for anything the client should read as a normal outcome
// (including "not authorized," "no URL set," "sync failed") — the JSON
// body's `ok` field carries that, not the status code. supabase-js's
// functions.invoke() otherwise treats non-2xx as a thrown FunctionsHttpError
// and buries the real message in `error.context`, which would mean two
// different error-reading code paths on the client for no benefit. Reserved
// non-200 codes are for genuine request misuse (wrong method, unparsable
// body) that the real client should never actually trigger.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Not signed in.' })

  let roomId: string | undefined
  try {
    const body = await req.json()
    roomId = body?.room_id
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }
  if (!roomId) return json({ ok: false, error: 'room_id is required.' }, 400)

  // Scoped to the calling user via their forwarded JWT — every query below
  // runs under that user's RLS, not a service role.
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

  let status: 'ok' | 'error' = 'error'
  let message = ''
  let eventCount = 0

  try {
    const res = await fetch(room.ical_url, { headers: { 'User-Agent': 'NIVA/1.0 (+housekeeping ical sync)' } })
    if (!res.ok) {
      message = `Calendar host returned ${res.status}.`
    } else {
      const text = await res.text()
      if (!text.includes('BEGIN:VCALENDAR')) {
        message = "That URL didn't return a calendar file (no BEGIN:VCALENDAR)."
      } else {
        eventCount = (text.match(/BEGIN:VEVENT/g) ?? []).length
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
    .eq('id', roomId)
    .select('id')
    .maybeSingle()

  if (updateError) return json({ ok: false, error: updateError.message })
  if (!updated) {
    // RLS silently allowed 0 rows to update — the caller isn't an
    // administrator. Report that plainly instead of a false success.
    return json({ ok: false, error: 'Only an administrator can sync a room’s calendar.' })
  }

  if (status === 'error') {
    return json({ ok: false, error: message || 'Sync failed.', syncedAt, status })
  }
  return json({ ok: true, eventCount, syncedAt, status, roomName: room.name })
})
