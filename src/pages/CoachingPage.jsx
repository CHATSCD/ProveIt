import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

const ESCALATION_LABELS = {
  final_written_warning: 'Final Written Warning',
  suspension_3day: '3-Day Suspension',
}

function SignatureBlock({ label, name, signedAt, extra }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #2d3748' }}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="font-bold text-white" style={{ fontFamily: 'cursive', fontSize: '1.25rem' }}>{name}</div>
      <div className="text-xs text-gray-600 mt-1">
        Signed {format(new Date(signedAt), "MMM d, yyyy 'at' h:mm a")}
      </div>
      {extra}
    </div>
  )
}

export default function CoachingPage() {
  const { id } = useParams()
  const { employee, isManager } = useAuth()
  const navigate = useNavigate()

  const [coaching, setCoaching] = useState(null)
  const [employeeName, setEmployeeName] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [explanation, setExplanation] = useState('')
  const [empSigName, setEmpSigName] = useState('')
  const [mgrSigName, setMgrSigName] = useState('')
  const [escalationChoice, setEscalationChoice] = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('coachings')
        .select('*, employees!coachings_employee_id_fkey(display_name, user_id)')
        .eq('id', id)
        .single()

      if (err || !data) { setError('Coaching record not found.'); setLoading(false); return }

      setCoaching(data)
      setEmployeeName(data.employees?.display_name || 'Employee')

      const { data: subs } = await supabase
        .from('submissions')
        .select('id, submitted_at, manager_rating_total, check_requests(stations(name))')
        .in('id', data.triggering_submission_ids)
        .order('submitted_at', { ascending: true })
      setSubmissions(subs || [])
    } finally {
      setLoading(false)
    }
  }

  const isMe = coaching?.employees?.user_id === employee?.user_id

  async function handleEmployeeSign(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.rpc('sign_coaching_employee', {
        p_coaching_id: id,
        p_signature_name: empSigName.trim(),
        p_explanation: explanation.trim(),
      })
      if (err) throw err
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleManagerSign(e) {
    e.preventDefault()
    if (coaching.is_escalation && !escalationChoice) {
      setError('Select Final Written Warning or 3-Day Suspension before signing.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.rpc('sign_coaching_manager', {
        p_coaching_id: id,
        p_signature_name: mgrSigName.trim(),
        p_escalation_action: coaching.is_escalation ? escalationChoice : null,
      })
      if (err) throw err
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
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

  if (error && !coaching) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1 className="text-2xl font-bold text-white">Coaching Record</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={coaching.status === 'completed'
                  ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                  : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            {coaching.status === 'completed' ? 'Completed' : 'Awaiting signature'}
          </span>
          {coaching.is_escalation && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
              Coaching #{coaching.coaching_number} — Escalation
            </span>
          )}
        </div>
        <p className="text-gray-400 text-sm">
          {employeeName} · {format(new Date(coaching.created_at), 'MMM d, yyyy')}
        </p>
      </div>

      <div className="rounded-2xl p-5 mb-5" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
        <h3 className="font-bold text-white mb-3 text-sm">Triggering submissions</h3>
        <div className="space-y-2">
          {submissions.map(s => (
            <div key={s.id} className="flex items-center justify-between rounded-xl p-3" style={{ background: '#111827' }}>
              <div>
                <div className="text-sm text-white">{s.check_requests?.stations?.name || 'Station'}</div>
                <div className="text-xs text-gray-500">{format(new Date(s.submitted_at), 'MMM d, h:mm a')}</div>
              </div>
              <div className="font-bold" style={{ color: '#ef4444' }}>{s.manager_rating_total}/15</div>
            </div>
          ))}
        </div>
      </div>

      {coaching.is_escalation && coaching.escalation_action && (
        <div className="mb-5 p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
          <strong>Action taken:</strong> {ESCALATION_LABELS[coaching.escalation_action]}
          {coaching.escalation_action === 'suspension_3day' && coaching.suspension_start_date && (
            <> ({format(new Date(coaching.suspension_start_date), 'MMM d')} – {format(new Date(coaching.suspension_end_date), 'MMM d')})</>
          )}
        </div>
      )}

      {error && (
        <div className="mb-5 p-3 rounded-xl text-sm text-red-300"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      <div className="rounded-2xl p-5 mb-5" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
        <h3 className="font-bold text-white mb-3 text-sm">Employee</h3>
        {coaching.employee_signed_at ? (
          <SignatureBlock
            label="Signed by"
            name={coaching.employee_signature_name}
            signedAt={coaching.employee_signed_at}
            extra={coaching.employee_explanation && (
              <div className="mt-3 pt-3 text-sm text-gray-300" style={{ borderTop: '1px solid #2d3748' }}>
                <span className="text-gray-500">Explanation: </span>{coaching.employee_explanation}
              </div>
            )}
          />
        ) : isMe ? (
          <form onSubmit={handleEmployeeSign} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Why are these fundamentals not being completed?
              </label>
              <textarea
                value={explanation} onChange={e => setExplanation(e.target.value)}
                rows={4} required
                placeholder="Explain what's getting in the way..."
                className="w-full px-4 py-3 rounded-xl text-white text-sm resize-none outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Type your full name to sign</label>
              <input
                type="text" value={empSigName} onChange={e => setEmpSigName(e.target.value)}
                required placeholder="Your full name"
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748', fontFamily: 'cursive', fontSize: '1.1rem' }}
              />
            </div>
            <button type="submit" disabled={saving}
                    className="w-full py-3 rounded-xl font-bold text-white"
                    style={{ background: saving ? '#374151' : '#ff6b2b' }}>
              {saving ? 'Signing...' : 'Sign as Employee'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">Waiting on the employee to sign.</p>
        )}
      </div>

      <div className="rounded-2xl p-5" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
        <h3 className="font-bold text-white mb-3 text-sm">Manager</h3>
        {coaching.manager_signed_at ? (
          <SignatureBlock label="Signed by" name={coaching.manager_signature_name} signedAt={coaching.manager_signed_at} />
        ) : isManager ? (
          <form onSubmit={handleManagerSign} className="space-y-4">
            {coaching.is_escalation && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  This is coaching #{coaching.coaching_number} — select the required action
                </label>
                <div className="flex gap-2">
                  {['final_written_warning', 'suspension_3day'].map(opt => (
                    <button
                      key={opt} type="button"
                      onClick={() => setEscalationChoice(opt)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={escalationChoice === opt
                        ? { background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }
                        : { background: '#111827', color: '#9ca3af', border: '1px solid #2d3748' }}
                    >
                      {ESCALATION_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Type your full name to sign</label>
              <input
                type="text" value={mgrSigName} onChange={e => setMgrSigName(e.target.value)}
                required placeholder="Your full name"
                className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                style={{ background: '#111827', border: '1px solid #2d3748', fontFamily: 'cursive', fontSize: '1.1rem' }}
              />
            </div>
            <button type="submit" disabled={saving}
                    className="w-full py-3 rounded-xl font-bold text-white"
                    style={{ background: saving ? '#374151' : '#ff6b2b' }}>
              {saving ? 'Signing...' : 'Sign as Manager'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">Waiting on a manager to sign.</p>
        )}
      </div>

      <button onClick={() => navigate(-1)} className="mt-6 text-sm text-gray-500">← Back</button>
    </div>
  )
}
