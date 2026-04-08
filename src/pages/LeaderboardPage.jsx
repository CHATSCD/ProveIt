import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, startOfWeek, endOfWeek } from 'date-fns'

const MEDAL = ['🥇', '🥈', '🥉']

function RankBadge({ rank }) {
  if (rank <= 3) return <span className="text-2xl">{MEDAL[rank - 1]}</span>
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
         style={{ background: '#374151', color: '#9ca3af' }}>
      #{rank}
    </div>
  )
}

function ScoreTier({ points }) {
  const tier = points >= 500 ? { label: 'Elite', color: '#ff6b2b', bg: 'rgba(255,107,43,0.15)' }
    : points >= 250 ? { label: 'Pro', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' }
    : points >= 100 ? { label: 'Rising', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' }
    : { label: 'Rookie', color: '#9ca3af', bg: 'rgba(107,114,128,0.15)' }
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
  const [winner, setWinner] = useState(null)
  const [winnerNote, setWinnerNote] = useState('')
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
      setWinner(score)
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
        <p className="text-gray-400 text-sm">
          Week of {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </p>
      </div>

      {/* My rank callout */}
      {myScore && (
        <div className="mb-6 p-4 rounded-2xl flex items-center gap-4"
             style={{ background: 'rgba(255,107,43,0.08)', border: '1px solid rgba(255,107,43,0.2)' }}>
          <RankBadge rank={myRank} />
          <div className="flex-1">
            <div className="font-bold text-white">Your Position</div>
            <div className="text-sm text-gray-400">
              {myScore.total_points} pts • {myScore.on_time_count} on time • {myScore.missed_count} missed
            </div>
          </div>
          <div>
            <div className="text-3xl font-black" style={{ color: '#ff6b2b', fontFamily: 'Syne, sans-serif' }}>
              {myScore.total_points}
            </div>
            <ScoreTier points={myScore.total_points} />
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
        </div>
      ) : scores.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="text-4xl mb-3">▲</div>
          <h3 className="text-white font-bold mb-1">No scores yet this week</h3>
          <p className="text-gray-400 text-sm">Complete some food checks to appear on the leaderboard!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scores.map((score, i) => {
            const rank = i + 1
            const isMe = score.employee_id === employee?.id
            const isFirst = rank === 1

            return (
              <div
                key={score.id}
                className="rounded-2xl p-4 flex items-center gap-3 transition-all"
                style={{
                  background: isMe ? 'rgba(255,107,43,0.08)' : '#1a2235',
                  border: isFirst ? '1px solid rgba(255,215,0,0.3)' : isMe ? '1px solid rgba(255,107,43,0.3)' : '1px solid #2d3748',
                }}
              >
                <RankBadge rank={rank} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{score.employees?.display_name}</span>
                    {isMe && <span className="text-xs text-orange-400 font-medium">you</span>}
                    <ScoreTier points={score.total_points} />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                    <span className="text-green-500">✓ {score.on_time_count} on time</span>
                    {score.late_count > 0 && <span className="text-yellow-500">⏰ {score.late_count} late</span>}
                    {score.missed_count > 0 && <span className="text-red-500">✗ {score.missed_count} missed</span>}
                    {score.avg_rating > 0 && <span className="text-gray-400">★ {score.avg_rating.toFixed(1)} avg</span>}
                  </div>
                </div>

                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                  <div className="text-xl font-black" style={{ color: isFirst ? '#fbbf24' : 'white', fontFamily: 'Syne, sans-serif' }}>
                    {score.total_points}
                  </div>
                  <div className="text-xs text-gray-600">pts</div>
                  {isManager && rank === 1 && (
                    <button
                      onClick={() => markWinner(score)}
                      disabled={savingWinner}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                    >
                      🏆 Award
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Points guide */}
      <div className="mt-8 rounded-2xl p-5" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
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
              <span className="text-gray-400">{row.label}</span>
              <span className="font-bold" style={{ color: row.color }}>{row.pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
