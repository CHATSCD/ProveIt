import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow, format } from 'date-fns'
import ComplianceExport from '../components/ComplianceExport'
import { Card, Badge, PageLoader, EmptyState, Button } from '../components/ui'
import { Download, RefreshCw, Zap, Trophy, MapPin, Clock, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react'

const STATUS_CONFIG = {
  submitted: { color: '#22c55e', border: 'rgba(34,197,94,0.3)', label: 'Submitted', icon: CheckCircle2 },
  pending: { color: '#f59e0b', border: 'rgba(245,158,11,0.3)', label: 'Pending', icon: Hourglass },
  missed: { color: '#ef4444', border: 'rgba(239,68,68,0.3)', label: 'Missed', icon: AlertTriangle },
  no_data: { color: '#6b7280', border: 'var(--border)', label: 'No Data', icon: Clock },
}

function StationStatusCard({ station, onTriggerCheck }) {
  const [triggering, setTriggering] = useState(false)

  const lastCheck = station.last_check
  const status = lastCheck?.status || 'no_data'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.no_data

  async function triggerCheck() {
    setTriggering(true)
    try {
      await onTriggerCheck(station.id)
    } finally {
      setTriggering(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4" padding="p-5" style={{ borderColor: cfg.border }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-white text-lg truncate">{station.name}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: cfg.color }}>
              <cfg.icon size={14} strokeWidth={2.5} />
              {cfg.label}
            </span>
            {!station.is_active && <Badge color="gray">Inactive</Badge>}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Zap}
          loading={triggering}
          disabled={!station.is_active}
          onClick={triggerCheck}
          className="flex-shrink-0"
          style={!triggering && station.is_active ? { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(255,107,43,0.3)' } : {}}
        >
          {triggering ? 'Triggering' : 'Manual Check'}
        </Button>
      </div>

      {/* Last submission photo */}
      {lastCheck?.submission?.photo_urls?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {lastCheck.submission.photo_urls.slice(0, 3).map((url, i) => (
            <img
              key={i}
              src={url}
              alt="Station photo"
              className="h-20 w-28 object-cover rounded-lg flex-shrink-0 transition-transform duration-200 hover:scale-105"
              style={{ border: '1px solid var(--border)' }}
            />
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--inset)' }}>
          <div className="text-lg font-bold text-white">
            {lastCheck?.submission?.manager_rating_total ?? '—'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>Last Score</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--inset)' }}>
          <div className="text-sm font-bold text-white">
            {lastCheck?.submitted_at
              ? formatDistanceToNow(new Date(lastCheck.submitted_at), { addSuffix: true })
              : lastCheck?.triggered_at
              ? formatDistanceToNow(new Date(lastCheck.triggered_at), { addSuffix: true })
              : '—'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>Last Activity</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'var(--inset)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
            {station.schedule?.interval_minutes
              ? `${station.schedule.interval_minutes}m`
              : '—'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>Interval</div>
        </div>
      </div>

      {/* Employee info */}
      {lastCheck?.submission?.employee && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
               style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>
            {lastCheck.submission.employee.display_name?.[0]?.toUpperCase()}
          </div>
          <span>{lastCheck.submission.employee.display_name}</span>
          {lastCheck.submission.is_late && <Badge color="amber">Late</Badge>}
        </div>
      )}
    </Card>
  )
}

export default function ManagerDashboard() {
  const { employee } = useAuth()
  const [stations, setStations] = useState([])
  const [todayStats, setTodayStats] = useState({ total: 0, onTime: 0, late: 0, missed: 0 })
  const [topPerformer, setTopPerformer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingRatings, setPendingRatings] = useState(0)
  const [showExport, setShowExport] = useState(false)

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

  if (loading) return <PageLoader label="Loading dashboard…" />

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {employee?.locations?.name || 'All Stations'} • {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => setShowExport(true)}
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(255,107,43,0.3)' }}
          >
            Export
          </Button>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={loadData}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Today's Checks", value: todayStats.total, color: 'var(--text-muted)' },
          { label: 'On Time', value: todayStats.onTime, color: '#22c55e' },
          { label: 'Missed', value: todayStats.missed, color: '#ef4444' },
          { label: 'Pending Rating', value: pendingRatings, color: '#f59e0b', link: pendingRatings > 0 ? '/submissions' : null },
        ].map((stat, i) => {
          const content = (
            <>
              <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{stat.label}</div>
            </>
          )
          return (
            <Card key={i} hoverable={!!stat.link}>
              {stat.link ? <Link to={stat.link} className="no-underline block">{content}</Link> : content}
            </Card>
          )
        })}
      </div>

      {/* Top performer */}
      {topPerformer && (
        <Card className="mb-6 flex items-center gap-4" style={{ background: 'var(--accent-soft)', borderColor: 'rgba(255,107,43,0.2)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,107,43,0.15)', color: 'var(--accent)' }}>
            <Trophy size={22} strokeWidth={2} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              This Week's Top Performer
            </div>
            <div className="text-white font-bold">{topPerformer.employees?.display_name}</div>
            <div className="text-sm" style={{ color: 'var(--text-faint)' }}>{topPerformer.total_points} pts</div>
          </div>
        </Card>
      )}

      {/* Station cards */}
      {stations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No stations yet"
          description="Create your first food station to get started."
          action={
            <Link to="/stations" className="no-underline">
              <Button>Add Station</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stations.map(st => (
            <StationStatusCard key={st.id} station={st} onTriggerCheck={handleTriggerCheck} />
          ))}
        </div>
      )}

      {showExport && <ComplianceExport onClose={() => setShowExport(false)} />}
    </div>
  )
}
