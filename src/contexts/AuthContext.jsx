import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchEmployee(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchEmployee(session.user.id)
      else {
        setEmployee(null)
        setMemberships([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetches BOTH the single active employee row (the "current" location, used
  // throughout the app for RLS-scoped reads) and the full list of employees
  // rows for this user across all locations (memberships — used by
  // LocationsPage to let an owner switch which location is active).
  async function fetchEmployee(userId) {
    try {
      const [{ data }, { data: allRows }] = await Promise.all([
        supabase
          .from('employees')
          .select('*, locations(*)')
          .eq('user_id', userId)
          .eq('is_active', true)
          .single(),
        supabase
          .from('employees')
          .select('*, locations(*)')
          .eq('user_id', userId),
      ])
      setEmployee(data)
      setMemberships(allRows ?? [])
    } catch {
      setEmployee(null)
      setMemberships([])
    } finally {
      setLoading(false)
    }
  }

  // Flips the caller's active location server-side (via switch_active_location,
  // which atomically clears is_active on every other employees row for this
  // user and sets it on the one at locationId) then re-fetches auth state so
  // `employee` / `memberships` — and everything downstream that relies on
  // get_my_location_id() through RLS — reflect the new active location.
  async function switchLocation(locationId) {
    if (!user) throw new Error('Not authenticated')
    const { error } = await supabase.rpc('switch_active_location', { p_location_id: locationId })
    if (error) throw error
    await fetchEmployee(user.id)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password, displayName, role, locationId) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    // Create employee record (owners skip this — SetupPage creates it with their location)
    if (data.user && role !== 'owner') {
      const { error: empError } = await supabase.from('employees').insert({
        user_id: data.user.id,
        display_name: displayName,
        role,
        location_id: locationId,
        is_active: true,
      })
      if (empError) throw empError
    }
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isManager = employee?.role === 'manager' || employee?.role === 'owner'
  const isOwner = employee?.role === 'owner'

  return (
    <AuthContext.Provider value={{ user, employee, memberships, loading, signIn, signUp, signOut, isManager, isOwner, fetchEmployee, switchLocation }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
