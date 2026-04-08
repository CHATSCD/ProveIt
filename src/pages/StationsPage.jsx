import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { QRCodeSVG } from 'qrcode.react'

const BASE_URL = window.location.origin

function generateToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < 16; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

function QRModal({ station, onClose }) {
  const qrUrl = `${BASE_URL}/check/${station.qr_code_token}`

  function printQR() {
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html><head><title>ProveIt QR - ${station.name}</title>
      <style>
        body { font-family: 'Inter', sans-serif; background: #0a0f1e; color: white;
               display: flex; flex-direction: column; align-items: center;
               justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
        h1 { font-size: 32px; margin-bottom: 8px; color: white; }
        p { color: #9ca3af; margin-bottom: 24px; font-size: 14px; }
        .qr-box { background: white; padding: 24px; border-radius: 16px; }
        .url { margin-top: 16px; font-size: 12px; color: #6b7280; word-break: break-all; max-width: 300px; text-align: center; }
        .badge { background: #ff6b2b; color: white; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: bold; margin-top: 12px; }
      </style></head>
      <body>
        <h1>${station.name}</h1>
        <p>Scan to submit your food check</p>
        <div class="qr-box">
          ${document.getElementById('qr-print-target')?.innerHTML || ''}
        </div>
        <div class="url">${qrUrl}</div>
        <div class="badge">ProveIt</div>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
         onClick={onClose}>
      <div className="rounded-2xl p-6 max-w-sm w-full text-center"
           style={{ background: '#1a2235', border: '1px solid #2d3748' }}
           onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-black text-white mb-1">{station.name}</h2>
        <p className="text-gray-400 text-sm mb-4">Scan to submit a food check</p>

        <div className="bg-white p-4 rounded-xl inline-block mb-4" id="qr-print-target">
          <QRCodeSVG value={qrUrl} size={200} bgColor="#ffffff" fgColor="#0a0f1e" level="H" />
        </div>

        <p className="text-xs text-gray-600 mb-4 break-all">{qrUrl}</p>

        <div className="flex gap-2">
          <button
            onClick={printQR}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white"
            style={{ background: '#ff6b2b' }}
          >
            Print / Download
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
            style={{ background: '#374151', color: '#9ca3af' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function StationForm({ station, onSave, onCancel, locationId }) {
  const [name, setName] = useState(station?.name || '')
  const [scheduleType, setScheduleType] = useState(station?.schedule?.type || 'scheduled')
  const [intervalMinutes, setIntervalMinutes] = useState(station?.schedule?.interval_minutes || 120)
  const [windowStart, setWindowStart] = useState(station?.schedule?.active_start_time || '08:00')
  const [windowEnd, setWindowEnd] = useState(station?.schedule?.active_end_time || '22:00')
  const [submissionWindow, setSubmissionWindow] = useState(station?.schedule?.submission_window_minutes || 15)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        scheduleType,
        intervalMinutes: parseInt(intervalMinutes),
        windowStart,
        windowEnd,
        submissionWindow: parseInt(submissionWindow),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: '#1a2235', border: '1px solid #ff6b2b' }}>
      <h3 className="font-bold text-white">{station ? 'Edit Station' : 'New Station'}</h3>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Station Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Pizza Bar, Deli Hot Case"
          className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
          style={{ background: '#111827', border: '1px solid #2d3748' }}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Schedule Type</label>
        <div className="flex gap-2">
          {['scheduled', 'random'].map(type => (
            <button
              key={type}
              onClick={() => setScheduleType(type)}
              className="flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all"
              style={scheduleType === type
                ? { background: 'rgba(255,107,43,0.2)', color: '#ff6b2b', border: '1px solid rgba(255,107,43,0.4)' }
                : { background: '#111827', color: '#9ca3af', border: '1px solid #2d3748' }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {scheduleType === 'scheduled' && (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Check Interval</label>
          <select
            value={intervalMinutes}
            onChange={e => setIntervalMinutes(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
            style={{ background: '#111827', border: '1px solid #2d3748' }}
          >
            <option value={60}>Every 1 hour</option>
            <option value={90}>Every 90 minutes</option>
            <option value={120}>Every 2 hours</option>
            <option value={180}>Every 3 hours</option>
            <option value={240}>Every 4 hours</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Active From</label>
          <input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)}
                 className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                 style={{ background: '#111827', border: '1px solid #2d3748' }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Active Until</label>
          <input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                 className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                 style={{ background: '#111827', border: '1px solid #2d3748' }} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Submission Window: {submissionWindow} minutes
        </label>
        <input
          type="range"
          min={10} max={30} step={5}
          value={submissionWindow}
          onChange={e => setSubmissionWindow(e.target.value)}
          className="w-full accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>10 min</span><span>30 min</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={handleSave} disabled={saving || !name.trim()}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                style={{ background: saving ? '#cc5522' : '#ff6b2b', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving...' : 'Save Station'}
        </button>
        <button onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm"
                style={{ background: '#374151', color: '#9ca3af' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function StationsPage() {
  const { employee } = useAuth()
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingStation, setEditingStation] = useState(null)
  const [qrStation, setQrStation] = useState(null)

  const locationId = employee?.location_id

  const loadStations = useCallback(async () => {
    if (!locationId) return
    const { data } = await supabase
      .from('stations')
      .select('*, check_schedules(*)')
      .eq('location_id', locationId)
      .order('name')
    setStations(data?.map(s => ({ ...s, schedule: s.check_schedules?.[0] })) || [])
    setLoading(false)
  }, [locationId])

  useEffect(() => { loadStations() }, [loadStations])

  async function handleSave({ name, scheduleType, intervalMinutes, windowStart, windowEnd, submissionWindow }) {
    try {
      if (editingStation) {
        // Update existing station
        await supabase.from('stations').update({ name }).eq('id', editingStation.id)
        // Update schedule
        if (editingStation.schedule?.id) {
          await supabase.from('check_schedules').update({
            type: scheduleType,
            interval_minutes: intervalMinutes,
            active_start_time: windowStart,
            active_end_time: windowEnd,
            submission_window_minutes: submissionWindow,
          }).eq('id', editingStation.schedule.id)
        }
      } else {
        // Create new station
        const token = generateToken()
        const { data: newStation } = await supabase.from('stations').insert({
          location_id: locationId,
          name,
          qr_code_token: token,
          is_active: true,
        }).select().single()

        // Create schedule
        await supabase.from('check_schedules').insert({
          station_id: newStation.id,
          type: scheduleType,
          interval_minutes: intervalMinutes,
          active_start_time: windowStart,
          active_end_time: windowEnd,
          submission_window_minutes: submissionWindow,
        })
      }

      setShowForm(false)
      setEditingStation(null)
      await loadStations()
    } catch (err) {
      console.error(err)
    }
  }

  async function toggleActive(station) {
    await supabase.from('stations').update({ is_active: !station.is_active }).eq('id', station.id)
    await loadStations()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Stations</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage food stations and QR codes</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditingStation(null); setShowForm(true) }}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-white"
            style={{ background: '#ff6b2b' }}
          >
            + Add Station
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6">
          <StationForm
            station={editingStation}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingStation(null) }}
            locationId={locationId}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
        </div>
      ) : stations.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="text-4xl mb-3">◎</div>
          <h3 className="text-white font-bold mb-1">No stations yet</h3>
          <p className="text-gray-400 text-sm">Add your first food station to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stations.map(st => (
            <div key={st.id} className="rounded-2xl p-4"
                 style={{ background: '#1a2235', border: '1px solid #2d3748',
                          opacity: st.is_active ? 1 : 0.6 }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white">{st.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.is_active ? 'text-green-400' : 'text-gray-500'}`}
                          style={{ background: st.is_active ? 'rgba(34,197,94,0.1)' : '#374151' }}>
                      {st.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {st.schedule && (
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                            style={{ background: '#374151', color: '#9ca3af' }}>
                        {st.schedule.type}
                      </span>
                    )}
                  </div>
                  {st.schedule && (
                    <div className="text-xs text-gray-500 mt-1">
                      {st.schedule.type === 'scheduled' && `Every ${st.schedule.interval_minutes} min • `}
                      {st.schedule.active_start_time}–{st.schedule.active_end_time} •
                      {' '}{st.schedule.submission_window_minutes} min window
                    </div>
                  )}
                  <div className="text-xs text-gray-600 mt-1 font-mono truncate">
                    /check/{st.qr_code_token}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setQrStation(st)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
                  >
                    QR
                  </button>
                  <button
                    onClick={() => { setEditingStation(st); setShowForm(true) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#374151', color: '#9ca3af' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(st)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={st.is_active
                      ? { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                      : { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    {st.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {qrStation && <QRModal station={qrStation} onClose={() => setQrStation(null)} />}
    </div>
  )
}
