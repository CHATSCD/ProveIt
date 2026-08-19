// Supabase Edge Function: process-checks
// Deploy via Supabase dashboard → Edge Functions → New function → paste this code
// Set cron schedule: */15 * * * *  (every 15 minutes)
//
// Runs every 15 minutes to:
// 1. Mark expired pending checks as missed + penalize assigned employee
// 2. Insert missed-check notifications for managers
// 3. Fire new scheduled checks
// 4. Fire random surprise checks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

function parseTimeMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Best-effort push notification — never let a notification failure block
// the check-scheduling logic above it.
async function notifyPush(payload: {
  employee_ids?: string[]
  location_id?: string
  role_filter?: string[]
  title: string
  body: string
  url?: string
}) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (_err) {
    // swallow — push delivery is best-effort
  }
}

Deno.serve(async (_req) => {
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`

  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)

  // ── 1. Mark expired pending checks as missed ─────────────────────────────
  const { data: expired } = await supabase
    .from('check_requests')
    .select('id, station_id, trigger_type')
    .eq('status', 'pending')
    .lt('expires_at', now.toISOString())

  if (expired?.length) {
    await supabase
      .from('check_requests')
      .update({ status: 'missed' })
      .in('id', expired.map(c => c.id))

    for (const check of expired) {
      const { data: station } = await supabase
        .from('stations')
        .select('location_id, name, assigned_employee_id')
        .eq('id', check.station_id)
        .single()

      if (!station) continue

      // Penalize only assigned employee, or all employees if unassigned
      let employeeIds: string[] = []
      if (station.assigned_employee_id) {
        employeeIds = [station.assigned_employee_id]
      } else {
        const { data: emps } = await supabase
          .from('employees')
          .select('id')
          .eq('location_id', station.location_id)
          .eq('role', 'employee')
          .eq('is_active', true)
        employeeIds = (emps || []).map((e: { id: string }) => e.id)
      }

      for (const empId of employeeIds) {
        const { data: score } = await supabase
          .from('shift_scores')
          .select('*')
          .eq('employee_id', empId)
          .eq('location_id', station.location_id)
          .gte('period_start', weekStart.toISOString())
          .maybeSingle()

        if (score) {
          const newMissed = score.missed_count + 1
          const penalty = newMissed >= 2 ? 30 : 15

          await supabase.from('shift_scores').update({
            total_points: Math.max(0, score.total_points - penalty),
            missed_count: newMissed,
          }).eq('id', score.id)

          // Escalation alert for 2nd miss
          if (newMissed === 2) {
            await supabase.from('notifications').insert({
              location_id: station.location_id,
              type: 'two_misses',
              message: `⚠️ 2nd missed check this shift at ${station.name} — immediate review required`,
              station_name: station.name,
            })
            await notifyPush({
              location_id: station.location_id,
              role_filter: ['manager', 'owner'],
              title: '⚠️ Two missed checks',
              body: `${station.name} has missed 2 checks this shift — review needed`,
              url: '/dashboard',
            })
          }
        }
      }

      // Standard missed check notification
      await supabase.from('notifications').insert({
        location_id: station.location_id,
        type: 'missed_check',
        message: `${station.name} check was missed`,
        station_name: station.name,
      })
      await notifyPush({
        location_id: station.location_id,
        role_filter: ['manager', 'owner'],
        title: 'Check missed',
        body: `${station.name} check was missed`,
        url: '/dashboard',
      })
    }
  }

  // ── 2. Fire new scheduled checks ─────────────────────────────────────────
  const { data: scheduledChecks } = await supabase
    .from('check_schedules')
    .select('*, stations(id, location_id, is_active)')
    .eq('type', 'scheduled')
    .not('stations', 'is', null)

  for (const schedule of scheduledChecks || []) {
    const station = schedule.stations
    if (!station?.is_active) continue

    if (schedule.active_start_time && schedule.active_end_time) {
      if (currentTime < schedule.active_start_time || currentTime > schedule.active_end_time) continue
    }

    const windowMinutes = schedule.interval_minutes || 120
    const windowAgo = new Date(now.getTime() - windowMinutes * 60 * 1000)

    const { count } = await supabase
      .from('check_requests')
      .select('id', { count: 'exact' })
      .eq('station_id', station.id)
      .in('status', ['pending', 'submitted'])
      .gte('triggered_at', windowAgo.toISOString())

    if ((count || 0) > 0) continue

    const submissionWindowMs = (schedule.submission_window_minutes || 15) * 60 * 1000
    await supabase.from('check_requests').insert({
      station_id: station.id,
      schedule_id: schedule.id,
      trigger_type: 'scheduled',
      triggered_at: now.toISOString(),
      expires_at: new Date(now.getTime() + submissionWindowMs).toISOString(),
      status: 'pending',
    })

    const { data: stationInfo } = await supabase
      .from('stations')
      .select('name, assigned_employee_id')
      .eq('id', station.id)
      .single()

    await notifyPush({
      employee_ids: stationInfo?.assigned_employee_id ? [stationInfo.assigned_employee_id] : undefined,
      location_id: stationInfo?.assigned_employee_id ? undefined : station.location_id,
      role_filter: stationInfo?.assigned_employee_id ? undefined : ['employee', 'manager'],
      title: '📋 Check due',
      body: `${stationInfo?.name || 'A station'} needs a check within ${schedule.submission_window_minutes || 15} min`,
      url: '/dashboard',
    })
  }

  // ── 3. Fire random surprise checks ───────────────────────────────────────
  const { data: randomSchedules } = await supabase
    .from('check_schedules')
    .select('*, stations(id, location_id, is_active)')
    .eq('type', 'random')
    .not('stations', 'is', null)

  for (const schedule of randomSchedules || []) {
    const station = schedule.stations
    if (!station?.is_active) continue

    const winStart = schedule.window_start || schedule.active_start_time
    const winEnd   = schedule.window_end   || schedule.active_end_time

    if (winStart && winEnd) {
      if (currentTime < winStart || currentTime > winEnd) continue
    }

    // Probability calculation: target 1 check per min_gap_minutes across the window
    const minGap = schedule.min_gap_minutes || 60
    const windowDurationMins = (winStart && winEnd)
      ? parseTimeMins(winEnd) - parseTimeMins(winStart)
      : 8 * 60
    const slotsInWindow  = Math.max(1, Math.floor(windowDurationMins / 15))
    const targetChecks   = windowDurationMins / minGap
    const probability    = Math.min(0.9, targetChecks / slotsInWindow)

    if (Math.random() > probability) continue

    // Enforce minimum gap between checks for this station
    const gapAgo = new Date(now.getTime() - minGap * 60 * 1000)
    const { count: recentCount } = await supabase
      .from('check_requests')
      .select('id', { count: 'exact' })
      .eq('station_id', station.id)
      .gte('triggered_at', gapAgo.toISOString())

    if ((recentCount || 0) > 0) continue

    const submissionWindowMs = (schedule.submission_window_minutes || 15) * 60 * 1000
    await supabase.from('check_requests').insert({
      station_id: station.id,
      schedule_id: schedule.id,
      trigger_type: 'random',
      triggered_at: now.toISOString(),
      expires_at: new Date(now.getTime() + submissionWindowMs).toISOString(),
      status: 'pending',
    })

    const { data: stationInfo } = await supabase
      .from('stations')
      .select('name, assigned_employee_id')
      .eq('id', station.id)
      .single()

    await notifyPush({
      employee_ids: stationInfo?.assigned_employee_id ? [stationInfo.assigned_employee_id] : undefined,
      location_id: stationInfo?.assigned_employee_id ? undefined : station.location_id,
      role_filter: stationInfo?.assigned_employee_id ? undefined : ['employee', 'manager'],
      title: '⚡ Surprise check!',
      body: `${stationInfo?.name || 'A station'} needs a check within ${schedule.submission_window_minutes || 15} min`,
      url: '/dashboard',
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    expired: expired?.length || 0,
    timestamp: now.toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } })
})
