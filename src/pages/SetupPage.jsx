// First-run location setup for owners who don't have a location yet
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui'
import { inputStyle, focusRing } from '../components/uiTokens'
import { AlertCircle, ArrowRight } from 'lucide-react'

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
      const { error: rpcErr } = await supabase.rpc('setup_owner_location', {
        p_name: name.trim(),
        p_address: address.trim(),
        p_display_name: ownerName.trim() || 'Owner',
      })

      if (rpcErr) throw rpcErr

      await fetchEmployee(user.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
               style={{ background: 'var(--accent)', boxShadow: 'var(--shadow-glow)' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" fill="none"/>
              <circle cx="16" cy="16" r="4" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Welcome to ProveIt
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-faint)' }}>
            Let's set up your first location to get started.
          </p>
        </div>

        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Your Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                required
                placeholder="Full name"
                className="w-full px-4 py-3 text-white text-sm outline-none"
                style={inputStyle}
                {...focusRing}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Store / Business Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g. QuickStop #4"
                className="w-full px-4 py-3 text-white text-sm outline-none"
                style={inputStyle}
                {...focusRing}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, Anytown, USA"
                className="w-full px-4 py-3 text-white text-sm outline-none"
                style={inputStyle}
                {...focusRing}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-sm animate-in" style={{ background: 'var(--red-soft)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" loading={saving} disabled={!name.trim()} className="w-full" size="lg" icon={!saving ? ArrowRight : undefined}>
              {saving ? 'Creating…' : 'Create Location & Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
