import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aahfydouyyrvrcubwoxa.supabase.co'F0xj1raQje0
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhaGZ5ZG91eXlydnJjdWJ3b3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDQ2MjIsImV4cCI6MjA5MTI4MDYyMn0.3vvBS83UNKVdDYBcoV4wr25d3StIdxb_F0xj1raQje0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export { SUPABASE_URL, SUPABASE_ANON }
