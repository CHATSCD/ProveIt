import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow, format } from 'date-fns'

function StationStatusCard({ station, onTriggerCheck }) {
  const [triggering, setTriggering] = useState(false)

  const lastCheck = station.last_check
  const status = lastCheck?.status || 'no_data'

  const statusConfig = {
    submitted: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', label: 'Submitted', dot: '#22c55e' },
    pending: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', label: 'Pending', dot: '#f59e0b' },
    missed: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', label: 'Missed', dot: '#ef4444' },
    no_data: { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.3)', label: 'No Data', dot: '#6b7280' },
  }
  const cfg = statusConfig[status] || statusConfig.no_data

  async function triggerCheck() {
    setTriggering(true)
    try {
      await onTriggerCheck(station.id)
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
         style={{ background: '#1a2235', border: `1px solid ${cfg.border}` }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-white text-lg">{station.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full" style={{ background: cfg.dot }}></span>
            <span className="text-sm font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
            {!station.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#374151', color: '#9ca3af' }}>
                Inactive
              </span>
            )}
          </div>
        </div>
        <button
          onClick={triggerCheck}
          disabled={triggering || !station.is_active}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
          style={triggering || !station.is_active
            ? { background: '#374151', color: '#6b7280', cursor: 'not-allowed' }
            : { background: 'rgba(255,107,43,0.15)', color: '#ff6b2b', border: '1px solid rgba(255,107,43,0.3)' }}
        >
          {triggering ? 'Triggering...' : '+ Manual Check'}
        </button>
      </div>

      {/* Last submission photo */}
      {lastCheck?.submission?.photo_urls?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {lastCheck.submission.photo_urls.slice(0, 3).map((url, i) => (
            <img
              key={i}
              src={url}
              alt="Station photo"
              className="h-20 w-28 object-cover rounded-lg flex-shrink-0"
              style={{ border: '1px solid #2d3748' }}
            />
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: '#111827' }}>
          <div className="text-lg font-bold text-white">
            {lastCheck?.submission?.manager_rating_total ?? '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Last Score</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: '#111827' }}>
          <div className="text-sm font-bold text-white">
            {lastCheck?.submitted_at
              ? formatDistanceToNow(new Date(lastCheck.submitted_at), { addSuffix: true })
              : lastCheck?.triggered_at
              ? formatDistanceToNow(new Date(lastCheck.triggered_at), { addSuffix: true })
              : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Last Activity</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: '#111827' }}>
          <div className="text-sm font-bold" style={{ color: '#ff6b2b' }}>
            {station.schedule?.interval_minutes
              ? `${station.schedule.interval_minutes}m`
              : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Interval</div>
        </div>
      </div>

      {/* Employee info */}
      {lastCheck?.submission?.employee && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
               style={{ background: '#374151', color: '#ff6b2b' }}>
            {lastCheck.submission.employee.display_name?.[0]?.toUpperCase()}
          </div>
          <span>{lastCheck.submission.employee.display_name}</span>
          {lastCheck.submission.is_late && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              Late
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ManagerDashboard() {
  const { employee } = useAuth()
  const [stations, setStations] = useState([])
  const [todayStats, setTodayStats] = useState({ total: 0, onTime: 0, late: 0, missed: 0 })
  const [topPerformer, setTopPerformer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingRatings, setPendingRatings] = useState(0)

  const locationId = employee?.location_id

  const loadData = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      // Load stations with their latest check request
      const { data: stationsData } = await supabase
        .from('stations')
        .select(`
          *,
          check_schedules(id, type, interval_minutes, active_start_time, active_end_time)
        `)
        .eq('location_id', locationId)
        .order('name')

      if (!stationsData) { setLoading(false); return }

      // For each station, fetch the most recent check request + submission
      const enriched = await Promise.all(stationsData.map(async (st) => {
        const { data: checks } = await supabase
          .from('check_requests')
          .select(`
            *,
            submissions(
              id, photo_urls, manager_rating_total, is_late,
              employees(display_name)
            )
          `)
          .eq('station_id', st.id)
          .order('triggered_at', { ascending: false })
          .limit(1)

        const lastCheck = checks?.[0] || null
        const submission = lastCheck?.submissions?.[0] || null

        return {
          ...st,
          schedule: st.check_schedules?.[0],
          last_check: lastCheck ? {
            ...lastCheck,
            submission: submission ? { ...submission, employee: submission.employees } : null,
          } : null,
        }
      }))

      setStations(enriched)

      // Today's stats
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const { data: todayChecks } = await supabase
        .from('check_requests')
        .select('status, stations!inner(location_id)')
        .eq('stations.location_id', locationId)
        .gte('triggered_at', today.toISOString())

      if (todayChecks) {
        const stats = todayChecks.reduce((acc, c) => {
          acc.total++
          if (c.status === 'submitted') acc.onTime++
          else if (c.status === 'missed') acc.missed++
          return acc
        }, { total: 0, onTime: 0, late: 0, missed: 0 })
        setTodayStats(stats)
      }

      // Pending ratings (submitted but not rated)
      const { count } = await supabase
        .from('submissions')
        .select('id', { count: 'exact' })
        .is('rated_at', null)
        .not('photo_urls', 'is', null)

      setPendingRatings(count || 0)

      // Top performer this week
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      weekStart.setHours(0, 0, 0, 0)
      const { data: scores } = await supabase
        .from('shift_scores')
        .select('*, employees(display_name)')
        .eq('location_id', locationId)
        .gte('period_start', weekStart.toISOString())
        .order('total_points', { ascending: false })
        .limit(1)
      setTopPerformer(scores?.[0] || null)

    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    loadData()

    // Real-time subscription for check_requests and submissions
    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_requests' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, loadData)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  async function handleTriggerCheck(stationId) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await supabase.from('check_requests').insert({
      station_id: stationId,
      trigger_type: 'manual',
      triggered_by: employee?.user_id,
      triggered_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    })
    await loadData()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {employee?.locations?.name || 'All Stations'} • {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #2d3748' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Today's Checks", value: todayStats.total, color: '#9ca3af' },
          { label: 'On Time', value: todayStats.onTime, color: '#22c55e' },
          { label: 'Missed', value: todayStats.missed, color: '#ef4444', alert: todayStats.missed > 0 },
          { label: 'Pending Rating', value: pendingRatings, color: '#f59e0b', link: pendingRatings > 0 ? '/submissions' : null },
        ].map((stat, i) => (
          <div key={i} className="rounded-xl p-4" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
            {stat.link ? (
              <Link to={stat.link} className="no-underline">
                <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </Link>
            ) : (
              <>
                <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Top performer */}
      {topPerformer && (
        <div className="mb-6 p-4 rounded-xl flex items-center gap-4"
             style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.2)' }}>
          <div className="text-2xl">🏆</div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#ff6b2b' }}>
              This Week's Top Performer
            </div>
            <div className="text-white font-bold">{topPerformer.employees?.display_name}</div>
            <div className="text-sm text-gray-400">{topPerformer.total_points} pts</div>
          </div>
        </div>
      )}

      {/* Station cards */}
      {stations.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">◎</div>
          <h2 className="text-white font-bold mb-2">No stations yet</h2>
          <p className="text-gray-400 text-sm mb-4">Create your first food station to get started.</p>
          <Link to="/stations"
                className="inline-block px-4 py-2 rounded-xl font-semibold text-white no-underline"
                style={{ background: '#ff6b2b' }}>
            Add Station
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stations.map(st => (
            <StationStatusCard key={st.id} station={st} onTriggerCheck={handleTriggerCheck} />
          ))}
        </div>
      )}
    </div>
  )
}
