// First-run location setup for owners who don't have a location yet
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function SetupPage() {
  const { user, fetchEmployee } = useAuth()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      // Create location
      const { data: loc, error: locErr } = await supabase
        .from('locations')
        .insert({ name: name.trim(), address: address.trim(), owner_id: user.id })
        .select()
        .single()

      if (locErr) throw locErr

      // Create owner employee record
      const { error: empErr } = await supabase
        .from('employees')
        .insert({
          user_id: user.id,
          location_id: loc.id,
          display_name: ownerName.trim() || 'Owner',
          role: 'owner',
          is_active: true,
        })

      if (empErr) throw empErr

      // Refresh the auth context employee
      await fetchEmployee(user.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: '#0a0f1e' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
               style={{ background: '#ff6b2b' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" fill="none"/>
              <circle cx="16" cy="16" r="4" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Welcome to ProveIt
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Let's set up your first location to get started.
          </p>
        </div>

        <div className="rounded-2xl p-6 space-y-4" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Your Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                required
                placeholder="Full name"
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Store / Business Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g. QuickStop #4"
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, Anytown, USA"
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748' }}
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl text-sm text-red-300"
                   style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: saving || !name.trim() ? '#374151' : '#ff6b2b',
                       cursor: saving || !name.trim() ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Creating...' : 'Create Location & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
