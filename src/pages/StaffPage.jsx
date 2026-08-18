import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'
import { Card, Badge, PageLoader, EmptyState, Button } from '../components/ui'
import { Users, Link2, Check, ArrowUp, ArrowDown } from 'lucide-react'

const ROLE_COLOR = {
  owner: { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  manager: { color: '#3b82f6', bg: 'var(--blue-soft)' },
  employee: { color: '#22c55e', bg: 'var(--green-soft)' },
}

function RoleBadge({ role }) {
  const cfg = ROLE_COLOR[role] || { color: '#9ca3af', bg: 'var(--surface-2)' }
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

  if (loading) return <PageLoader label="Loading staff…" />

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={22} style={{ color: 'var(--accent)' }} />
            Staff
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {active.length} active · {inactive.length} inactive
          </p>
        </div>
        <Button
          onClick={copyInviteLink}
          icon={copied ? Check : Link2}
          style={copied ? { background: 'var(--green)', boxShadow: 'none' } : {}}
        >
          {copied ? 'Link Copied!' : 'Invite Staff'}
        </Button>
      </div>

      {/* Invite instructions */}
      {copied && (
        <div className="mb-5 p-4 rounded-xl text-sm animate-in"
             style={{ background: 'var(--green-soft)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
          <strong>App link copied!</strong> Send it to your staff member. They should open the link,
          register with their email, and choose the <strong>Employee</strong> role.
          They'll appear in this list once they sign up — you can then promote them to Manager here.
        </div>
      )}

      {staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="Use the Invite button to copy the app link and share it with your team."
        />
      ) : (
        <div className="space-y-2">
          {staff.map(emp => (
            <Card key={emp.id}
                 className="flex items-center gap-4"
                 style={{ opacity: emp.is_active ? 1 : 0.55 }}>
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                   style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>
                {emp.display_name?.[0]?.toUpperCase() || '?'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-sm">{emp.display_name}</span>
                  <RoleBadge role={emp.role} />
                  {!emp.is_active && <Badge color="gray">Inactive</Badge>}
                </div>
                {emp.created_at && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    Joined {format(new Date(emp.created_at), 'MMM d, yyyy')}
                  </div>
                )}
              </div>

              {/* Actions */}
              {isOwner && emp.role !== 'owner' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={emp.role === 'employee' ? ArrowUp : ArrowDown}
                    onClick={() => changeRole(emp)}
                    style={{ background: 'var(--blue-soft)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
                  >
                    {emp.role === 'employee' ? 'Make Manager' : 'Make Employee'}
                  </Button>
                  <Button
                    size="sm"
                    variant={emp.is_active ? 'danger' : 'success'}
                    onClick={() => toggleActive(emp)}
                  >
                    {emp.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
