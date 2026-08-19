import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Real Stripe Price IDs (live mode, "Shauns AI Launchpad" account)
const PLANS = [
  {
    tier: 'starter',
    name: 'Starter',
    price: '$19.99',
    priceId: 'price_1U3VL0FvIuDEGDk4MRZ6SN46',
    features: ['2 stations', 'Scheduled checks only', '1 manager seat'],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$34.99',
    priceId: 'price_1U3VL5FvIuDEGDk4P7GK84gr',
    features: ['Unlimited stations', 'Surprise checks', 'Manager rating', 'Leaderboard'],
    highlight: true,
  },
  {
    tier: 'pro_plus',
    name: 'Pro+',
    price: '$49.99',
    priceId: 'price_1U3VL9FvIuDEGDk4mckJzNTM',
    features: ['Everything in Pro', 'ShiftScore™', 'PDF compliance export', 'Multi-location', 'SMS alerts'],
  },
]

export default function BillingPage() {
  const { employee } = useAuth()
  const [loadingTier, setLoadingTier] = useState(null)
  const [error, setError] = useState('')

  const currentTier = employee?.locations?.plan_tier || 'starter'

  async function handleUpgrade(plan) {
    setLoadingTier(plan.tier)
    setError('')
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          price_id: plan.priceId,
          location_id: employee.location_id,
          success_url: `${window.location.origin}/billing?success=1`,
          cancel_url: `${window.location.origin}/billing`,
        },
      })
      if (fnError) throw fnError
      if (data?.url) {
        window.location.href = data.url
      } else {
        throw new Error(data?.error || 'Could not start checkout. Billing may not be fully configured yet.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Plans & Billing</h1>
        <p className="text-gray-400 text-sm">
          Current plan: <span className="capitalize font-semibold" style={{ color: '#ff6b2b' }}>{currentTier.replace('_', '+')}</span>
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-xl text-sm text-red-300 max-w-md mx-auto"
             style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const isCurrent = plan.tier === currentTier
          return (
            <div key={plan.tier}
                 className="rounded-2xl p-6 flex flex-col"
                 style={{
                   background: '#1a2235',
                   border: plan.highlight ? '1px solid #ff6b2b' : '1px solid #2d3748',
                 }}>
              {plan.highlight && (
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#ff6b2b' }}>
                  Most Popular
                </div>
              )}
              <h3 className="text-lg font-bold text-white">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-black text-white">{plan.price}</span>
                <span className="text-gray-500 text-sm">/mo</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="text-sm text-gray-300 flex items-start gap-2">
                    <span style={{ color: '#22c55e' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleUpgrade(plan)}
                disabled={isCurrent || loadingTier === plan.tier}
                className="w-full py-2.5 rounded-xl font-bold text-sm transition-all"
                style={isCurrent
                  ? { background: '#374151', color: '#9ca3af', cursor: 'default' }
                  : { background: '#ff6b2b', color: 'white', cursor: loadingTier ? 'wait' : 'pointer' }}
              >
                {isCurrent ? 'Current Plan' : loadingTier === plan.tier ? 'Loading...' : `Choose ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-gray-600 mt-6">
        Payments processed securely by Stripe. Cancel anytime.
      </p>
    </div>
  )
}
