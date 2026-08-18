import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { differenceInSeconds, format } from 'date-fns'
import { Button, PageLoader } from '../components/ui'
import { Camera, X, Check, AlertTriangle, Clock, Zap, ClipboardList, MessageSquare } from 'lucide-react'

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
        <div className="relative rounded-2xl overflow-hidden animate-in" style={{ aspectRatio: '4/3' }}>
          <img src={photo.preview} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(index)}
            aria-label="Remove photo"
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white"
               style={{ background: 'rgba(34,197,94,0.85)' }}>
            <Check size={12} strokeWidth={3} /> Photo {index + 1}
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-[0.99]"
          style={{ aspectRatio: '4/3', background: 'var(--surface)', border: '2px dashed var(--border)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
            <Camera size={22} strokeWidth={1.75} />
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {index === 0 ? 'Required' : index === 1 ? 'Required' : 'Optional'} Photo {index + 1}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Tap to capture</span>
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
  const { employee } = useAuth()
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
  if (loading) return <PageLoader label="Verifying QR code…" />

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-in">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
               style={{ background: 'var(--green-soft)', border: '2px solid rgba(34,197,94,0.3)' }}>
            <Check size={36} strokeWidth={2.5} style={{ color: '#4ade80' }} />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Submitted!</h1>
          <p className="mb-6" style={{ color: 'var(--text-faint)' }}>
            Your photos have been uploaded. Wait for your manager to rate them.
          </p>
          <div className="rounded-xl p-4 mb-6 text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-sm" style={{ color: 'var(--text-faint)' }}>Station</div>
            <div className="font-bold text-white">{station?.name}</div>
            <div className="text-sm mt-2" style={{ color: 'var(--text-faint)' }}>Submitted at</div>
            <div className="font-medium text-white">{format(new Date(), 'h:mm:ss a')}</div>
          </div>
          <Button className="w-full" size="lg" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (error && !checkRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-in">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--amber-soft)', color: '#fbbf24' }}>
            <AlertTriangle size={30} strokeWidth={2} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Check Not Available</h2>
          <p className="mb-6" style={{ color: 'var(--text-faint)' }}>{error}</p>
          <Button className="w-full" size="lg" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm animate-in">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
            <Clock size={30} strokeWidth={2} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Check Window Expired</h2>
          <p className="mb-6" style={{ color: 'var(--text-faint)' }}>The submission window for this check has closed.</p>
          <Button className="w-full" size="lg" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const capturedCount = photos.filter(Boolean).length
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const isRandom = checkRequest?.trigger_type === 'random'

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="px-4 py-4" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--accent)' }}>
              {isRandom ? <Zap size={13} strokeWidth={2.5} /> : <ClipboardList size={13} strokeWidth={2.5} />}
              {isRandom ? 'Surprise Check' : 'Scheduled Check'}
            </div>
            <h1 className="text-xl font-black text-white">{station?.name}</h1>
          </div>
          {remaining > 0 && (
            <div className="text-right">
              <div className="font-mono font-bold text-xl" style={{ color: remaining < 180 ? '#ef4444' : 'var(--accent)' }}>
                {mins}:{String(secs).padStart(2, '0')}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-faint)' }}>remaining</div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Instructions */}
        <div className="flex items-start gap-2.5 rounded-xl p-4" style={{ background: 'var(--accent-soft)', border: '1px solid rgba(255,107,43,0.2)' }}>
          <Camera size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: '#fed7aa' }}>
            <strong>Take 2–3 photos</strong> of the food station showing it is stocked, hot, and clean.
            Photos must be taken live with your camera — no gallery uploads.
          </p>
        </div>

        {/* Geolocation warning */}
        {geoError && (
          <div className="flex items-start gap-2.5 rounded-xl p-3 text-sm" style={{ background: 'var(--amber-soft)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            {geoError}
          </div>
        )}

        {/* Photo capture grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white text-base">Photos</h2>
            <span className="text-sm" style={{ color: capturedCount >= 2 ? '#4ade80' : 'var(--text-muted)' }}>
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
          <label className="flex items-center gap-1.5 text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            <MessageSquare size={14} />
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Any notes about the station condition..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-white text-sm resize-none outline-none transition-colors"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl text-sm animate-in" style={{ background: 'var(--red-soft)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          size="lg"
          loading={submitting}
          disabled={capturedCount < 2}
          icon={!submitting && capturedCount >= 2 ? Check : undefined}
          onClick={handleSubmit}
          style={{ padding: '16px 24px', fontSize: '1.0625rem', fontWeight: 800 }}
        >
          {submitting
            ? 'Uploading…'
            : capturedCount < 2
              ? `Take ${2 - capturedCount} more photo${2 - capturedCount > 1 ? 's' : ''}`
              : 'Submit Check'}
        </Button>

        <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
          Submission will be geotagged and timestamped.
        </p>
      </div>
    </div>
  )
}
