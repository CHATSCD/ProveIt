// Supabase Edge Function: send-push
// Deploy via Supabase dashboard → Edge Functions → New function → paste this code
//
// Sends a Web Push notification to one or more subscribed devices, looked up
// from the `push_subscriptions` table. Called two ways in this codebase:
//   - src/lib/push.js's notifyPush() → supabase.functions.invoke('send-push', ...)
//     (authenticated client call, in-app-triggered notifications)
//   - supabase/functions/process-checks/index.ts's notifyPush() → raw fetch
//     to this function's URL (cron-triggered notifications)
// Both send the same payload shape, so a single handler serves both.
//
// Required env vars (set via `supabase secrets set` or the dashboard):
//   VAPID_PRIVATE_KEY   — private half of the VAPID keypair (public half is
//                          hardcoded in src/lib/push.js as VAPID_PUBLIC_KEY)
//   VAPID_SUBJECT        — optional; a mailto: or https: URL identifying the
//                          sender. Defaults to 'mailto:support@proveit.app'
//                          if unset.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3?target=deno'

// Must match VAPID_PUBLIC_KEY in src/lib/push.js.
const VAPID_PUBLIC_KEY = 'BOPKxFqOrc7l7_eDJrAkTgQabq6ChW-lbfkXwKCJqomqklzKQK3LvID7S8iFRnJEMrIfQZXYRWPUGgjzm3gq_ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@proveit.app'

if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

interface NotifyPayload {
  employee_ids?: string[]
  location_id?: string
  role_filter?: string[]
  title: string
  body: string
  url?: string
}

interface SubscriptionRow {
  id: string
  employee_id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: 'VAPID_PRIVATE_KEY is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: NotifyPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { employee_ids, location_id, role_filter, title, body, url } = payload

  if (!title || !body) {
    return new Response(JSON.stringify({ error: 'title and body are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Resolve target employee ids ─────────────────────────────────────────
  let targetEmployeeIds: string[] = []

  if (employee_ids?.length) {
    targetEmployeeIds = employee_ids
  } else if (location_id) {
    let query = supabase
      .from('employees')
      .select('id')
      .eq('location_id', location_id)
      .eq('is_active', true)

    if (role_filter?.length) {
      query = query.in('role', role_filter)
    }

    const { data: emps, error: empErr } = await query
    if (empErr) {
      return new Response(JSON.stringify({ error: empErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    targetEmployeeIds = (emps || []).map((e: { id: string }) => e.id)
  } else {
    return new Response(JSON.stringify({ error: 'employee_ids or location_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!targetEmployeeIds.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Fetch matching subscriptions ────────────────────────────────────────
  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, employee_id, endpoint, p256dh, auth')
    .in('employee_id', targetEmployeeIds)

  if (subErr) {
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const subscriptions = (subs || []) as SubscriptionRow[]
  if (!subscriptions.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const notificationPayload = JSON.stringify({ title, body, url: url || '/' })

  let sent = 0
  let failed = 0
  const staleIds: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload,
        )
        sent++
      } catch (err) {
        failed++
        const statusCode = err?.statusCode ?? err?.status
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id)
        } else {
          console.error(`Push failed for subscription ${sub.id}:`, err?.message || err)
        }
      }
    }),
  )

  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
