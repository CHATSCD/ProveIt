// Supabase Edge Function: create-checkout-session
// Deploy via `supabase functions deploy create-checkout-session` (or the
// dashboard). Invoked directly from the browser by
// src/pages/BillingPage.jsx's handleUpgrade() via
// supabase.functions.invoke('create-checkout-session', { body: {...} }).
//
// Request body (matches BillingPage.jsx exactly):
//   {
//     price_id: string,      // Stripe Price ID, e.g. 'price_1U3VL0FvIuDEGDk4MRZ6SN46'
//     location_id: string,   // uuid — the location to bill / subscribe
//     success_url: string,   // e.g. `${origin}/billing?success=1`
//     cancel_url: string,    // e.g. `${origin}/billing`
//   }
//
// Response body:
//   success: { url: string }               // Stripe Checkout URL to redirect to
//   failure: { error: string }  (+ non-2xx status)
//
// Required env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY                        — Stripe secret key
//   SUPABASE_URL / SUPABASE_ANON_KEY /
//   SUPABASE_SERVICE_ROLE_KEY                — auto-injected by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17?target=deno'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })
  : null

// Keep in sync with the `PLANS` array in src/pages/BillingPage.jsx. Used to
// validate the incoming price_id and to stamp a plan_tier onto Stripe
// metadata so the webhook can sync locations.plan_tier without a second
// lookup.
const PRICE_TIER_MAP: Record<string, string> = {
  'price_1U3VL0FvIuDEGDk4MRZ6SN46': 'starter',
  'price_1U3VL5FvIuDEGDk4P7GK84gr': 'pro',
  'price_1U3VL9FvIuDEGDk4mckJzNTM': 'pro_plus',
}

interface CheckoutBody {
  price_id?: string
  location_id?: string
  success_url?: string
  cancel_url?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!stripe) {
    return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured' }, 500)
  }

  let body: CheckoutBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { price_id, location_id, success_url, cancel_url } = body

  if (!price_id || !location_id) {
    return jsonResponse({ error: 'price_id and location_id are required' }, 400)
  }

  const tier = PRICE_TIER_MAP[price_id]
  if (!tier) {
    return jsonResponse({ error: 'Unrecognized price_id' }, 400)
  }

  // ── Authenticate the caller and verify they own this location ────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token)
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401)
  }
  const callerId = userData.user.id

  // Service-role client — used for the ownership check (so it isn't subject
  // to RLS edge cases) and for writing stripe_customer_id back onto
  // locations, since the caller's own auth.uid() may or may not equal
  // locations.owner_id (the loc_update RLS policy keys off owner_id, which
  // can drift from the employees.role='owner' row we check here).
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: ownerRow, error: ownerErr } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('user_id', callerId)
    .eq('location_id', location_id)
    .eq('role', 'owner')
    .maybeSingle()

  if (ownerErr) {
    return jsonResponse({ error: ownerErr.message }, 500)
  }
  if (!ownerRow) {
    return jsonResponse({ error: 'Only the location owner can manage billing' }, 403)
  }

  const { data: location, error: locErr } = await supabaseAdmin
    .from('locations')
    .select('id, stripe_customer_id, name')
    .eq('id', location_id)
    .single()

  if (locErr || !location) {
    return jsonResponse({ error: 'Location not found' }, 404)
  }

  // ── Reuse or create the Stripe customer ───────────────────────────────────
  let customerId = location.stripe_customer_id as string | null

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email ?? undefined,
        name: location.name ?? undefined,
        metadata: { location_id, supabase_user_id: callerId },
      })
      customerId = customer.id

      const { error: updateErr } = await supabaseAdmin
        .from('locations')
        .update({ stripe_customer_id: customerId })
        .eq('id', location_id)

      if (updateErr) {
        return jsonResponse({ error: `Failed to save Stripe customer: ${updateErr.message}` }, 500)
      }
    }

    // ── Create the Checkout Session ─────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: success_url || `${new URL(req.url).origin}/billing?success=1`,
      cancel_url: cancel_url || `${new URL(req.url).origin}/billing`,
      client_reference_id: location_id,
      metadata: { location_id, plan_tier: tier },
      subscription_data: {
        metadata: { location_id, plan_tier: tier },
      },
    })

    if (!session.url) {
      return jsonResponse({ error: 'Stripe did not return a checkout URL' }, 500)
    }

    return jsonResponse({ url: session.url })
  } catch (err) {
    console.error('create-checkout-session error:', err?.message || err)
    return jsonResponse({ error: err?.message || 'Failed to create checkout session' }, 500)
  }
})
