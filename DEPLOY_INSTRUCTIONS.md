# ProveIt — Deploy Instructions for Claude Code

This is the complete, verified source for ProveIt. It builds cleanly
(`npm install && npm run build`) as of this package. Your job: get it
onto Vercel production.

## Project identifiers
- **Vercel project ID:** `prj_bQPlOoCjfStNqlV3M1lNE7HLMxTY` (project name `prove-it`, team `team_XGXRFTIEoPmeMRxkVd1H4oA4`)
- **Supabase project ref:** `aahfydouyyrvrcubwoxa` (already fully configured — schema, RLS, RPCs, edge functions, pg_cron jobs are all live; you should not need to touch Supabase for a frontend deploy)

## Deploy steps
1. `npm install`
2. `npm run build` — confirm it succeeds before deploying. If it doesn't, something in this package broke; check the error before proceeding, don't skip straight to deploy.
3. Deploy to the existing Vercel project above (via `vercel --prod` with the project linked, or however your Vercel integration works). Do **not** create a new project — this must go to the existing `prove-it` project so it lands on the domain already in use.

## Critical gotchas (all discovered the hard way in prior sessions — please don't reintroduce them)

1. **Never add a `crons` block to `vercel.json`.** Vercel's Hobby tier only allows daily+ cron frequency. A sub-daily `crons` entry causes the deployment to silently fail *after* the build succeeds, with no clear error in the build log — it just shows as a failed deployment. All scheduling for this app runs via Supabase `pg_cron` instead (already configured — three jobs: `process-checks-every-15-min`, `proveit-daily-digest`, `proveit-expire-fixits`). The current `vercel.json` in this package is already correct (no crons block) — keep it that way.

2. **The `submissions` Supabase Storage bucket is private**, not public. Photo URLs are created via `createSignedUrl()` with a 10-year expiry (see `src/pages/CheckPage.jsx` and `src/pages/FixItPage.jsx`). Don't switch to `getPublicUrl()` — it will silently 403 since the bucket has `public: false`.

3. **`submissions.manager_rating_total` is a Postgres GENERATED column.** Never write to it directly in an INSERT/UPDATE — Postgres rejects the whole statement if you do. It's computed automatically from the three sub-ratings.

4. **Scoring, FixIt triggers, and Coaching logic all live server-side** in Supabase RPCs (`submit_check`, `submit_manager_rating`, `submit_fixit_photos`, `sign_coaching_employee`, `sign_coaching_manager`) — this is intentional, closing a client-side-tampering gap that existed earlier. Don't move this logic back into the frontend.

## What's in this build (recent feature work, in case useful context)
- **TrustIt**: server-side GPS geofence enforcement on check submissions (`submit_check` RPC), configurable per-location radius, owner-settable coordinates via a "Set GPS" button on the Locations page
- **FixIt**: submissions scoring below 9/15 get a 30-minute employee-facing redo window (`src/pages/FixItPage.jsx`)
- **Coaching**: 3 low scores (below 9, since the last coaching) auto-creates a coaching record requiring both employee and manager e-signature; every 3rd coaching is an "escalation" requiring the manager to pick Final Written Warning or 3-Day Suspension; 3 *consecutive* high scores (13+) redeems the oldest active strike
- **ScoreIt™** — this is the current name for the points/leaderboard system (was previously called "ShiftScore" in some older code/docs — if you see "ShiftScore" anywhere outside of internal variable names, it should say "ScoreIt")

## Verifying after deploy
Once live, a quick smoke test worth doing:
- Load the deployed URL, confirm it's not a blank/error page
- Check that `/dashboard`, `/leaderboard` route correctly for a logged-in test user
- Confirm the Locations page shows the "Set GPS (TrustIt)" button for an owner
