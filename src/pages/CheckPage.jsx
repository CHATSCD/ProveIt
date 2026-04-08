import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { differenceInSeconds, format } from 'date-fns'
// Simple UUID v4
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function PhotoSlot({ index, photo, onCapture, onRemove }) {
  const inputRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      onCapture(index, file, url)
    }
    e.target.value = ''
  }

  return (
    <div>
      {photo ? (
        <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <img src={photo.preview} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(index)}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            ✕
          </button>
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg text-xs font-bold text-white"
               style={{ background: 'rgba(34,197,94,0.8)' }}>
            ✓ Photo {index + 1}
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl flex flex-col items-center justify-center gap-3 transition-all"
          style={{ aspectRatio: '4/3', background: '#1a2235', border: '2px dashed #374151' }}
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium text-gray-400">
            {index === 0 ? 'Required' : index === 1 ? 'Required' : 'Optional'} Photo {index + 1}
          </span>
          <span className="text-xs text-gray-600">Tap to capture</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </button>
      )}
      {!photo && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      )}
    </div>
  )
}

export default function CheckPage() {
  const { token } = useParams()
  const { employee, user } = useAuth()
  const navigate = useNavigate()

  const [checkRequest, setCheckRequest] = useState(null)
  const [station, setStation] = useState(null)
  const [photos, setPhotos] = useState([null, null, null]) // up to 3 slots
  const [note, setNote] = useState('')
  const [geolocation, setGeolocation] = useState(null)
  const [geoError, setGeoError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    loadCheck()
    getGeolocation()
  }, [token])

  useEffect(() => {
    if (!checkRequest) return
    const interval = setInterval(() => {
      const secs = differenceInSeconds(new Date(checkRequest.expires_at), new Date())
      if (secs <= 0) {
        setExpired(true)
        setRemaining(0)
      } else {
        setRemaining(secs)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [checkRequest])

  async function loadCheck() {
    setLoading(true)
    try {
      // Find the station with this QR token
      const { data: stationData } = await supabase
        .from('stations')
        .select('*')
        .eq('qr_code_token', token)
        .eq('is_active', true)
        .single()

      if (!stationData) { setError('Invalid or inactive station QR code.'); setLoading(false); return }
      setStation(stationData)

      // Find the most recent pending check request for this station
      const { data: checks } = await supabase
        .from('check_requests')
        .select('*')
        .eq('station_id', stationData.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('triggered_at', { ascending: false })
        .limit(1)

      if (!checks?.length) {
        setError('No active check request for this station right now. Come back when a check is triggered.')
        setLoading(false)
        return
      }

      setCheckRequest(checks[0])
    } finally {
      setLoading(false)
    }
  }

  function getGeolocation() {
    if (!navigator.geolocation) { setGeoError('Geolocation not supported'); return }
    navigator.geolocation.getCurrentPosition(
      pos => setGeolocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError('Could not get location. Submission will still work but may be flagged.')
    )
  }

  function handleCapture(index, file, preview) {
    setPhotos(prev => {
      const next = [...prev]
      next[index] = { file, preview, capturedAt: Date.now() }
      return next
    })
  }

  function handleRemove(index) {
    setPhotos(prev => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  async function handleSubmit() {
    const capturedPhotos = photos.filter(Boolean)
    if (capturedPhotos.length < 2) {
      setError('Please take at least 2 photos before submitting.')
      return
    }
    if (!checkRequest) return

    setSubmitting(true)
    setError('')

    try {
      const submissionId = generateId()
      const locationId = station.location_id
      const stationId = station.id
      const dateStr = format(new Date(), 'yyyy-MM-dd')
      const photoUrls = []

      // Upload photos to Supabase Storage
      for (let i = 0; i < capturedPhotos.length; i++) {
        const photo = capturedPhotos[i]
        const ext = photo.file.type.split('/')[1] || 'jpg'
        const path = `${locationId}/${stationId}/${dateStr}/${submissionId}/photo_${i + 1}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('submissions')
          .upload(path, photo.file, { contentType: photo.file.type, upsert: false })

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

        const { data: { publicUrl } } = supabase.storage
          .from('submissions')
          .getPublicUrl(path)

        photoUrls.push(publicUrl)
      }

      // Determine if late (submitted within window but after trigger + 5 min grace)
      const triggeredAt = new Date(checkRequest.triggered_at)
      const graceMs = 5 * 60 * 1000
      const isLate = Date.now() > triggeredAt.getTime() + graceMs

      // Create submission record
      const { error: subError } = await supabase.from('submissions').insert({
        id: submissionId,
        check_request_id: checkRequest.id,
        employee_id: employee?.id,
        submitted_at: new Date().toISOString(),
        photo_urls: photoUrls,
        geolocation_lat: geolocation?.lat || null,
        geolocation_lng: geolocation?.lng || null,
        employee_note: note || null,
        is_late: isLate,
      })

      if (subError) throw new Error(subError.message)

      // Mark check request as submitted
      await supabase.from('check_requests')
        .update({ status: 'submitted' })
        .eq('id', checkRequest.id)

      // Award base points (will be finalized after rating)
      const basePoints = isLate ? 3 : (checkRequest.trigger_type === 'random' ? 20 : 10)
      await upsertShiftScore(basePoints, isLate)

      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function upsertShiftScore(points, isLate) {
    if (!employee) return
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const { data: existing } = await supabase
      .from('shift_scores')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('location_id', employee.location_id)
      .gte('period_start', weekStart.toISOString())
      .single()

    if (existing) {
      await supabase.from('shift_scores').update({
        total_points: existing.total_points + points,
        on_time_count: existing.on_time_count + (isLate ? 0 : 1),
        late_count: existing.late_count + (isLate ? 1 : 0),
      }).eq('id', existing.id)
    } else {
      await supabase.from('shift_scores').insert({
        employee_id: employee.id,
        location_id: employee.location_id,
        period_start: weekStart.toISOString(),
        period_end: weekEnd.toISOString(),
        total_points: points,
        on_time_count: isLate ? 0 : 1,
        late_count: isLate ? 1 : 0,
        missed_count: 0,
        avg_rating: 0,
      })
    }
  }

  // ── Render states ───────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
          <p className="text-gray-400">Verifying QR code...</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0f1e' }}>
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
               style={{ background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)' }}>
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Submitted!</h1>
          <p className="text-gray-400 mb-6">
            Your photos have been uploaded. Wait for your manager to rate them.
          </p>
          <div className="rounded-xl p-4 mb-6" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
            <div className="text-sm text-gray-400">Station</div>
            <div className="font-bold text-white">{station?.name}</div>
            <div className="text-sm text-gray-400 mt-2">Submitted at</div>
            <div className="font-medium text-white">{format(new Date(), 'h:mm:ss a')}</div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-white"
            style={{ background: '#ff6b2b' }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error && !checkRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0f1e' }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Check Not Available</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="w-full py-3 rounded-xl font-bold text-white"
                  style={{ background: '#ff6b2b' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0f1e' }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⏰</div>
          <h2 className="text-xl font-bold text-white mb-2">Check Window Expired</h2>
          <p className="text-gray-400 mb-6">The submission window for this check has closed.</p>
          <button onClick={() => navigate('/dashboard')} className="w-full py-3 rounded-xl font-bold text-white"
                  style={{ background: '#ff6b2b' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const capturedCount = photos.filter(Boolean).length
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      {/* Header */}
      <div className="px-4 py-4" style={{ background: '#1a2235', borderBottom: '1px solid #2d3748' }}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#ff6b2b' }}>
              {checkRequest?.trigger_type === 'random' ? '⚡ Surprise Check' : '📋 Scheduled Check'}
            </div>
            <h1 className="text-xl font-black text-white">{station?.name}</h1>
          </div>
          {remaining > 0 && (
            <div className="text-right">
              <div className="font-mono font-bold text-xl" style={{ color: remaining < 180 ? '#ef4444' : '#ff6b2b' }}>
                {mins}:{String(secs).padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-500">remaining</div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Instructions */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.2)' }}>
          <p className="text-sm text-orange-200">
            📸 <strong>Take 2–3 photos</strong> of the food station showing it is stocked, hot, and clean.
            Photos must be taken live with your camera — no gallery uploads.
          </p>
        </div>

        {/* Geolocation warning */}
        {geoError && (
          <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
            ⚠️ {geoError}
          </div>
        )}

        {/* Photo capture grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white text-base">Photos</h2>
            <span className="text-sm" style={{ color: capturedCount >= 2 ? '#22c55e' : '#9ca3af' }}>
              {capturedCount}/3 captured
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {photos.map((photo, i) => (
              <PhotoSlot
                key={i}
                index={i}
                photo={photo}
                onCapture={handleCapture}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Any notes about the station condition..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-white text-sm resize-none outline-none"
            style={{ background: '#1a2235', border: '1px solid #2d3748' }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl text-sm text-red-300"
               style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || capturedCount < 2}
          className="w-full py-4 rounded-xl font-black text-white text-lg transition-all"
          style={{
            background: submitting || capturedCount < 2 ? '#374151' : '#ff6b2b',
            cursor: submitting || capturedCount < 2 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-3">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Uploading...
            </span>
          ) : capturedCount < 2 ? `Take ${2 - capturedCount} more photo${2 - capturedCount > 1 ? 's' : ''}` : '✓ Submit Check'}
        </button>

        <p className="text-center text-xs text-gray-600">
          Submission will be geotagged and timestamped.
        </p>
      </div>
    </div>
  )
}
