import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { differenceInSeconds, format } from 'date-fns'

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
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl flex flex-col items-center justify-center gap-3 transition-all"
          style={{ aspectRatio: '4/3', background: '#1a2235', border: '2px dashed #374151' }}
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium text-gray-400">Photo {index + 1}</span>
          <input
            ref={inputRef} type="file" accept="image/*" capture="environment"
            onChange={handleFile} style={{ display: 'none' }}
          />
        </button>
      )}
      {!photo && (
        <input
          ref={inputRef} type="file" accept="image/*" capture="environment"
          onChange={handleFile} style={{ display: 'none' }}
        />
      )}
    </div>
  )
}

export default function FixItPage() {
  const { submissionId } = useParams()
  const { employee } = useAuth()
  const navigate = useNavigate()

  const [submission, setSubmission] = useState(null)
  const [stationName, setStationName] = useState('')
  const [photos, setPhotos] = useState([null, null])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => { load() }, [submissionId])

  useEffect(() => {
    if (!submission?.fix_deadline) return
    function tick() {
      const secs = differenceInSeconds(new Date(submission.fix_deadline), new Date())
      if (secs <= 0) { setExpired(true); setRemaining(0) }
      else setRemaining(secs)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [submission])

  async function load() {
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('submissions')
        .select('*, check_requests(stations(name))')
        .eq('id', submissionId)
        .single()

      if (err || !data) { setError('Submission not found.'); setLoading(false); return }
      if (data.employee_id !== employee?.id) { setError('This fix request isn\'t yours.'); setLoading(false); return }
      if (data.fix_status !== 'needs_fix') {
        setError(data.fix_status === 'fixed' ? 'This has already been fixed.' : 'This fix window has closed.')
        setLoading(false)
        return
      }

      setStationName(data.check_requests?.stations?.name || 'Station')
      setSubmission(data)
    } finally {
      setLoading(false)
    }
  }

  function handleCapture(index, file, preview) {
    setPhotos(prev => {
      const next = [...prev]
      next[index] = { file, preview }
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
    const captured = photos.filter(Boolean)
    if (captured.length < 2) { setError('Take both photos before submitting.'); return }

    setSubmitting(true)
    setError('')
    try {
      const locationId = employee.location_id
      const dateStr = format(new Date(), 'yyyy-MM-dd')
      const urls = []

      for (let i = 0; i < captured.length; i++) {
        const photo = captured[i]
        const ext = photo.file.type.split('/')[1] || 'jpg'
        const path = `${locationId}/fixit/${dateStr}/${submissionId}/photo_${i + 1}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('submissions')
          .upload(path, photo.file, { contentType: photo.file.type, upsert: false })
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

        const { data: signedData, error: signError } = await supabase.storage
          .from('submissions')
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
        if (signError) throw new Error(`Failed to get photo URL: ${signError.message}`)

        urls.push(signedData.signedUrl)
      }

      const { error: rpcError } = await supabase.rpc('submit_fixit_photos', {
        p_submission_id: submissionId,
        p_photo_urls: urls,
      })
      if (rpcError) throw rpcError

      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
             style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
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
          <h1 className="text-3xl font-black text-white mb-2">Fixed!</h1>
          <p className="text-gray-400 mb-6">Your new photos are in. Your manager will take a look.</p>
          <button onClick={() => navigate('/dashboard')} className="w-full py-3 rounded-xl font-bold text-white"
                  style={{ background: '#ff6b2b' }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error && !submission) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0f1e' }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Can't Fix This One</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="w-full py-3 rounded-xl font-bold text-white"
                  style={{ background: '#ff6b2b' }}>
            Back to Dashboard
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
          <h2 className="text-xl font-bold text-white mb-2">Fix Window Closed</h2>
          <p className="text-gray-400 mb-6">The 30-minute window to fix this submission has passed.</p>
          <button onClick={() => navigate('/dashboard')} className="w-full py-3 rounded-xl font-bold text-white"
                  style={{ background: '#ff6b2b' }}>
            Back to Dashboard
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
      <div className="px-4 py-4" style={{ background: '#1a2235', borderBottom: '1px solid #2d3748' }}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#f59e0b' }}>
              🔧 FixIt
            </div>
            <h1 className="text-xl font-black text-white">{stationName}</h1>
          </div>
          {remaining > 0 && (
            <div className="text-right">
              <div className="font-mono font-bold text-xl" style={{ color: remaining < 300 ? '#ef4444' : '#f59e0b' }}>
                {mins}:{String(secs).padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-500">remaining</div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p className="text-sm" style={{ color: '#fbbf24' }}>
            This station scored low. Take 2 fresh photos showing it's now stocked, hot, and clean —
            you have 30 minutes from the rating to fix it.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {photos.map((photo, i) => (
            <PhotoSlot key={i} index={i} photo={photo} onCapture={handleCapture} onRemove={handleRemove} />
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-xl text-sm text-red-300"
               style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || capturedCount < 2}
          className="w-full py-4 rounded-xl font-black text-white text-lg transition-all"
          style={{
            background: submitting || capturedCount < 2 ? '#374151' : '#f59e0b',
            cursor: submitting || capturedCount < 2 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Uploading...' : capturedCount < 2 ? `Take ${2 - capturedCount} more photo${2 - capturedCount > 1 ? 's' : ''}` : '✓ Submit Fix'}
        </button>
      </div>
    </div>
  )
}
