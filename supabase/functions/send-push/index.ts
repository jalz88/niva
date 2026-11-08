// Daily Web Push sender. Called once each morning by pg_cron (service role
// key as bearer, from Vault) — never by a browser.
//
// Auth: verify_jwt is ON (the platform checks the JWT signature), and the
// function additionally requires the token's role claim to be service_role, so a
// signed-in user's own JWT passes the platform check but cannot trigger a send.
// (Same pattern as sync-room-ical. Comparing against the SUPABASE_SERVICE_ROLE_KEY
// env var instead failed 2026-11-08: the Vault key and the env key are different
// strings for the same role.)
//
// Body (all optional): { dry_run?: boolean, only_user_id?: string, test?: boolean }
//   dry_run — compute who would get what, send nothing.
//   test    — send a fixed "test" notification to only_user_id's devices.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { housekeepingMessage, paymentsMessage, type Digest, type Locale, type PushMessage } from './messages.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@h28ha.uk'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).role ?? null
  } catch {
    return null
  }
}

// Sri Lanka is UTC+05:30 with no DST; the job fires at 02:30 UTC = 08:00 local,
// but compute "today" in Sri Lanka explicitly so a late/early run is still right.
function sriLankaToday(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (jwtRole(bearer) !== 'service_role') return json({ error: 'unauthorized' }, 401)
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: 'vapid_not_configured' }, 500)

  let opts: { dry_run?: boolean; only_user_id?: string; test?: boolean } = {}
  try {
    opts = await req.json()
  } catch {
    // empty body is fine
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const today = sriLankaToday()

  const { data: digests, error: digestError } = await db.rpc('push_daily_digest', { p_as_of: today })
  if (digestError) return json({ error: 'digest_failed', detail: digestError.message }, 500)
  const digestByWs = new Map<string, Digest>((digests ?? []).map((r: Digest & { workspace_id: string }) => [r.workspace_id, r]))

  let subQuery = db.from('push_subscriptions').select('id, user_id, workspace_id, endpoint, p256dh, auth')
  if (opts.only_user_id) subQuery = subQuery.eq('user_id', opts.only_user_id)
  const { data: subs, error: subError } = await subQuery
  if (subError) return json({ error: 'subs_failed', detail: subError.message }, 500)

  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))]
  const [{ data: prefs }, { data: profiles }, { data: memberships }] = await Promise.all([
    db.from('push_preferences').select('user_id, payments_enabled, housekeeping_enabled').in('user_id', userIds),
    db.from('profiles').select('id, locale').in('id', userIds),
    db.from('workspace_memberships').select('user_id, workspace_id, role').in('user_id', userIds),
  ])
  const prefBy = new Map((prefs ?? []).map((p) => [p.user_id, p]))
  const localeBy = new Map((profiles ?? []).map((p) => [p.id, (p.locale === 'si' ? 'si' : 'en') as Locale]))
  const roleBy = new Map((memberships ?? []).map((m) => [`${m.user_id}:${m.workspace_id}`, m.role as string]))

  const report = { date: today, devices: subs?.length ?? 0, sent: 0, skipped: 0, removed: 0, failed: 0, dry_run: !!opts.dry_run }

  for (const sub of subs ?? []) {
    const locale = localeBy.get(sub.user_id) ?? 'en'
    const role = roleBy.get(`${sub.user_id}:${sub.workspace_id}`) ?? ''
    const pref = prefBy.get(sub.user_id)
    const digest = digestByWs.get(sub.workspace_id)

    const messages: PushMessage[] = []
    if (opts.test) {
      messages.push({ title: 'NIVA', body: locale === 'si' ? 'පරීක්ෂණ දැනුම්දීමක්' : 'Test notification', url: '/', tag: 'niva-test' })
    } else if (digest) {
      // Payments are management-only, matching the Recurring payments screen.
      const wantsPayments = (role === 'administrator' || role === 'manager') && (pref?.payments_enabled ?? true)
      const wantsHousekeeping = role !== '' && (pref?.housekeeping_enabled ?? true)
      const pay = wantsPayments ? paymentsMessage(digest, locale) : null
      const hk = wantsHousekeeping ? housekeepingMessage(digest, locale) : null
      if (pay) messages.push(pay)
      if (hk) messages.push(hk)
    }
    if (messages.length === 0) {
      report.skipped++
      continue
    }
    if (opts.dry_run) {
      report.sent += messages.length
      continue
    }
    for (const m of messages) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(m),
          { TTL: 6 * 3600, urgency: 'normal' },
        )
        report.sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('id', sub.id)
          report.removed++
          break
        }
        report.failed++
        console.error('push failed', status)
      }
    }
  }

  return json(report)
})
