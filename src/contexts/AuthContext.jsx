import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
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
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchEmployee(userId) {
    try {
      const { data } = await supabase
        .from('employees')
        .select('*, locations(*)')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()
      setEmployee(data)
    } catch {
      setEmployee(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password, displayName, role, locationId) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    // Create employee record
    if (data.user) {
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
    <AuthContext.Provider value={{ user, employee, loading, signIn, signUp, signOut, isManager, isOwner, fetchEmployee }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
