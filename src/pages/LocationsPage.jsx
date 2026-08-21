import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function LocationsPage() {
  const { employee, memberships, switchLocation, fetchEmployee, user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [capturingFor, setCapturingFor] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [switchingFor, setSwitchingFor] = useState(null)
  const [switchError, setSwitchError] = useState('')

  const ownerLocations = (memberships ?? []).filter(m => m.role === 'owner')

  async function handleSwitch(locationId) {
    setSwitchingFor(locationId)
    setSwitchError('')
    try {
      await switchLocation(locationId)
    } catch (err) {
      setSwitchError(err.message)
    } finally {
      setSwitchingFor(null)
    }
  }

  async function handleSetGps(locationId) {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported on this device.'); return }
    setCapturingFor(locationId)
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { error: rpcErr } = await supabase.rpc('set_location_coordinates', {
            p_location_id: locationId,
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
          })
          if (rpcErr) throw rpcErr
          await fetchEmployee(user.id)
        } catch (err) {
          setGpsError(err.message)
        } finally {
          setCapturingFor(null)
        }
      },
      () => { setGpsError('Could not get your location. Check location permissions.'); setCapturingFor(null) },
      { enableHighAccuracy: true }
    )
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const { error: rpcErr } = await supabase.rpc('create_additional_location', {
        p_name: name.trim(),
        p_address: address.trim(),
      })
      if (rpcErr) throw rpcErr

      await fetchEmployee(user.id)
      setName('')
      setAddress('')
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Locations</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {ownerLocations.length} location{ownerLocations.length !== 1 ? 's' : ''} you own
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-white"
            style={{ background: '#ff6b2b' }}
          >
            + Add Location
          </button>
        )}
      </div>

      <div className="mb-5 p-4 rounded-xl text-sm"
           style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
        Multi-location is a <strong>Pro+</strong> feature. You can create additional locations on any
        plan, but Pro+ unlocks cross-location reporting and SMS alerts.
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl p-5 space-y-4 mb-6"
              style={{ background: '#1a2235', border: '1px solid #ff6b2b' }}>
          <h3 className="font-bold text-white">New Location</h3>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Store / Business Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. QuickStop #7"
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
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
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#111827', border: '1px solid #2d3748' }}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl text-sm text-red-300"
                 style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving || !name.trim()}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                    style={{ background: saving ? '#cc5522' : '#ff6b2b', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Creating...' : 'Create Location'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError('') }}
                    className="flex-1 py-2.5 rounded-xl font-medium text-sm"
                    style={{ background: '#374151', color: '#9ca3af' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {ownerLocations.map(m => {
          const isActive = m.location_id === employee?.location_id
          return (
            <div key={m.location_id}
                 className="rounded-2xl p-4 flex items-center justify-between"
                 style={{
                   background: '#1a2235',
                   border: isActive ? '1px solid rgba(255,107,43,0.4)' : '1px solid #2d3748',
                 }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{m.locations?.name}</span>
                  {isActive && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,107,43,0.15)', color: '#ff6b2b' }}>
                      Active
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                        style={{ background: '#374151', color: '#9ca3af' }}>
                    {m.locations?.plan_tier?.replace('_', '+') || 'starter'}
                  </span>
                </div>
                {m.locations?.address && (
                  <div className="text-xs text-gray-500 mt-0.5">{m.locations.address}</div>
                )}
                <div className="text-xs mt-1" style={{ color: m.locations?.latitude ? '#22c55e' : '#6b7280' }}>
                  {m.locations?.latitude
                    ? `🛡️ TrustIt geofence set (${m.locations.geofence_radius_meters}m radius)`
                    : '🛡️ TrustIt geofence not set — submissions won\'t be location-verified'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {!isActive && (
                  <button
                    onClick={() => handleSwitch(m.location_id)}
                    disabled={switchingFor === m.location_id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                    style={{
                      background: 'rgba(59,130,246,0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.3)',
                      cursor: switchingFor === m.location_id ? 'not-allowed' : 'pointer',
                      opacity: switchingFor === m.location_id ? 0.6 : 1,
                    }}
                  >
                    {switchingFor === m.location_id ? 'Switching...' : 'Switch to this'}
                  </button>
                )}
                <button
                  onClick={() => handleSetGps(m.location_id)}
                  disabled={capturingFor === m.location_id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                >
                  {capturingFor === m.location_id ? 'Capturing...' : m.locations?.latitude ? 'Update GPS' : 'Set GPS (TrustIt)'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {switchError && (
        <div className="mt-4 p-3 rounded-xl text-sm text-red-300"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {switchError}
        </div>
      )}

      {gpsError && (
        <div className="mt-4 p-3 rounded-xl text-sm text-red-300"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {gpsError}
        </div>
      )}
    </div>
  )
}
