import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'
import { Card, PageLoader, EmptyState, Button, PageHeader } from '../components/ui'
import { MessageSquare, MapPin, X, Star, ClipboardCheck } from 'lucide-react'

function StarRating({ value, onChange, max = 5, label }) {
  return (
    <div>
      <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map(star => (
          <button
            key={star}
            onClick={() => onChange(star)}
            className="w-9 h-9 rounded-lg text-lg transition-all duration-150 font-bold active:scale-95"
            style={value >= star
              ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(255,107,43,0.4)' }
              : { background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid transparent' }}
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
    <div className="rounded-2xl overflow-hidden animate-in"
         style={{ background: 'var(--surface)', border: `1px solid ${alreadyRated ? 'var(--border)' : 'rgba(255,107,43,0.3)'}`, boxShadow: alreadyRated ? 'var(--shadow-sm)' : 'var(--shadow-glow)' }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <div className="font-bold text-white truncate">{submission.check_requests?.stations?.name}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {submission.employees?.display_name} • {format(new Date(submission.submitted_at), 'MMM d, h:mm a')}
            {submission.is_late && <span className="ml-2 font-medium" style={{ color: '#fbbf24' }}>• Late</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {alreadyRated ? (
            <div className="font-black text-2xl" style={{ color: ratingColor }}>{total}/15</div>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(255,107,43,0.3)' }}>
              Needs Rating
            </span>
          )}
        </div>
      </div>

      {/* Photos */}
      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {submission.photo_urls?.map((url, i) => (
            <button key={i} onClick={() => setLightboxUrl(url)} className="flex-shrink-0 transition-transform duration-200 hover:scale-[1.02]">
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="h-32 w-44 object-cover rounded-xl"
                style={{ border: '1px solid var(--border)' }}
              />
            </button>
          ))}
        </div>

        {submission.employee_note && (
          <div className="flex items-start gap-2 mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--inset)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <MessageSquare size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-faint)' }} />
            {submission.employee_note}
          </div>
        )}

        {/* Geolocation info */}
        {submission.geolocation_lat && (
          <div className="flex items-center gap-1.5 mb-4 text-xs" style={{ color: 'var(--text-faint)' }}>
            <MapPin size={12} />
            {submission.geolocation_lat.toFixed(4)}, {submission.geolocation_lng.toFixed(4)}
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
                   style={{ background: 'var(--inset)', border: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Score</span>
                <span className="font-black text-2xl" style={{ color: ratingColor }}>{total}/15</span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              loading={saving}
              disabled={!freshness || !stocked || !cleanliness}
              onClick={submitRating}
            >
              {saving ? 'Saving…' : 'Submit Rating'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: 'Freshness', val: submission.manager_rating_freshness },
              { label: 'Stocked', val: submission.manager_rating_stocked },
              { label: 'Cleanliness', val: submission.manager_rating_cleanliness },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--inset)' }}>
                <div className="font-bold text-white">{item.val}/5</div>
                <div className="text-xs" style={{ color: 'var(--text-faint)' }}>{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in"
             style={{ background: 'rgba(6,9,18,0.92)' }}
             onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full view" className="max-w-full max-h-full rounded-xl object-contain" />
          <button
            aria-label="Close"
            className="absolute top-4 right-4 text-white w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X size={20} />
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
      <PageHeader
        title="Submissions"
        description="Rate employee check submissions"
        action={unratedCount > 0 && (
          <div className="px-3 py-1.5 rounded-xl text-sm font-bold"
               style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(255,107,43,0.3)' }}>
            {unratedCount} pending
          </div>
        )}
      />

      {/* Filter tabs */}
      <div className="flex rounded-xl p-1 mb-6" style={{ background: 'var(--inset)' }}>
        {[
          { key: 'unrated', label: 'Needs Rating' },
          { key: 'all', label: 'All Submissions' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={filter === tab.key
              ? { background: 'var(--accent)', color: 'white', boxShadow: 'var(--shadow-glow)' }
              : { color: 'var(--text-muted)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={filter === 'unrated' ? ClipboardCheck : Star}
          title={filter === 'unrated' ? 'All caught up!' : 'No submissions yet'}
          description={filter === 'unrated' ? 'No submissions waiting to be rated.' : "Employees haven't submitted any checks."}
        />
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
