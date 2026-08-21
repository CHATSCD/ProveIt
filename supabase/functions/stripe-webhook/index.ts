// Supabase Edge Function: stripe-webhook
// Deploy via `supabase functions deploy stripe-webhook --no-verify-jwt`
// (or rely on `[functions.stripe-webhook] verify_jwt = false` in
// supabase/config.toml, which the Supabase CLI reads on deploy). Stripe
// calls this endpoint server-to-server with NO Supabase JWT, so it must NOT
// require Supabase auth — only the Stripe signature below authenticates it.
//
// Configure this URL as a webhook endpoint in the Stripe Dashboard:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
// Subscribe it to at least:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//
// Required env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY                        — Stripe secret key
//   STRIPE_WEBHOOK_SECRET                    — signing secret for this endpoint
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })
  : null

// Keep in sync with the `PLANS` array in src/pages/BillingPage.jsx and with
// create-checkout-session/index.ts. Used as a fallback to derive plan_tier
// from a subscription's price id when Stripe metadata isn't present (e.g.
// a subscription changed via the Stripe Dashboard rather than Checkout).
const PRICE_TIER_MAP: Record<string, string> = {
  'price_1U3VL0FvIuDEGDk4MRZ6SN46': 'starter',
  'price_1U3VL5FvIuDEGDk4P7GK84gr': 'pro',
  'price_1U3VL9FvIuDEGDk4mckJzNTM': 'pro_plus',
}

function resolveTier(subscription: Stripe.Subscription): string | undefined {
  const metaTier = subscription.metadata?.plan_tier
  if (metaTier) return metaTier
  const priceId = subscription.items?.data?.[0]?.price?.id
  return priceId ? PRICE_TIER_MAP[priceId] : undefined
}

async function updateLocationByCustomer(customerId: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('locations').update(fields).eq('stripe_customer_id', customerId)
  if (error) console.error(`Failed to update location for customer ${customerId}:`, error.message)
  return !error
}

async function updateLocationBySubscription(subscriptionId: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from('locations').update(fields).eq('stripe_subscription_id', subscriptionId)
  if (error) console.error(`Failed to update location for subscription ${subscriptionId}:`, error.message)
  return !error
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Stripe webhook is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // IMPORTANT: read the raw body BEFORE any JSON parsing — Stripe signature
  // verification is computed over the exact raw bytes Stripe sent.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    // constructEventAsync (not constructEvent) is required in Deno/edge
    // runtimes, which don't expose Node's synchronous crypto APIs that the
    // sync verifier depends on.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err?.message || err)
    return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${err?.message || err}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        const locationId = session.metadata?.location_id || session.client_reference_id || undefined
        const tier = session.metadata?.plan_tier

        if (!customerId) {
          console.error('checkout.session.completed with no customer id; session:', session.id)
          break
        }

        const fields: Record<string, unknown> = {
          subscription_status: 'active',
          trial_ends_at: null,
        }
        if (subscriptionId) fields.stripe_subscription_id = subscriptionId
        if (tier) fields.plan_tier = tier

        // Prefer the location_id we stamped into metadata; fall back to
        // matching by customer id if it's missing for some reason.
        if (locationId) {
          const { error } = await supabase.from('locations').update(fields).eq('id', locationId)
          if (error) console.error(`Failed to update location ${locationId}:`, error.message)
        } else {
          await updateLocationByCustomer(customerId, fields)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
        if (!customerId) {
          console.error('customer.subscription.updated with no customer id; subscription:', subscription.id)
          break
        }

        const fields: Record<string, unknown> = {
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id,
        }
        const tier = resolveTier(subscription)
        if (tier) fields.plan_tier = tier

        const ok = await updateLocationByCustomer(customerId, fields)
        if (!ok) await updateLocationBySubscription(subscription.id, fields)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

        const fields = { subscription_status: 'canceled' }

        let ok = false
        if (customerId) ok = await updateLocationByCustomer(customerId, fields)
        if (!ok) await updateLocationBySubscription(subscription.id, fields)
        break
      }

      default:
        // Unhandled event types are acknowledged so Stripe doesn't retry them.
        break
    }
  } catch (err) {
    console.error('stripe-webhook handler error:', err?.message || err)
    return new Response(JSON.stringify({ error: err?.message || 'Webhook handler failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
