import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { Card, PageLoader, EmptyState, Button } from '../components/ui'
import { Trophy, CheckCircle2, Clock, XCircle, Star, Award } from 'lucide-react'

const MEDAL = ['🥇', '🥈', '🥉']

function RankBadge({ rank }) {
  if (rank <= 3) return <span className="text-2xl leading-none">{MEDAL[rank - 1]}</span>
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
         style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
      #{rank}
    </div>
  )
}

function ScoreTier({ points }) {
  const tier = points >= 500 ? { label: 'Elite', color: 'var(--accent)', bg: 'var(--accent-soft)' }
    : points >= 250 ? { label: 'Pro', color: '#3b82f6', bg: 'var(--blue-soft)' }
    : points >= 100 ? { label: 'Rising', color: '#22c55e', bg: 'var(--green-soft)' }
    : { label: 'Rookie', color: '#9ca3af', bg: 'var(--surface-2)' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: tier.color, background: tier.bg }}>
      {tier.label}
    </span>
  )
}

export default function LeaderboardPage() {
  const { employee, isManager } = useAuth()
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingWinner, setSavingWinner] = useState(false)

  const weekStart = startOfWeek(new Date())
  const weekEnd = endOfWeek(new Date())

  const loadScores = useCallback(async () => {
    if (!employee?.location_id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('shift_scores')
        .select('*, employees(display_name, role)')
        .eq('location_id', employee.location_id)
        .gte('period_start', weekStart.toISOString())
        .order('total_points', { ascending: false })

      setScores(data || [])
    } finally {
      setLoading(false)
    }
  }, [employee?.location_id])

  useEffect(() => { loadScores() }, [loadScores])

  async function markWinner(score) {
    if (!isManager) return
    setSavingWinner(true)
    try {
      // In a real app this would write to a winners table
      alert(`🏆 ${score.employees?.display_name} marked as this week's winner!`)
    } finally {
      setSavingWinner(false)
    }
  }

  const myScore = scores.find(s => s.employee_id === employee?.id)
  const myRank = scores.findIndex(s => s.employee_id === employee?.id) + 1

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">ShiftScore™ Leaderboard</h1>
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
          Week of {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </p>
      </div>

      {/* My rank callout */}
      {myScore && (
        <Card className="mb-6 flex items-center gap-4 animate-in" style={{ background: 'var(--accent-soft)', borderColor: 'rgba(255,107,43,0.2)' }}>
          <RankBadge rank={myRank} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white">Your Position</div>
            <div className="text-sm" style={{ color: 'var(--text-faint)' }}>
              {myScore.total_points} pts • {myScore.on_time_count} on time • {myScore.missed_count} missed
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-3xl font-black" style={{ color: 'var(--accent)', fontFamily: 'Syne, sans-serif' }}>
              {myScore.total_points}
            </div>
            <ScoreTier points={myScore.total_points} />
          </div>
        </Card>
      )}

      {/* Leaderboard */}
      {loading ? (
        <PageLoader />
      ) : scores.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No scores yet this week"
          description="Complete some food checks to appear on the leaderboard!"
        />
      ) : (
        <div className="space-y-2">
          {scores.map((score, i) => {
            const rank = i + 1
            const isMe = score.employee_id === employee?.id
            const isFirst = rank === 1

            return (
              <Card
                key={score.id}
                className="flex items-center gap-3"
                style={{
                  background: isMe ? 'var(--accent-soft)' : 'var(--surface)',
                  borderColor: isFirst ? 'rgba(251,191,36,0.35)' : isMe ? 'rgba(255,107,43,0.3)' : 'var(--border)',
                }}
              >
                <RankBadge rank={rank} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{score.employees?.display_name}</span>
                    {isMe && <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>you</span>}
                    <ScoreTier points={score.total_points} />
                  </div>
                  <div className="text-xs mt-1 flex gap-3 flex-wrap" style={{ color: 'var(--text-faint)' }}>
                    <span className="inline-flex items-center gap-1" style={{ color: '#4ade80' }}><CheckCircle2 size={12} />{score.on_time_count} on time</span>
                    {score.late_count > 0 && <span className="inline-flex items-center gap-1" style={{ color: '#fbbf24' }}><Clock size={12} />{score.late_count} late</span>}
                    {score.missed_count > 0 && <span className="inline-flex items-center gap-1" style={{ color: '#f87171' }}><XCircle size={12} />{score.missed_count} missed</span>}
                    {score.avg_rating > 0 && <span className="inline-flex items-center gap-1"><Star size={12} />{score.avg_rating.toFixed(1)} avg</span>}
                  </div>
                </div>

                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                  <div className="text-xl font-black" style={{ color: isFirst ? '#fbbf24' : 'white', fontFamily: 'Syne, sans-serif' }}>
                    {score.total_points}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-faint)' }}>pts</div>
                  {isManager && rank === 1 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Award}
                      loading={savingWinner}
                      onClick={() => markWinner(score)}
                      style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                    >
                      Award
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Points guide */}
      <Card className="mt-8" padding="p-5">
        <h3 className="font-bold text-white mb-3">Points Guide</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: 'On-time submission', pts: '+10', color: '#22c55e' },
            { label: 'Surprise check — on time', pts: '+20', color: '#22c55e' },
            { label: 'Manager rates 13–15/15', pts: '+15', color: '#22c55e' },
            { label: 'Manager rates 9–12/15', pts: '+8', color: '#f59e0b' },
            { label: 'Manager rates below 9/15', pts: '+0', color: '#6b7280' },
            { label: 'Late submission (within window)', pts: '+3', color: '#f59e0b' },
            { label: 'Missed check', pts: '-15', color: '#ef4444' },
          ].map((row, i) => (
            <div key={i} className="flex justify-between items-center">
              <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="font-bold" style={{ color: row.color }}>{row.pts}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
