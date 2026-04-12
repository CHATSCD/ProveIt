export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://aahfydouyyrvrcubwoxa.supabase.co/functions/v1/process-checks',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhaGZ5ZG91eXlydnJjdWJ3b3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDQ2MjIsImV4cCI6MjA5MTI4MDYyMn0.3vvBS83UNKVdDYBcoV4wr25d3StIdxb_F0xj1raQje0`,
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
