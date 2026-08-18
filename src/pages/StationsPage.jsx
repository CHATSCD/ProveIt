import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import { Card, Badge, PageLoader, EmptyState, Button, PageHeader } from '../components/ui'
import { inputStyle, focusRing } from '../components/uiTokens'
import { Plus, QrCode, Pencil, User, Printer, X, MapPin } from 'lucide-react'

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
         style={{ background: 'rgba(6,9,18,0.75)', backdropFilter: 'blur(6px)' }}
         onClick={onClose}>
      <div className="rounded-2xl p-6 max-w-sm w-full text-center relative animate-in"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
           onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-faint)' }}
        >
          <X size={16} />
        </button>
        <h2 className="text-xl font-black text-white mb-1">{station.name}</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-faint)' }}>Scan to submit a food check</p>

        <div className="bg-white p-4 rounded-xl inline-block mb-4" id="qr-print-target">
          <QRCodeSVG value={qrUrl} size={200} bgColor="#ffffff" fgColor="#0a0f1e" level="H" />
        </div>

        <p className="text-xs mb-4 break-all" style={{ color: 'var(--text-faint)' }}>{qrUrl}</p>

        <div className="flex gap-2">
          <Button className="flex-1" icon={Printer} onClick={printQR}>
            Print / Download
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function StationForm({ station, onSave, onCancel, employees }) {
  const [name, setName] = useState(station?.name || '')
  const [scheduleType, setScheduleType] = useState(station?.schedule?.type || 'scheduled')
  const [intervalMinutes, setIntervalMinutes] = useState(station?.schedule?.interval_minutes || 120)
  const [windowStart, setWindowStart] = useState(station?.schedule?.active_start_time || '08:00')
  const [windowEnd, setWindowEnd] = useState(station?.schedule?.active_end_time || '22:00')
  const [submissionWindow, setSubmissionWindow] = useState(station?.schedule?.submission_window_minutes || 15)
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(station?.assigned_employee_id || '')
  const [minGapMinutes, setMinGapMinutes] = useState(station?.schedule?.min_gap_minutes || 60)
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
        assignedEmployeeId: assignedEmployeeId || null,
        minGapMinutes: parseInt(minGapMinutes),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-4 animate-in" padding="p-5" style={{ borderColor: 'var(--accent)' }}>
      <h3 className="font-bold text-white">{station ? 'Edit Station' : 'New Station'}</h3>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Station Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Pizza Bar, Deli Hot Case"
          className="w-full px-3 py-2.5 text-white text-sm outline-none"
          style={inputStyle}
          {...focusRing}
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Schedule Type</label>
        <div className="flex gap-2">
          {['scheduled', 'random'].map(type => (
            <button
              key={type}
              onClick={() => setScheduleType(type)}
              className="flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all duration-200"
              style={scheduleType === type
                ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(255,107,43,0.4)' }
                : { ...inputStyle, color: 'var(--text-muted)' }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {scheduleType === 'scheduled' && (
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Check Interval</label>
          <select
            value={intervalMinutes}
            onChange={e => setIntervalMinutes(e.target.value)}
            className="w-full px-3 py-2.5 text-white text-sm outline-none"
            style={inputStyle}
            {...focusRing}
          >
            <option value={60}>Every 1 hour</option>
            <option value={90}>Every 90 minutes</option>
            <option value={120}>Every 2 hours</option>
            <option value={180}>Every 3 hours</option>
            <option value={240}>Every 4 hours</option>
          </select>
        </div>
      )}

      {scheduleType === 'random' && (
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Minimum Gap Between Checks</label>
          <select
            value={minGapMinutes}
            onChange={e => setMinGapMinutes(e.target.value)}
            className="w-full px-3 py-2.5 text-white text-sm outline-none"
            style={inputStyle}
            {...focusRing}
          >
            <option value={30}>At least 30 minutes apart</option>
            <option value={60}>At least 1 hour apart</option>
            <option value={120}>At least 2 hours apart</option>
            <option value={180}>At least 3 hours apart</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {scheduleType === 'random' ? 'Surprise Window From' : 'Active From'}
          </label>
          <input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)}
                 className="w-full px-3 py-2.5 text-white text-sm outline-none"
                 style={inputStyle} {...focusRing} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {scheduleType === 'random' ? 'Surprise Window Until' : 'Active Until'}
          </label>
          <input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                 className="w-full px-3 py-2.5 text-white text-sm outline-none"
                 style={inputStyle} {...focusRing} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Submission Window: {submissionWindow} minutes
        </label>
        <input
          type="range"
          min={10} max={30} step={5}
          value={submissionWindow}
          onChange={e => setSubmissionWindow(e.target.value)}
          className="w-full accent-orange-500"
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
          <span>10 min</span><span>30 min</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Assign to Employee</label>
        <select
          value={assignedEmployeeId}
          onChange={e => setAssignedEmployeeId(e.target.value)}
          className="w-full px-3 py-2.5 text-white text-sm outline-none"
          style={inputStyle}
          {...focusRing}
        >
          <option value="">Anyone at this location</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.display_name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button className="flex-1" loading={saving} disabled={!name.trim()} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Station'}
        </Button>
        <Button className="flex-1" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

export default function StationsPage() {
  const { employee } = useAuth()
  const [stations, setStations] = useState([])
  const [employees, setEmployees] = useState([])
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

  useEffect(() => {
    loadStations()
    if (locationId) {
      supabase.from('employees')
        .select('id, display_name, role')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .in('role', ['employee', 'manager'])
        .order('display_name')
        .then(({ data }) => setEmployees(data || []))
    }
  }, [loadStations, locationId])

  async function handleSave({ name, scheduleType, intervalMinutes, windowStart, windowEnd, submissionWindow, assignedEmployeeId, minGapMinutes }) {
    try {
      const schedulePayload = {
        type: scheduleType,
        interval_minutes: intervalMinutes,
        active_start_time: windowStart,
        active_end_time: windowEnd,
        submission_window_minutes: submissionWindow,
        min_gap_minutes: scheduleType === 'random' ? minGapMinutes : null,
      }

      if (editingStation) {
        // Update existing station
        await supabase.from('stations').update({ name, assigned_employee_id: assignedEmployeeId }).eq('id', editingStation.id)
        // Update schedule
        if (editingStation.schedule?.id) {
          await supabase.from('check_schedules').update(schedulePayload).eq('id', editingStation.schedule.id)
        }
      } else {
        // Create new station
        const token = generateToken()
        const { data: newStation } = await supabase.from('stations').insert({
          location_id: locationId,
          name,
          qr_code_token: token,
          is_active: true,
          assigned_employee_id: assignedEmployeeId,
        }).select().single()

        // Create schedule
        await supabase.from('check_schedules').insert({
          station_id: newStation.id,
          ...schedulePayload,
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
      <PageHeader
        title="Stations"
        description="Manage food stations and QR codes"
        action={!showForm && (
          <Button icon={Plus} onClick={() => { setEditingStation(null); setShowForm(true) }}>
            Add Station
          </Button>
        )}
      />

      {showForm && (
        <div className="mb-6">
          <StationForm
            station={editingStation}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingStation(null) }}
            employees={employees}
          />
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : stations.length === 0 ? (
        <EmptyState icon={MapPin} title="No stations yet" description="Add your first food station to get started." />
      ) : (
        <div className="space-y-3">
          {stations.map(st => (
            <Card key={st.id} style={{ opacity: st.is_active ? 1 : 0.6 }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white">{st.name}</h3>
                    <Badge color={st.is_active ? 'green' : 'gray'}>{st.is_active ? 'Active' : 'Inactive'}</Badge>
                    {st.schedule && <Badge color="gray" className="capitalize">{st.schedule.type}</Badge>}
                  </div>
                  {st.schedule && (
                    <div className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
                      {st.schedule.type === 'scheduled'
                        ? `Every ${st.schedule.interval_minutes} min • `
                        : st.schedule.min_gap_minutes ? `Min ${st.schedule.min_gap_minutes} min gap • ` : ''}
                      {st.schedule.active_start_time}–{st.schedule.active_end_time} •
                      {' '}{st.schedule.submission_window_minutes} min window
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: st.assigned_employee_id ? 'var(--accent)' : 'var(--text-faint)' }}>
                    <User size={12} />
                    {st.assigned_employee_id
                      ? `Assigned: ${employees.find(e => e.id === st.assigned_employee_id)?.display_name || 'Unknown'}`
                      : 'Unassigned — visible to all'}
                  </div>
                  <div className="text-xs mt-1.5 font-mono truncate" style={{ color: 'var(--text-faint)' }}>
                    /check/{st.qr_code_token}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={QrCode}
                    onClick={() => setQrStation(st)}
                    style={{ background: 'var(--blue-soft)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
                    aria-label="Show QR code"
                    className="!px-2.5"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Pencil}
                    onClick={() => { setEditingStation(st); setShowForm(true) }}
                    aria-label="Edit station"
                    className="!px-2.5"
                  />
                  <Button
                    size="sm"
                    variant={st.is_active ? 'danger' : 'success'}
                    onClick={() => toggleActive(st)}
                  >
                    {st.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {qrStation && <QRModal station={qrStation} onClose={() => setQrStation(null)} />}
    </div>
  )
}
