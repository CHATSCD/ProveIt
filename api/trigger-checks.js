// NOTE: Supabase's own pg_cron (see supabase/schema.sql, job
// "process-checks-every-15-min") already calls the process-checks edge
// function directly every 15 minutes. This Vercel cron endpoint is a
// redundant second trigger for the same job — harmless since
// process-checks only acts on requests that are actually due/expired,
// but it means the job runs twice as often as intended and this endpoint
// is public (no secret required) since process-checks itself has
// verify_jwt disabled to allow pg_cron to call it. Consider removing
// this endpoint and the matching cron entry in vercel.json if pg_cron
// alone is sufficient.
export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aahfydouyyrvrcubwoxa.supabase.co'
    const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhaGZ5ZG91eXlydnJjdWJ3b3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDQ2MjIsImV4cCI6MjA5MTI4MDYyMn0.3vvBS83UNKVdDYBcoV4wr25d3StIdxb_F0xj1raQje0'

    const response = await fetch(
      `${supabaseUrl}/functions/v1/process-checks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    )
    const data = await response.json()
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
