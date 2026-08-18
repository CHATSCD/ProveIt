// Plain style helpers shared by form inputs across pages. Kept out of
// ui.jsx so that file only exports components (react-refresh requires it).

export const inputStyle = {
  background: 'var(--inset)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

export const focusRing = {
  onFocus: (e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-soft)' },
  onBlur: (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' },
}
