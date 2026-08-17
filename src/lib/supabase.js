import { createClient } from '@supabase/supabase-js'

// Falls back to the project's current values if VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY aren't set, so existing deployments that haven't
// configured env vars yet keep working. Set the env vars (see .env.example)
// to point different environments (dev/staging/prod) at different projects.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://aahfydouyyrvrcubwoxa.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhaGZ5ZG91eXlydnJjdWJ3b3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDQ2MjIsImV4cCI6MjA5MTI4MDYyMn0.3vvBS83UNKVdDYBcoV4wr25d3StIdxb_F0xj1raQje0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export { SUPABASE_URL, SUPABASE_ANON }
