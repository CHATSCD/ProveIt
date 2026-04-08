import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [tab, setTab] = useState('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Sign in fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Sign up fields
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regRole, setRegRole] = useState('employee')
  const [regLocationId, setRegLocationId] = useState('')
  const [locations, setLocations] = useState([])
  const [locationsLoaded, setLocationsLoaded] = useState(false)

  async function loadLocations() {
    if (locationsLoaded) return
    const { data } = await supabase.from('locations').select('id, name, address').order('name')
    setLocations(data || [])
    setLocationsLoaded(true)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (!regLocationId) { setError('Please select a location'); return }
    setLoading(true)
    try {
      await signUp(regEmail, regPassword, regName, regRole, regLocationId)
      setSuccess('Account created! Check your email to confirm, then sign in.')
      setTab('signin')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
         style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #111827 100%)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
               style={{ background: '#ff6b2b' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" fill="none"/>
              <path d="M16 4L16 28M4 10L28 22M28 10L4 22" stroke="white" strokeWidth="1.5" opacity="0.5"/>
              <circle cx="16" cy="16" r="4" fill="white"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>ProveIt</h1>
          <p className="text-gray-400 mt-1 text-sm">Because "I did it" isn't good enough anymore.</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          {/* Tabs */}
          <div className="flex rounded-xl p-1 mb-6" style={{ background: '#111827' }}>
            <button
              onClick={() => { setTab('signin'); setError(''); setSuccess('') }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === 'signin' ? { background: '#ff6b2b', color: 'white' } : { color: '#9ca3af' }}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('signup'); setError(''); setSuccess(''); loadLocations() }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === 'signup' ? { background: '#ff6b2b', color: 'white' } : { color: '#9ca3af' }}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm text-green-300" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
              {success}
            </div>
          )}

          {/* Sign In Form */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: loading ? '#cc5522' : '#ff6b2b', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Sign Up Form */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
                <select
                  value={regRole}
                  onChange={e => setRegRole(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Location</label>
                <select
                  value={regLocationId}
                  onChange={e => setRegLocationId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                  style={{ background: '#111827', border: '1px solid #2d3748' }}
                >
                  <option value="">Select a location...</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name} — {loc.address}</option>
                  ))}
                </select>
                {locations.length === 0 && locationsLoaded && (
                  <p className="text-xs text-yellow-400 mt-1">No locations found. An owner must create one first.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: loading ? '#cc5522' : '#ff6b2b', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          ProveIt © {new Date().getFullYear()} — Food Safety Accountability
        </p>
      </div>
    </div>
  )
}
