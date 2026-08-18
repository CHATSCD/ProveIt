// Shared visual primitives — keeps buttons, cards, badges and empty
// states consistent across every page instead of each one hand-rolling
// its own inline styles.

const VARIANTS = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    border: '1px solid transparent',
    boxShadow: 'var(--shadow-glow)',
  },
  secondary: {
    background: 'var(--surface-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  },
  danger: {
    background: 'var(--red-soft)',
    color: '#f87171',
    border: '1px solid rgba(239,68,68,0.3)',
  },
  success: {
    background: 'var(--green-soft)',
    color: '#4ade80',
    border: '1px solid rgba(34,197,94,0.3)',
  },
}

const SIZES = {
  sm: { padding: '6px 12px', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' },
  md: { padding: '11px 20px', fontSize: '0.875rem', borderRadius: 'var(--radius-sm)' },
  lg: { padding: '14px 24px', fontSize: '0.95rem', borderRadius: 'var(--radius-md)' },
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  style = {},
  children,
  ...props
}) {
  const isDisabled = disabled || loading
  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] ${className}`}
      style={{
        ...VARIANTS[variant],
        ...SIZES[size],
        opacity: isDisabled ? 0.55 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transform: 'translateZ(0)',
        ...style,
      }}
      {...props}
    >
      {loading ? <Spinner size={14} color="currentColor" /> : Icon ? <Icon size={16} strokeWidth={2.25} /> : null}
      {children}
    </button>
  )
}

export function Card({ hoverable = false, padding = 'p-4', className = '', style = {}, children, ...props }) {
  return (
    <div
      className={`${padding} transition-all duration-200 ${className}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        ...(hoverable ? { cursor: 'pointer' } : {}),
        ...style,
      }}
      onMouseEnter={hoverable ? (e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' } : undefined}
      onMouseLeave={hoverable ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' } : undefined}
      {...props}
    >
      {children}
    </div>
  )
}

const BADGE_COLORS = {
  accent: { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  blue: { color: '#60a5fa', bg: 'var(--blue-soft)' },
  green: { color: '#4ade80', bg: 'var(--green-soft)' },
  amber: { color: '#fbbf24', bg: 'var(--amber-soft)' },
  red: { color: '#f87171', bg: 'var(--red-soft)' },
  gray: { color: 'var(--text-faint)', bg: 'var(--surface-2)' },
}

export function Badge({ color = 'gray', icon: Icon, className = '', children }) {
  const c = BADGE_COLORS[color] || BADGE_COLORS.gray
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${className}`}
      style={{ color: c.color, background: c.bg }}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  )
}

export function Spinner({ size = 32, color = 'var(--accent)', className = '' }) {
  return (
    <div
      className={`animate-spin rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        border: `${Math.max(2, size / 12)}px solid ${color === 'currentColor' ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
        borderTopColor: color,
      }}
    />
  )
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Spinner />
      <p className="text-sm" style={{ color: 'var(--text-faint)' }}>{label}</p>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <Card className="text-center py-14 px-6 animate-in">
      {Icon && (
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
        >
          <Icon size={26} strokeWidth={1.75} />
        </div>
      )}
      <h3 className="text-white font-bold mb-1">{title}</h3>
      {description && <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--text-faint)' }}>{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div>
        {eyebrow && (
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {description && <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

