import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import { Bell, BellRing } from 'lucide-react'

export default function NotificationBell() {
  const { employee, isManager } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const locationId = employee?.location_id

  const loadNotifications = useCallback(async () => {
    if (!locationId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })
      .limit(25)
    setNotifications(data || [])
  }, [locationId])

  useEffect(() => {
    if (!isManager || !locationId) return
    loadNotifications()

    // Poll every 15 seconds as reliable fallback
    const interval = setInterval(loadNotifications, 15000)

    // Realtime as bonus (requires table in supabase_realtime publication)
    const channel = supabase
      .channel('notif-live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `location_id=eq.${locationId}`,
      }, loadNotifications)
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [locationId, isManager, loadNotifications])

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  async function markAllRead() {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  if (!isManager) return null

  const unread = notifications.filter(n => !n.is_read).length
  const BellIcon = unread > 0 ? BellRing : Bell

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
        style={{
          background: open ? 'var(--accent-soft)' : 'var(--surface-2)',
          border: '1px solid var(--border)',
        }}
        aria-label="Notifications"
      >
        <BellIcon size={16} strokeWidth={2} color={unread > 0 ? 'var(--accent)' : 'var(--text-muted)'} />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center font-bold"
            style={{ background: 'var(--accent)', color: 'white', fontSize: '9px', boxShadow: '0 0 0 2px var(--bg-elevated)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl z-50 overflow-hidden animate-in"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="font-bold text-white text-sm">
              Alerts {unread > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {unread} new
                </span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                No alerts yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className="px-4 py-3 flex items-start gap-3 transition-colors"
                  style={{
                    background: n.is_read ? 'transparent' : 'rgba(255,107,43,0.05)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{
                      background: n.type === 'two_misses'
                        ? '#ef4444'
                        : n.is_read ? 'var(--border)' : 'var(--accent)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-snug">{n.message}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
