import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS_MANAGER = [
  { path: '/dashboard', label: 'Dashboard', icon: '⬡' },
  { path: '/stations', label: 'Stations', icon: '◎' },
  { path: '/submissions', label: 'Rate Submissions', icon: '★' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '▲' },
]

const NAV_ITEMS_EMPLOYEE = [
  { path: '/dashboard', label: 'My Checks', icon: '⬡' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '▲' },
]

export default function Navbar() {
  const { employee, signOut, isManager } = useAuth()
  const location = useLocation()
  const navItems = isManager ? NAV_ITEMS_MANAGER : NAV_ITEMS_EMPLOYEE

  const roleBadgeColor = {
    owner: '#ff6b2b',
    manager: '#3b82f6',
    employee: '#22c55e',
  }[employee?.role] || '#6b7280'

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
         style={{ background: 'rgba(10,15,30,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1f2937' }}>
      {/* Brand */}
      <Link to="/dashboard" className="flex items-center gap-2 no-underline">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: '#ff6b2b' }}>
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
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all no-underline"
            style={location.pathname === item.path
              ? { background: 'rgba(255,107,43,0.15)', color: '#ff6b2b' }
              : { color: '#9ca3af' }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* User info + sign out */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-white text-sm font-medium">{employee?.display_name}</span>
          <span className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: roleBadgeColor }}>
            {employee?.role}
          </span>
        </div>
        <button
          onClick={signOut}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #2d3748' }}
        >
          Sign Out
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
         style={{ background: 'rgba(10,15,30,0.98)', backdropFilter: 'blur(12px)', borderTop: '1px solid #1f2937' }}>
      {navItems.map(item => (
        <Link
          key={item.path}
          to={item.path}
          className="flex-1 flex flex-col items-center py-3 gap-0.5 no-underline transition-all"
          style={location.pathname === item.path ? { color: '#ff6b2b' } : { color: '#6b7280' }}
        >
          <span className="text-xl leading-none">{item.icon}</span>
          <span className="text-xs font-medium">{item.label.split(' ')[0]}</span>
        </Link>
      ))}
    </div>
  )
}
