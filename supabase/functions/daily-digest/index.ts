// Supabase Edge Function: daily-digest
// Schedule this to run once per day (e.g. 7:00 AM local time)
// Cron example: 0 12 * * *  (UTC) — adjust for your timezone

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (_req) => {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, owner_id')

  if (!locations?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'No locations' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const results = []

  for (const location of locations) {
    // Yesterday's check requests for this location
    const { data: checks } = await supabase
      .from('check_requests')
      .select(`
        id, status, triggered_at, expires_at,
        stations!inner(id, name, location_id)
      `)
      .eq('stations.location_id', location.id)
      .gte('triggered_at', yesterday.toISOString())
      .lt('triggered_at', todayStart.toISOString())

    const total = checks?.length || 0
    const submitted = checks?.filter(c => c.status === 'submitted').length || 0
    const missed = checks?.filter(c => c.status === 'missed').length || 0
    const pending = checks?.filter(c => c.status === 'pending').length || 0

    const compliance = total > 0 ? Math.round((submitted / total) * 100) : 100

    // Top performer this week
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const { data: topScores } = await supabase
      .from('shift_scores')
      .select('total_points, employees(display_name)')
      .eq('location_id', location.id)
      .gte('period_start', weekStart.toISOString())
      .order('total_points', { ascending: false })
      .limit(1)

    const topPerformer = topScores?.[0]
      ? `\( {topScores[0].employees?.display_name} ( \){topScores[0].total_points} pts)`
      : 'No data yet'

    // Missed stations list
    const missedStations = (checks || [])
      .filter(c => c.status === 'missed')
      .map(c => c.stations?.name)
      .filter(Boolean)

    // Build message
    let message = `📊 ProveIt Daily Digest — ${location.name}\n\n`
    message += `Yesterday:\n`
    message += `• Total checks: ${total}\n`
    message += `• Submitted: ${submitted}\n`
    message += `• Missed: ${missed}\n`
    message += `• Compliance: ${compliance}%\n\n`
    message += `🏆 This week's top performer: ${topPerformer}\n`

    if (missedStations.length > 0) {
      message += `\n⚠️ Missed stations:\n`
      message += missedStations.map(s => `• ${s}`).join('\n')
    } else {
      message += `\n✅ No missed checks yesterday.`
    }

    // Insert notification for managers/owners of this location
    await supabase.from('notifications').insert({
      location_id: location.id,
      type: 'daily_digest',
      message: message,
      station_name: null,
    })

    results.push({
      location: location.name,
      total,
      submitted,
      missed,
      compliance,
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: results.length,
    results,
    timestamp: now.toISOString(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
