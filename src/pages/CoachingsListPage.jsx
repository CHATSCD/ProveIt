import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

const ESCALATION_LABELS = {
  final_written_warning: 'Final Written Warning',
  suspension_3day: '3-Day Suspension',
}

export default function CoachingsListPage() {
  const { employee } = useAuth()
  const [coachings, setCoachings] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!employee?.location_id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('coachings')
        .select('*, employees!coachings_employee_id_fkey(display_name)')
        .eq('location_id', employee.location_id)
        .order('created_at', { ascending: false })
      setCoachings(data || [])
    } finally {
      setLoading(false)
    }
  }, [employee?.location_id])

  useEffect(() => { load() }, [load])

  const pending = coachings.filter(c => c.status !== 'completed')
  const completed = coachings.filter(c => c.status === 'completed')

  function CoachingRow({ c }) {
    return (
      <Link to={`/coaching/${c.id}`} className="block no-underline">
        <div className="rounded-2xl p-4 flex items-center justify-between gap-3"
             style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white">{c.employees?.display_name || 'Employee'}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={c.status === 'completed'
                      ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                      : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                {c.status === 'completed' ? 'Completed' : 'Pending'}
              </span>
              {c.is_escalation && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                  #{c.coaching_number} Escalation
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {format(new Date(c.created_at), 'MMM d, yyyy')}
              {c.escalation_action && <> · {ESCALATION_LABELS[c.escalation_action]}</>}
            </div>
          </div>
          <div className="text-gray-600 flex-shrink-0">→</div>
        </div>
      </Link>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Coachings</h1>
        <p className="text-gray-400 text-sm mt-0.5">Progressive discipline records for your team</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
        </div>
      ) : coachings.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="text-4xl mb-3">✓</div>
          <h3 className="text-white font-bold mb-1">No coachings yet</h3>
          <p className="text-gray-400 text-sm">These are created automatically after 3 low-scored submissions.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pending.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Needs Signature ({pending.length})
              </h3>
              <div className="space-y-2">
                {pending.map(c => <CoachingRow key={c.id} c={c} />)}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Completed ({completed.length})
              </h3>
              <div className="space-y-2">
                {completed.map(c => <CoachingRow key={c.id} c={c} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
