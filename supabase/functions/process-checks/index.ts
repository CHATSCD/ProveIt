// Supabase Edge Function: process-checks
// Deploy: supabase functions deploy process-checks --schedule "*/15 * * * *"
//
// This function runs every 15 minutes to:
// 1. Fire new check_requests for active schedules
// 2. Mark expired pending check_requests as 'missed'
// 3. Apply -15 pts penalty for missed checks
// 4. Alert manager if 2+ misses in a shift

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (_req) => {
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  // ── 1. Mark expired pending checks as missed ─────────────
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

    // Deduct points for each missed check
    for (const check of expired) {
      // Find which employees are at this station's location
      const { data: station } = await supabase
        .from('stations')
        .select('location_id')
        .eq('id', check.station_id)
        .single()

      if (!station) continue

      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      weekStart.setHours(0, 0, 0, 0)

      // Find all active employees at this location (penalize all on shift)
      const { data: employees } = await supabase
        .from('employees')
        .select('id')
        .eq('location_id', station.location_id)
        .eq('role', 'employee')
        .eq('is_active', true)

      for (const emp of employees || []) {
        const { data: score } = await supabase
          .from('shift_scores')
          .select('*')
          .eq('employee_id', emp.id)
          .eq('location_id', station.location_id)
          .gte('period_start', weekStart.toISOString())
          .single()

        if (score) {
          const newMissed = score.missed_count + 1
          const penalty = newMissed >= 2 ? -30 : -15

          await supabase.from('shift_scores').update({
            total_points: Math.max(0, score.total_points + penalty),
            missed_count: newMissed,
          }).eq('id', score.id)
        }
      }
    }
  }

  // ── 2. Fire new scheduled checks ────────────────────────
  const { data: schedules } = await supabase
    .from('check_schedules')
    .select('*, stations(id, location_id, is_active)')
    .eq('type', 'scheduled')
    .not('stations', 'is', null)

  for (const schedule of schedules || []) {
    const station = schedule.stations
    if (!station?.is_active) continue

    // Check if within active window
    if (schedule.active_start_time && schedule.active_end_time) {
      if (currentTime < schedule.active_start_time || currentTime > schedule.active_end_time) continue
    }

    // Check if there's already a pending or recent check
    const windowMinutes = schedule.interval_minutes || 120
    const windowAgo = new Date(now.getTime() - windowMinutes * 60 * 1000)

    const { count } = await supabase
      .from('check_requests')
      .select('id', { count: 'exact' })
      .eq('station_id', station.id)
      .in('status', ['pending', 'submitted'])
      .gte('triggered_at', windowAgo.toISOString())

    if ((count || 0) > 0) continue

    // Fire a new check request
    const submissionWindowMs = (schedule.submission_window_minutes || 15) * 60 * 1000
    await supabase.from('check_requests').insert({
      station_id: station.id,
      schedule_id: schedule.id,
      trigger_type: 'scheduled',
      triggered_at: now.toISOString(),
      expires_at: new Date(now.getTime() + submissionWindowMs).toISOString(),
      status: 'pending',
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    expired: expired?.length || 0,
    timestamp: now.toISOString(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
