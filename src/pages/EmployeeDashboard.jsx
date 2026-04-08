import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns'

function Countdown({ expiresAt }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    function tick() {
      const secs = differenceInSeconds(new Date(expiresAt), new Date())
      setRemaining(Math.max(0, secs))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const pct = Math.min(100, (remaining / (15 * 60)) * 100)
  const urgent = remaining < 180 // under 3 min

  if (remaining === 0) return <span className="text-red-400 text-sm font-bold">Expired</span>

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#1f2937" strokeWidth="4"/>
          <circle cx="24" cy="24" r="20" fill="none"
                  stroke={urgent ? '#ef4444' : '#ff6b2b'} strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
                  strokeLinecap="round"/>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold"
              style={{ color: urgent ? '#ef4444' : '#ff6b2b' }}>
          {mins}:{String(secs).padStart(2, '0')}
        </span>
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color: urgent ? '#ef4444' : 'white' }}>
          {mins}m {secs}s remaining
        </div>
        <div className="text-xs text-gray-500">Submit before window closes</div>
      </div>
    </div>
  )
}

function ActiveCheckCard({ check }) {
  return (
    <div className="rounded-2xl p-5"
         style={{ background: '#1a2235', border: '1px solid rgba(255,107,43,0.4)',
                  boxShadow: '0 0 20px rgba(255,107,43,0.1)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1"
               style={{ color: '#ff6b2b' }}>
            {check.trigger_type === 'random' ? '⚡ Surprise Check!' : '📋 Scheduled Check'}
          </div>
          <h3 className="text-lg font-bold text-white">{check.stations?.name}</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Triggered {formatDistanceToNow(new Date(check.triggered_at), { addSuffix: true })}
          </p>
        </div>
        <div className="text-2xl">{check.trigger_type === 'random' ? '⚡' : '📋'}</div>
      </div>

      <Countdown expiresAt={check.expires_at} />

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid #2d3748' }}>
        <Link
          to={`/check/${check.stations?.qr_code_token}`}
          className="block w-full py-3 rounded-xl text-center font-bold text-white no-underline transition-all"
          style={{ background: '#ff6b2b' }}
        >
          📸 Go to Station & Submit Photos
        </Link>
      </div>
    </div>
  )
}

function ScoreBadge({ points }) {
  const tier = points >= 500 ? { label: 'Elite', color: '#ff6b2b', bg: 'rgba(255,107,43,0.15)' }
    : points >= 250 ? { label: 'Pro', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' }
    : points >= 100 ? { label: 'Rising', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' }
    : { label: 'Rookie', color: '#9ca3af', bg: 'rgba(107,114,128,0.15)' }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: tier.color, background: tier.bg }}>
      {tier.label}
    </span>
  )
}

export default function EmployeeDashboard() {
  const { employee } = useAuth()
  const [activeChecks, setActiveChecks] = useState([])
  const [recentSubmissions, setRecentSubmissions] = useState([])
  const [shiftScore, setShiftScore] = useState(null)
  const [leaderboardRank, setLeaderboardRank] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!employee) return
    setLoading(true)
    try {
      // Active (pending) check requests for this employee's location
      const { data: checks } = await supabase
        .from('check_requests')
        .select('*, stations(id, name, qr_code_token, location_id)')
        .eq('status', 'pending')
        .eq('stations.location_id', employee.location_id)
        .gt('expires_at', new Date().toISOString())
        .order('triggered_at', { ascending: false })

      setActiveChecks(checks?.filter(c => c.stations) || [])

      // Recent submissions by this employee
      const { data: subs } = await supabase
        .from('submissions')
        .select('*, check_requests(triggered_at, trigger_type, stations(name))')
        .eq('employee_id', employee.id)
        .order('submitted_at', { ascending: false })
        .limit(10)

      setRecentSubmissions(subs || [])

      // This week's shift score
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      weekStart.setHours(0, 0, 0, 0)

      const { data: scores } = await supabase
        .from('shift_scores')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('location_id', employee.location_id)
        .gte('period_start', weekStart.toISOString())
        .order('period_start', { ascending: false })
        .limit(1)

      if (scores?.length) {
        setShiftScore(scores[0])
        // Get rank
        const { count } = await supabase
          .from('shift_scores')
          .select('id', { count: 'exact' })
          .eq('location_id', employee.location_id)
          .gte('period_start', weekStart.toISOString())
          .gt('total_points', scores[0].total_points)
        setLeaderboardRank((count || 0) + 1)
      }
    } finally {
      setLoading(false)
    }
  }, [employee])

  useEffect(() => {
    loadData()

    // Real-time: listen for new check requests
    const channel = supabase
      .channel('employee-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'check_requests' }, loadData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'check_requests' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, loadData)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
          <p className="text-gray-400 text-sm">Loading your shift...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header with score */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Hey, {employee?.display_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black" style={{ color: '#ff6b2b', fontFamily: 'Syne, sans-serif' }}>
            {shiftScore?.total_points ?? 0}
          </div>
          <div className="text-xs text-gray-500">ShiftScore™</div>
          {shiftScore && <ScoreBadge points={shiftScore.total_points} />}
        </div>
      </div>

      {/* Score stats */}
      {shiftScore && (
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[
            { label: 'On Time', value: shiftScore.on_time_count, color: '#22c55e' },
            { label: 'Late', value: shiftScore.late_count, color: '#f59e0b' },
            { label: 'Missed', value: shiftScore.missed_count, color: '#ef4444' },
            { label: 'Rank', value: leaderboardRank ? `#${leaderboardRank}` : '—', color: '#ff6b2b' },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
              <div className="font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Active checks */}
      {activeChecks.length > 0 ? (
        <div className="mb-6">
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ff6b2b' }}></span>
            Active Check Requests ({activeChecks.length})
          </h2>
          <div className="space-y-3">
            {activeChecks.map(check => (
              <ActiveCheckCard key={check.id} check={check} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl p-8 text-center"
             style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="text-3xl mb-2">✓</div>
          <h3 className="text-white font-bold mb-1">All Clear</h3>
          <p className="text-gray-400 text-sm">No active checks right now. You'll be notified when one comes in.</p>
        </div>
      )}

      {/* Recent submissions */}
      {recentSubmissions.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-white mb-3">Recent Submissions</h2>
          <div className="space-y-2">
            {recentSubmissions.map(sub => (
              <div key={sub.id} className="rounded-xl p-4 flex items-center gap-3"
                   style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
                {/* Thumbnail */}
                {sub.photo_urls?.[0] && (
                  <img src={sub.photo_urls[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                       style={{ border: '1px solid #2d3748' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-white truncate">
                    {sub.check_requests?.stations?.name || 'Station'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {format(new Date(sub.submitted_at), 'MMM d, h:mm a')}
                    {sub.is_late && <span className="ml-2 text-yellow-500">• Late</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {sub.rated_at ? (
                    <>
                      <div className="font-bold text-lg" style={{ color: sub.manager_rating_total >= 13 ? '#22c55e' : sub.manager_rating_total >= 9 ? '#f59e0b' : '#ef4444' }}>
                        {sub.manager_rating_total}/15
                      </div>
                      <div className="text-xs text-gray-500">Rated</div>
                    </>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#374151', color: '#9ca3af' }}>
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
