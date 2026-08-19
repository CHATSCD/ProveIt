import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format, isPast } from 'date-fns'

const TIERS = ['starter', 'pro', 'pro_plus']

function StatusBadge({ status, trialEndsAt }) {
  const expired = status === 'trialing' && trialEndsAt && isPast(new Date(trialEndsAt))
  const cfg = {
    active: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Active' },
    trialing: expired
      ? { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Trial expired' }
      : { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Trialing' },
    comped: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Comped' },
    inactive: { color: '#6b7280', bg: '#374151', label: 'Inactive' },
    canceled: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Canceled' },
  }[status] || { color: '#9ca3af', bg: '#374151', label: status || 'Unknown' }

  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function LocationRow({ loc, onAction, busy }) {
  const [showTrial, setShowTrial] = useState(false)
  const [showComp, setShowComp] = useState(false)
  const [trialDays, setTrialDays] = useState(14)
  const [trialTier, setTrialTier] = useState('pro')
  const [compTier, setCompTier] = useState('pro')

  return (
    <div className="rounded-2xl p-4" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white">{loc.name}</span>
            <StatusBadge status={loc.subscription_status} trialEndsAt={loc.trial_ends_at} />
            <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: '#374151', color: '#9ca3af' }}>
              {loc.plan_tier?.replace('_', '+') || 'starter'}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {loc.owner_name || 'No owner name'} · {loc.owner_email || '—'}
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            {loc.active_employee_count} staff · Registered {format(new Date(loc.created_at), 'MMM d, yyyy')}
            {loc.trial_ends_at && ` · Trial ends ${format(new Date(loc.trial_ends_at), 'MMM d, yyyy')}`}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => { setShowTrial(v => !v); setShowComp(false) }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            Grant Trial
          </button>
          <button
            onClick={() => { setShowComp(v => !v); setShowTrial(false) }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
          >
            Comp / Credit
          </button>
          <button
            onClick={() => onAction('reset', loc.id)}
            disabled={busy}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: '#374151', color: '#9ca3af' }}
          >
            Reset
          </button>
        </div>
      </div>

      {showTrial && (
        <div className="mt-3 pt-3 flex items-end gap-2 flex-wrap" style={{ borderTop: '1px solid #2d3748' }}>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Days</label>
            <input
              type="number" min={1} max={90} value={trialDays}
              onChange={e => setTrialDays(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg text-sm text-white outline-none"
              style={{ background: '#111827', border: '1px solid #2d3748' }}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tier during trial</label>
            <select
              value={trialTier} onChange={e => setTrialTier(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm text-white outline-none capitalize"
              style={{ background: '#111827', border: '1px solid #2d3748' }}
            >
              {TIERS.map(t => <option key={t} value={t}>{t.replace('_', '+')}</option>)}
            </select>
          </div>
          <button
            onClick={() => { onAction('trial', loc.id, { days: Number(trialDays), tier: trialTier }); setShowTrial(false) }}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: '#ff6b2b' }}
          >
            Confirm
          </button>
        </div>
      )}

      {showComp && (
        <div className="mt-3 pt-3 flex items-end gap-2 flex-wrap" style={{ borderTop: '1px solid #2d3748' }}>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Comp tier (permanent, free)</label>
            <select
              value={compTier} onChange={e => setCompTier(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm text-white outline-none capitalize"
              style={{ background: '#111827', border: '1px solid #2d3748' }}
            >
              {TIERS.map(t => <option key={t} value={t}>{t.replace('_', '+')}</option>)}
            </select>
          </div>
          <button
            onClick={() => { onAction('comp', loc.id, { tier: compTier }); setShowComp(false) }}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: '#3b82f6' }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  )
}

export default function PlatformAdminPage() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [addAdminMsg, setAddAdminMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_list_locations')
      if (rpcErr) throw rpcErr
      setLocations(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAction(action, locationId, params = {}) {
    setBusy(true)
    setError('')
    try {
      if (action === 'trial') {
        const { error: err } = await supabase.rpc('admin_grant_trial', {
          p_location_id: locationId, p_days: params.days, p_tier: params.tier,
        })
        if (err) throw err
      } else if (action === 'comp') {
        const { error: err } = await supabase.rpc('admin_comp_plan', {
          p_location_id: locationId, p_tier: params.tier,
        })
        if (err) throw err
      } else if (action === 'reset') {
        const { error: err } = await supabase.rpc('admin_reset_billing', { p_location_id: locationId })
        if (err) throw err
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddAdmin(e) {
    e.preventDefault()
    setAddAdminMsg('')
    try {
      const { error: err } = await supabase.rpc('admin_add_platform_admin', { p_email: newAdminEmail.trim() })
      if (err) throw err
      setAddAdminMsg(`✓ ${newAdminEmail.trim()} added as platform admin`)
      setNewAdminEmail('')
    } catch (err) {
      setAddAdminMsg(err.message)
    }
  }

  const totalActive = locations.filter(l => l.subscription_status === 'active' || l.subscription_status === 'comped').length
  const totalTrialing = locations.filter(l => l.subscription_status === 'trialing').length

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {locations.length} registered · {totalActive} paying/comped · {totalTrialing} trialing
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-xl text-sm font-medium"
          style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #2d3748' }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl text-sm text-red-300"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
               style={{ borderColor: '#ff6b2b', borderTopColor: 'transparent' }}></div>
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
          <p className="text-gray-400 text-sm">No locations registered yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => (
            <LocationRow key={loc.id} loc={loc} onAction={handleAction} busy={busy} />
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl p-5" style={{ background: '#1a2235', border: '1px solid #2d3748' }}>
        <h3 className="font-bold text-white mb-3 text-sm">Add another platform admin</h3>
        <form onSubmit={handleAddAdmin} className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={newAdminEmail}
            onChange={e => setNewAdminEmail(e.target.value)}
            placeholder="teammate@example.com"
            required
            className="flex-1 min-w-[200px] px-3 py-2 rounded-xl text-sm text-white outline-none"
            style={{ background: '#111827', border: '1px solid #2d3748' }}
          />
          <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#ff6b2b' }}>
            Add
          </button>
        </form>
        {addAdminMsg && <p className="text-xs text-gray-400 mt-2">{addAdminMsg}</p>}
        <p className="text-xs text-gray-600 mt-2">They must already have a ProveIt account (any role) before you can add them.</p>
      </div>
    </div>
  )
}
