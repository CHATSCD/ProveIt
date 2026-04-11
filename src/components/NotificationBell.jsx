import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'

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

    const channel = supabase
      .channel('notif-live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `location_id=eq.${locationId}`,
      }, loadNotifications)
      .subscribe()

    return () => supabase.removeChannel(channel)
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all"
        style={{
          background: open ? 'rgba(255,107,43,0.15)' : '#1f2937',
          border: '1px solid #2d3748',
        }}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke={unread > 0 ? '#ff6b2b' : '#9ca3af'}
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center font-bold"
            style={{ background: '#ff6b2b', color: 'white', fontSize: '9px' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl z-50 overflow-hidden"
          style={{
            background: '#1a2235',
            border: '1px solid #2d3748',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid #2d3748' }}
          >
            <span className="font-bold text-white text-sm">
              Alerts {unread > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(255,107,43,0.2)', color: '#ff6b2b' }}>
                  {unread} new
                </span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs"
                style={{ color: '#ff6b2b' }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">
                No alerts yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className="px-4 py-3 flex items-start gap-3"
                  style={{
                    background: n.is_read ? 'transparent' : 'rgba(255,107,43,0.05)',
                    borderBottom: '1px solid #1f2937',
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{
                      background: n.type === 'two_misses'
                        ? '#ef4444'
                        : n.is_read ? '#374151' : '#ff6b2b',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-snug">{n.message}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
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
