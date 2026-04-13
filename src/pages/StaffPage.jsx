import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

function RoleBadge({ role }) {
  const cfg = {
    owner:    { color: '#ff6b2b', bg: 'rgba(255,107,43,0.15)' },
    manager:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    employee: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  }[role] || { color: '#9ca3af', bg: '#374151' }

  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold capitalize"
          style={{ color: cfg.color, background: cfg.bg }}>
      {role}
    </span>
  )
}

export default function StaffPage() {
  const { employee, isOwner } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const locationId = employee?.location_id

  const loadStaff = useCallback(async () => {
    if (!locationId) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: true })
    setStaff(data || [])
    setLoading(false)
  }, [locationId])

  useEffect(() => { loadStaff() }, [loadStaff])

  async function changeRole(emp) {
    const next = emp.role === 'employee' ? 'manager' : 'employee'
    await supabase.from('employees').update({ role: next }).eq('id', emp.id)
    setStaff(prev => prev.map(e => e.id === emp.id ? { ...e, role: next } : e))
  }

  async function toggleActive(emp) {
    const next = !emp.is_active
    await supabase.from('employees').update({ is_active: next }).eq('id', emp.id)
    setStaff(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: next } : e))
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(window.location.origin)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const active = staff.filter(s => s.is_active)
  const inactive = staff.filter(s => !s.is_active)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {active.length} active · {inactive.length} inactive
          </p>
        </div>
        <button
          onClick={copyInviteLink}
          className="px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all"
          style={{ background: copied ? '#22c55e' : '#ff6b2b' }}
        >
          {copied ? '✓ Link Copied!' : '+ Invite Staff'}
        </button>
      </div>

      {/* Invite instructions */}
      {copied && (
        <div className="mb-5 p-4 rounded-xl text-sm"
             style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
          <strong>App link copied!</strong> Send it to your staff member. They should open the link,
          register with their email, and choose the <strong>Employee</strong> role.
          They'll appear in this list once they sign up — you can then promote them to Manager here.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
        </div>
      ) : staff.length === 0 ? (
        <div className="text-center py-16 rounded-2xl"
             style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <div className="text-4xl mb-3">👥</div>
          <h3 className="text-white font-bold mb-1">No staff yet</h3>
          <p className="text-gray-400 text-sm">
            Use the Invite button to copy the app link and share it with your team.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map(emp => (
            <div key={emp.id}
                 className="rounded-2xl p-4 flex items-center gap-4"
                 style={{
                   background: '#1a2235',
                   border: '1px solid #2d3748',
                   opacity: emp.is_active ? 1 : 0.55,
                 }}>
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                   style={{ background: '#374151', color: '#ff6b2b' }}>
                {emp.display_name?.[0]?.toUpperCase() || '?'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-sm">{emp.display_name}</span>
                  <RoleBadge role={emp.role} />
                  {!emp.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#374151', color: '#6b7280' }}>
                      Inactive
                    </span>
                  )}
                </div>
                {emp.created_at && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Joined {format(new Date(emp.created_at), 'MMM d, yyyy')}
                  </div>
                )}
              </div>

              {/* Actions */}
              {isOwner && emp.role !== 'owner' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => changeRole(emp)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                    style={{
                      background: 'rgba(59,130,246,0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.3)',
                    }}
                  >
                    {emp.role === 'employee' ? '↑ Make Manager' : '↓ Make Employee'}
                  </button>
                  <button
                    onClick={() => toggleActive(emp)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={emp.is_active
                      ? { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                      : { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    {emp.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
