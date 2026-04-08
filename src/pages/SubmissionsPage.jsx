import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

const POINTS_TABLE = {
  '13-15': 15,
  '9-12': 8,
  'below-9': 0,
}

function StarRating({ value, onChange, max = 5, label }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-400 mb-1.5">{label}</div>
      <div className="flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map(star => (
          <button
            key={star}
            onClick={() => onChange(star)}
            className="w-9 h-9 rounded-lg text-lg transition-all font-bold"
            style={value >= star
              ? { background: 'rgba(255,107,43,0.2)', color: '#ff6b2b', border: '1px solid rgba(255,107,43,0.4)' }
              : { background: '#374151', color: '#4b5563', border: '1px solid transparent' }}
          >
            {star}
          </button>
        ))}
      </div>
    </div>
  )
}

function SubmissionCard({ submission, onRated }) {
  const [freshness, setFreshness] = useState(submission.manager_rating_freshness || 0)
  const [stocked, setStocked] = useState(submission.manager_rating_stocked || 0)
  const [cleanliness, setCleanliness] = useState(submission.manager_rating_cleanliness || 0)
  const [saving, setSaving] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  const total = freshness + stocked + cleanliness
  const alreadyRated = !!submission.rated_at

  const ratingColor = total >= 13 ? '#22c55e' : total >= 9 ? '#f59e0b' : total > 0 ? '#ef4444' : '#6b7280'

  async function submitRating() {
    if (!freshness || !stocked || !cleanliness) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('submissions').update({
        manager_rating_freshness: freshness,
        manager_rating_stocked: stocked,
        manager_rating_cleanliness: cleanliness,
        manager_rating_total: total,
        rated_at: new Date().toISOString(),
        rated_by: user?.id,
      }).eq('id', submission.id)

      // Award rating bonus points to employee
      let bonusPoints = 0
      if (total >= 13) bonusPoints = 15
      else if (total >= 9) bonusPoints = 8

      if (bonusPoints > 0 && submission.employee_id) {
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        weekStart.setHours(0, 0, 0, 0)

        const { data: score } = await supabase
          .from('shift_scores')
          .select('*')
          .eq('employee_id', submission.employee_id)
          .gte('period_start', weekStart.toISOString())
          .single()

        if (score) {
          await supabase.from('shift_scores').update({
            total_points: score.total_points + bonusPoints,
            avg_rating: ((score.avg_rating * (score.on_time_count + score.late_count - 1)) + total) /
                        (score.on_time_count + score.late_count) || total,
          }).eq('id', score.id)
        }
      }

      onRated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: '#1a2235', border: `1px solid ${alreadyRated ? '#2d3748' : 'rgba(255,107,43,0.3)'}` }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #2d3748' }}>
        <div>
          <div className="font-bold text-white">{submission.check_requests?.stations?.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {submission.employees?.display_name} • {format(new Date(submission.submitted_at), 'MMM d, h:mm a')}
            {submission.is_late && <span className="ml-2 text-yellow-500 font-medium">• Late</span>}
          </div>
        </div>
        <div className="text-right">
          {alreadyRated ? (
            <div className="font-black text-2xl" style={{ color: ratingColor }}>{total}/15</div>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(255,107,43,0.15)', color: '#ff6b2b', border: '1px solid rgba(255,107,43,0.3)' }}>
              Needs Rating
            </span>
          )}
        </div>
      </div>

      {/* Photos */}
      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {submission.photo_urls?.map((url, i) => (
            <button key={i} onClick={() => setLightboxUrl(url)} className="flex-shrink-0">
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="h-32 w-44 object-cover rounded-xl"
                style={{ border: '1px solid #2d3748' }}
              />
            </button>
          ))}
        </div>

        {submission.employee_note && (
          <div className="mb-4 p-3 rounded-xl text-sm text-gray-300"
               style={{ background: '#111827', border: '1px solid #2d3748' }}>
            💬 {submission.employee_note}
          </div>
        )}

        {/* Geolocation info */}
        {submission.geolocation_lat && (
          <div className="mb-4 text-xs text-gray-600">
            📍 {submission.geolocation_lat.toFixed(4)}, {submission.geolocation_lng.toFixed(4)}
          </div>
        )}

        {/* Rating controls */}
        {!alreadyRated ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StarRating value={freshness} onChange={setFreshness} label="Freshness" />
              <StarRating value={stocked} onChange={setStocked} label="Stocked" />
              <StarRating value={cleanliness} onChange={setCleanliness} label="Cleanliness" />
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl"
                   style={{ background: '#111827', border: '1px solid #2d3748' }}>
                <span className="text-sm text-gray-400">Total Score</span>
                <span className="font-black text-2xl" style={{ color: ratingColor }}>{total}/15</span>
              </div>
            )}

            <button
              onClick={submitRating}
              disabled={saving || !freshness || !stocked || !cleanliness}
              className="w-full py-3 rounded-xl font-bold text-white transition-all"
              style={{
                background: saving || !freshness || !stocked || !cleanliness ? '#374151' : '#ff6b2b',
                cursor: saving || !freshness || !stocked || !cleanliness ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Submit Rating'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: 'Freshness', val: submission.manager_rating_freshness },
              { label: 'Stocked', val: submission.manager_rating_stocked },
              { label: 'Cleanliness', val: submission.manager_rating_cleanliness },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: '#111827' }}>
                <div className="font-bold text-white">{item.val}/5</div>
                <div className="text-xs text-gray-500">{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.9)' }}
             onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full view" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl font-bold w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export default function SubmissionsPage() {
  const { employee } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [filter, setFilter] = useState('unrated') // 'unrated' | 'all'
  const [loading, setLoading] = useState(true)

  const loadSubmissions = useCallback(async () => {
    if (!employee?.location_id) return
    setLoading(true)
    try {
      let query = supabase
        .from('submissions')
        .select(`
          *,
          employees(display_name),
          check_requests(triggered_at, trigger_type, stations(name, location_id))
        `)
        .eq('check_requests.stations.location_id', employee.location_id)
        .order('submitted_at', { ascending: false })
        .limit(50)

      if (filter === 'unrated') {
        query = query.is('rated_at', null)
      }

      const { data } = await query
      setSubmissions(data?.filter(s => s.check_requests?.stations) || [])
    } finally {
      setLoading(false)
    }
  }, [employee?.location_id, filter])

  useEffect(() => { loadSubmissions() }, [loadSubmissions])

  const unratedCount = submissions.filter(s => !s.rated_at).length

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Submissions</h1>
          <p className="text-gray-400 text-sm mt-0.5">Rate employee check submissions</p>
        </div>
        {unratedCount > 0 && (
          <div className="px-3 py-1.5 rounded-xl text-sm font-bold"
               style={{ background: 'rgba(255,107,43,0.15)', color: '#ff6b2b', border: '1px solid rgba(255,107,43,0.3)' }}>
            {unratedCount} pending
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex rounded-xl p-1 mb-6" style={{ background: '#111827' }}>
        {[
          { key: 'unrated', label: 'Needs Rating' },
          { key: 'all', label: 'All Submissions' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={filter === tab.key
              ? { background: '#ff6b2b', color: 'white' }
              : { color: '#9ca3af' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="text-4xl mb-3">★</div>
          <h3 className="text-white font-bold mb-1">
            {filter === 'unrated' ? 'All caught up!' : 'No submissions yet'}
          </h3>
          <p className="text-gray-400 text-sm">
            {filter === 'unrated' ? 'No submissions waiting to be rated.' : 'Employees haven\'t submitted any checks.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map(sub => (
            <SubmissionCard key={sub.id} submission={sub} onRated={loadSubmissions} />
          ))}
        </div>
      )}
    </div>
  )
}
