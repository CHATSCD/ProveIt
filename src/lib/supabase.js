import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://uqszvjvzwdqjgipmibqa.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxc3p2anZ6d2RxamdpcG1pYnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MjkyODAsImV4cCI6MjA5MTAwNTI4MH0.ns_7njQobaBqSJW9NZ32qwueBt39lq26zVdxXoEcX40'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export { SUPABASE_URL, SUPABASE_ANON }
