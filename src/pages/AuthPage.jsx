import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui'
import { inputStyle, focusRing } from '../components/uiTokens'
import { AlertCircle, CheckCircle2, Camera, MapPinned, Trophy, ChevronRight } from 'lucide-react'

const FEATURES = [
  { icon: Camera, title: 'Photo-verified checks', desc: 'Employees scan a station QR code and submit live, timestamped photos — no gallery uploads.' },
  { icon: MapPinned, title: 'Geotagged & scheduled', desc: 'Scheduled and surprise checks fire automatically, and every submission is geolocated.' },
  { icon: Trophy, title: 'Ratings that matter', desc: 'Managers rate every submission; scores, coaching, and leaderboards happen automatically.' },
]

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
    const { data, error: locErr } = await supabase.from('locations').select('id, name, address').order('name')
    if (locErr) setError('Cannot reach the server. Check your Supabase project is active.')
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
      const msg = err.message || ''
      if (msg === 'Load failed' || msg === 'Failed to fetch' || msg.includes('fetch')) {
        setError('Cannot reach the server. Make sure your Supabase project is active and not paused.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    if (regRole !== 'owner' && !regLocationId) { setError('Please select a location'); return }
    setLoading(true)
    try {
      await signUp(regEmail, regPassword, regName, regRole, regRole === 'owner' ? null : regLocationId)
      setSuccess('Account created! Check your email to confirm, then sign in.')
      setTab('signin')
    } catch (err) {
      const msg = err.message || ''
      if (msg === 'Load failed' || msg === 'Failed to fetch' || msg.includes('fetch')) {
        setError('Cannot reach the server. Make sure your Supabase project is active and not paused.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  function fieldStyle(extra = {}) {
    return { ...inputStyle, ...extra }
  }

  return (
    <div className="min-h-screen flex items-stretch">
      {/* Left — brand / value prop (desktop only) */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-between p-14 relative overflow-hidden"
           style={{ background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-soft)' }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(600px 400px at 20% 10%, rgba(255,107,43,0.12), transparent 60%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)', boxShadow: 'var(--shadow-glow)' }}>
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2.5" fill="none"/>
                <circle cx="16" cy="16" r="4" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-white text-xl" style={{ fontFamily: 'Syne, sans-serif' }}>ProveIt</span>
          </div>

          <h2 className="text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'Syne, sans-serif' }}>
            "I did it" isn't proof.<br />This is.
          </h2>
          <p className="mb-12" style={{ color: 'var(--text-muted)' }}>
            Timestamped, geotagged, photo-verified food safety checks — with automatic
            scoring your whole team can see.
          </p>

          <div className="space-y-6">
            {FEATURES.map(f => (
              <div key={f.title} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', color: 'var(--accent)' }}>
                  <f.icon size={18} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm mb-0.5">{f.title}</div>
                  <div className="text-sm" style={{ color: 'var(--text-faint)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs" style={{ color: 'var(--text-faint)' }}>
          ProveIt © {new Date().getFullYear()} — Food Safety Accountability
        </p>
      </div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-in">
          {/* Logo (mobile only) */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                 style={{ background: 'var(--accent)', boxShadow: 'var(--shadow-glow)' }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" fill="none"/>
                <path d="M16 4L16 28M4 10L28 22M28 10L4 22" stroke="white" strokeWidth="1.5" opacity="0.5"/>
                <circle cx="16" cy="16" r="4" fill="white"/>
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>ProveIt</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-faint)' }}>Because "I did it" isn't good enough anymore.</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">
              {tab === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              {tab === 'signin' ? 'Sign in to continue to your dashboard.' : 'Takes less than a minute to get started.'}
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            {/* Tabs */}
            <div className="relative flex rounded-xl p-1 mb-6" style={{ background: 'var(--inset)' }}>
              <div
                className="absolute top-1 bottom-1 rounded-lg transition-all duration-300"
                style={{
                  background: 'var(--accent)',
                  boxShadow: 'var(--shadow-glow)',
                  width: 'calc(50% - 4px)',
                  left: tab === 'signin' ? '4px' : 'calc(50% + 0px)',
                }}
              />
              <button
                onClick={() => { setTab('signin'); setError(''); setSuccess('') }}
                className="relative flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 z-10"
                style={{ color: tab === 'signin' ? 'white' : 'var(--text-muted)' }}
              >
                Sign In
              </button>
              <button
                onClick={() => { setTab('signup'); setError(''); setSuccess(''); loadLocations() }}
                className="relative flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 z-10"
                style={{ color: tab === 'signup' ? 'white' : 'var(--text-muted)' }}
              >
                Register
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 mb-4 p-3 rounded-lg text-sm animate-in" style={{ background: 'var(--red-soft)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 mb-4 p-3 rounded-lg text-sm animate-in" style={{ background: 'var(--green-soft)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {/* Sign In Form */}
            {tab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" loading={loading} className="w-full" size="lg" icon={!loading ? ChevronRight : undefined}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </Button>
              </form>
            )}

            {/* Sign Up Form */}
            {tab === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Full Name</label>
                  <input
                    type="text"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    required
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                    placeholder="Min 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>I am...</label>
                  <select
                    value={regRole}
                    onChange={e => setRegRole(e.target.value)}
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                  >
                    <option value="employee">Joining an existing team (Employee)</option>
                    <option value="owner">Starting a new business (Owner)</option>
                  </select>
                  {regRole === 'employee' && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
                      Your manager or owner can promote you to Manager later from the Staff page.
                    </p>
                  )}
                </div>
                {regRole !== 'owner' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Location</label>
                  <select
                    value={regLocationId}
                    onChange={e => setRegLocationId(e.target.value)}
                    className="w-full px-4 py-3 text-white text-sm outline-none"
                    style={fieldStyle()}
                    {...focusRing}
                  >
                    <option value="">Select a location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name} — {loc.address}</option>
                    ))}
                  </select>
                  {locations.length === 0 && locationsLoaded && (
                    <p className="text-xs mt-1.5" style={{ color: '#fbbf24' }}>No locations found. An owner must create one first.</p>
                  )}
                </div>
                )}
                <Button type="submit" loading={loading} className="w-full" size="lg" icon={!loading ? ChevronRight : undefined}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </Button>
              </form>
            )}
          </div>

          <p className="text-center text-xs mt-6 lg:hidden" style={{ color: 'var(--text-faint)' }}>
            ProveIt © {new Date().getFullYear()} — Food Safety Accountability
          </p>
        </div>
      </div>
    </div>
  )
}
