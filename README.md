# ProveIt

ProveIt is a restaurant food-safety/compliance-check app. Employees complete
scheduled, random, or manual checks at physical stations (photo +
geolocation), managers rate submissions, and the app drives scoring
(ScoreIt™), progressive discipline (Coaching), timed redo windows (FixIt),
a leaderboard, PWA push notifications, and paid subscriptions (Stripe
billing) across one or more locations per owner.

- **Frontend:** React 19 + Vite, React Router, Tailwind CSS
- **Backend:** Supabase (Postgres with Row Level Security, RPC functions,
  Edge Functions, `pg_cron` for scheduled jobs)
- **Hosting:** Vercel (frontend + two `/api` serverless routes that trigger
  Supabase Edge Functions — see `DEPLOY_INSTRUCTIONS.md`)

## Getting started

```
npm install
npm run dev      # local dev server
npm run build    # production build
npm run lint     # eslint
```

Copy `.env.example` and fill in the frontend (`VITE_`-prefixed) values. See
`.env.example` for the full, current list of environment variables and
which ones are frontend build-time vars vs. server-side Supabase Edge
Function secrets (set separately via `supabase secrets set`, never checked
into this repo or given a `VITE_` prefix).

## Key features
- **TrustIt** — server-side GPS geofence enforcement on check submissions
- **FixIt** — a 30-minute employee redo window for submissions scoring
  below 9/15
- **Coaching** — auto-generated progressive-discipline records with
  employee + manager e-signature, including escalations
- **ScoreIt™** — points/leaderboard system
- **Multi-location membership** — one user can belong to more than one
  location
- **Push notifications** — PWA service worker + Supabase Edge Function
  (VAPID)
- **Billing** — Stripe Checkout + webhook-driven subscription state
- **Platform Admin** — a separate super-admin surface for managing
  locations/trials/billing across the whole platform

## Deploying

See `DEPLOY_INSTRUCTIONS.md` for the full deploy process, required
environment variables and Supabase secrets, edge function deployment, and
known gotchas (some are load-bearing — e.g. the Storage bucket must stay
private, `manager_rating_total` is a generated column, and there's an
open question about whether Vercel `crons` in `vercel.json` should coexist
with the existing Supabase `pg_cron` jobs — read gotcha #1 before your
first deploy).
