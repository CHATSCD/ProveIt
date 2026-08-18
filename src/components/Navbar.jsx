import { Link, useLocation } from 'react-router-dom'
import { LayoutGrid, MapPin, ClipboardCheck, Trophy, Users, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import NotificationBell from './NotificationBell'

const NAV_ITEMS_MANAGER = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { path: '/stations', label: 'Stations', icon: MapPin },
  { path: '/submissions', label: 'Rate Submissions', icon: ClipboardCheck },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/staff', label: 'Staff', icon: Users },
]

const NAV_ITEMS_EMPLOYEE = [
  { path: '/dashboard', label: 'My Checks', icon: LayoutGrid },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
]

export default function Navbar() {
  const { employee, signOut, isManager } = useAuth()
  const location = useLocation()
  const navItems = isManager ? NAV_ITEMS_MANAGER : NAV_ITEMS_EMPLOYEE

  const roleBadgeColor = {
    owner: 'var(--accent)',
    manager: '#3b82f6',
    employee: '#22c55e',
  }[employee?.role] || '#6b7280'

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
         style={{ background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(16px) saturate(160%)', borderBottom: '1px solid var(--border-soft)' }}>
      {/* Brand */}
      <Link to="/dashboard" className="flex items-center gap-2.5 no-underline group">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
             style={{ background: 'var(--accent)', boxShadow: 'var(--shadow-glow)' }}>
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2.5" fill="none"/>
            <circle cx="16" cy="16" r="4" fill="white"/>
          </svg>
        </div>
        <span className="font-bold text-white text-lg hidden sm:block" style={{ fontFamily: 'Syne, sans-serif' }}>
          ProveIt
        </span>
      </Link>

      {/* Nav links — desktop */}
      <div className="hidden md:flex items-center gap-1">
        {navItems.map(item => {
          const active = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 no-underline"
              style={active
                ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                : { color: 'var(--text-muted)' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <item.icon size={15} strokeWidth={2.25} />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* User info + sign out */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-white text-sm font-medium leading-tight">{employee?.display_name}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider leading-tight"
                style={{ color: roleBadgeColor }}>
            {employee?.role}
          </span>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#4b5563' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <LogOut size={13} strokeWidth={2.25} />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </nav>
  )
}

// Bottom tab bar for mobile
export function BottomNav() {
  const { isManager } = useAuth()
  const location = useLocation()
  const navItems = isManager ? NAV_ITEMS_MANAGER : NAV_ITEMS_EMPLOYEE

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex"
         style={{ background: 'rgba(10,15,30,0.92)', backdropFilter: 'blur(16px) saturate(160%)', borderTop: '1px solid var(--border-soft)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {navItems.map(item => {
        const active = location.pathname === item.path
        return (
          <Link
            key={item.path}
            to={item.path}
            className="relative flex-1 flex flex-col items-center py-2.5 gap-1 no-underline transition-colors duration-200"
            style={active ? { color: 'var(--accent)' } : { color: 'var(--text-faint)' }}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full" style={{ background: 'var(--accent)' }} />
            )}
            <item.icon size={19} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-semibold leading-none">{item.label.split(' ')[0]}</span>
          </Link>
        )
      })}
    </div>
  )
}
