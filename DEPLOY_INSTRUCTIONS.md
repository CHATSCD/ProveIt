# ProveIt — Deploy Instructions for Claude Code

ProveIt is a restaurant-compliance-check app: employees complete
scheduled/random/manual checks at physical stations (photo + geolocation),
managers rate them, and the app turns that into scoring (ScoreIt™),
progressive discipline (Coaching), redo windows (FixIt), a leaderboard,
push notifications, and paid subscriptions (Stripe billing) — across
potentially multiple locations per owner. Frontend is React + Vite,
backend is Supabase (Postgres + RLS + Edge Functions), hosted on Vercel.

This doc was last cross-checked against the actual code on 2026-08-21
(production-readiness pass). It builds cleanly (`npm install && npm run
build`) as of that check. Your job: get it onto Vercel production.

## Project identifiers
- **Vercel project ID:** `prj_bQPlOoCjfStNqlV3M1lNE7HLMxTY` (project name `prove-it`, team `team_XGXRFTIEoPmeMRxkVd1H4oA4`)
- **Supabase project ref:** `aahfydouyyrvrcubwoxa` (schema, RLS, RPCs, and pg_cron jobs are already live; edge functions still need to be deployed/redeployed whenever their code changes — see below)

## Deploy steps
1. `npm install`
2. `npm run build` — confirm it succeeds before deploying. If it doesn't, something broke; check the error before proceeding, don't skip straight to deploy.
3. Set the frontend env vars in Vercel (Project Settings -> Environment Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. See `.env.example` for the full, current list of env vars and which ones are frontend vs. Supabase Edge Function secrets — it's kept in sync with the code, so treat it as the source of truth over this doc if they ever disagree.
4. Set the Supabase Edge Function secrets (server-side, never `VITE_`-prefixed) via the Supabase CLI:
   ```
   supabase secrets set VAPID_PRIVATE_KEY=...
   supabase secrets set VAPID_SUBJECT=mailto:you@yourdomain.com   # optional, has a code default
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the Supabase runtime — don't set those manually.
5. Deploy the edge functions if their code has changed since the last deploy: `supabase functions deploy daily-digest process-checks send-push create-checkout-session stripe-webhook` (or deploy individually).
6. Register the Stripe webhook endpoint (`.../functions/v1/stripe-webhook`) in the Stripe dashboard if not already done, and confirm its signing secret matches `STRIPE_WEBHOOK_SECRET`.
7. Deploy to the existing Vercel project above (via `vercel --prod` with the project linked, or however your Vercel integration works). Do **not** create a new project — this must go to the existing `prove-it` project so it lands on the domain already in use.

## Critical gotchas (all discovered the hard way in prior sessions — please don't reintroduce them)

1. **`vercel.json` currently has a `crons` block — this needs a deliberate decision before deploying, it is not settled.** Earlier guidance in this doc (and a comment in `supabase/schema.sql`) said to *never* add a `crons` block: Vercel's Hobby tier only allows daily+ cron frequency, and a sub-daily entry causes the deployment to silently fail after the build succeeds. All scheduling was subsequently moved to Supabase `pg_cron` instead (three jobs already live: `process-checks-every-15-min`, `proveit-daily-digest`, `proveit-expire-fixits`). However, an older `crons` block calling `/api/trigger-checks` (`*/15 * * * *`) and `/api/trigger-digest` (`0 12 * * *`) is still present in `vercel.json` — both sub-daily. As of this audit it has **not** been removed. Before deploying, either (a) confirm the Vercel project is on a paid tier where sub-daily crons are allowed, **and** disable the corresponding `pg_cron` jobs so `process-checks`/`daily-digest` aren't triggered twice on overlapping schedules, or (b) remove the `crons` block from `vercel.json` entirely and rely solely on the existing `pg_cron` jobs. Don't deploy with both active without resolving this — right now they'd double-fire.

2. **The `submissions` Supabase Storage bucket is private**, not public. Photo URLs are created via `createSignedUrl()` with a 10-year expiry (see `src/pages/CheckPage.jsx` and `src/pages/FixItPage.jsx`). Don't switch to `getPublicUrl()` — it will silently 403 since the bucket has `public: false`.

3. **`submissions.manager_rating_total` is a Postgres GENERATED column.** Never write to it directly in an INSERT/UPDATE — Postgres rejects the whole statement if you do. It's computed automatically from the three sub-ratings.

4. **Scoring, FixIt triggers, Coaching logic, multi-location switching, GPS/geofence writes, and billing state changes all live server-side** in Supabase RPCs (`submit_check`, `submit_manager_rating`, `submit_fixit_photos`, `sign_coaching_employee`, `sign_coaching_manager`, `setup_owner_location`, `create_additional_location`, `switch_active_location`, `set_location_coordinates`, `admin_*`) — this is intentional, closing client-side-tampering gaps. Don't move this logic back into the frontend.

5. **Never hardcode a server-side secret (Stripe secret key, service role key, VAPID private key) into any file under `src/` or `api/`.** Those ship to the browser (`src/`) or run in a public-ish serverless function (`api/`) without protection. The Supabase *anon* key is the one exception already hardcoded in `src/lib/supabase.js`, `api/trigger-checks.js`, and `api/trigger-digest.js` — that's safe by design since it relies on RLS, not secrecy.

## What's in this build (feature set as of 2026-08-21)
- **TrustIt**: server-side GPS geofence enforcement on check submissions (`submit_check` RPC), configurable per-location radius, owner-settable coordinates via a "Set GPS" button on the Locations page
- **FixIt**: submissions scoring below 9/15 get a 30-minute employee-facing redo window (`src/pages/FixItPage.jsx`)
- **Coaching**: 3 low scores (below 9, since the last coaching) auto-creates a coaching record requiring both employee and manager e-signature; every 3rd coaching is an "escalation" requiring the manager to pick Final Written Warning or 3-Day Suspension; 3 *consecutive* high scores (13+) redeems the oldest active strike
- **ScoreIt™** — this is the current name for the points/leaderboard system (was previously called "ShiftScore" in some older code/docs — if you see "ShiftScore" anywhere outside of internal variable/function names, it should say "ScoreIt". Note: `src/pages/BillingPage.jsx` still shows "ShiftScore™" as a user-facing Pro+ feature bullet as of this audit — worth fixing.)
- **Multi-location membership**: one owner/user can hold an `employees` row at more than one location (`create_additional_location`, `switch_active_location` RPCs); `LocationsPage.jsx` is the UI for switching and adding locations
- **Push notifications (PWA)**: `public/sw.js` service worker, `src/lib/push.js` client subscribe/unsubscribe, `supabase/functions/send-push` edge function using a VAPID keypair
- **Billing (Stripe)**: `supabase/functions/create-checkout-session` and `supabase/functions/stripe-webhook` edge functions, `src/pages/BillingPage.jsx` for plan selection (Starter/Pro/Pro+); subscription state lives on `locations.plan_tier` / `stripe_customer_id` / `stripe_subscription_id` / `subscription_status`
- **Platform Admin**: `src/pages/PlatformAdminPage.jsx` + `admin_*` RPCs, gated by the `platform_admins` table (a super-admin surface separate from per-location owners)

## Verifying after deploy
Once live, a quick smoke test worth doing:
- Load the deployed URL, confirm it's not a blank/error page
- Check that `/dashboard`, `/leaderboard` route correctly for a logged-in test user
- Confirm the Locations page shows the "Set GPS (TrustIt)" button for an owner
- Confirm push notification opt-in works (or at least doesn't throw) from an employee dashboard
- Run a Stripe test-mode checkout and confirm `stripe-webhook` updates `locations.subscription_status`
- Check the Vercel Functions/Cron tab (or Supabase edge function logs) to make sure `process-checks` and `daily-digest` aren't firing twice per interval — see gotcha #1 above
