-- ============================================================
-- ProveIt — schema.sql
-- Regenerated directly from the live Supabase database (project
-- aahfydouyyrvrcubwoxa) on 2026-08-14 via information_schema /
-- pg_catalog introspection, NOT hand-maintained. This replaces a
-- stale copy that had drifted significantly behind production —
-- every table/function/policy below was verified against the
-- actual live schema before being written here.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now(),
  plan_tier text not null default 'starter' check (plan_tier in ('starter', 'pro', 'pro_plus')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'inactive',
  trial_ends_at timestamptz,
  -- TrustIt geofence (GPS location capture from LocationsPage.jsx). Nullable:
  -- a location may not have GPS set yet, which the UI treats as "not verified".
  latitude numeric,
  longitude numeric,
  geofence_radius_meters integer default 150
);

create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  -- NOTE: previously `unique` (one employee row per auth user, globally).
  -- Relaxed to unique(user_id, location_id) below to support multi-location
  -- memberships (create_additional_location / LocationsPage.jsx): one user
  -- can now have one employee row per location, but not two rows at the
  -- same location.
  user_id uuid not null references auth.users(id),
  location_id uuid references locations(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('owner', 'manager', 'employee')),
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (user_id, location_id)
);

create table if not exists stations (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  qr_code_token text not null unique,
  is_active boolean default true,
  created_at timestamptz default now(),
  assigned_employee_id uuid references employees(id)
);

create table if not exists check_schedules (
  id uuid primary key default uuid_generate_v4(),
  station_id uuid not null references stations(id) on delete cascade,
  type text not null check (type in ('scheduled', 'random', 'manual')),
  interval_minutes int,
  active_start_time time,
  active_end_time time,
  window_start time,
  window_end time,
  min_gap_minutes int,
  submission_window_minutes int default 15,
  created_at timestamptz default now()
);

create table if not exists check_requests (
  id uuid primary key default uuid_generate_v4(),
  station_id uuid not null references stations(id) on delete cascade,
  schedule_id uuid references check_schedules(id),
  triggered_at timestamptz default now(),
  expires_at timestamptz not null,
  trigger_type text not null check (trigger_type in ('scheduled', 'random', 'manual')),
  triggered_by uuid references auth.users(id),
  status text default 'pending' check (status in ('pending', 'submitted', 'missed'))
);

create table if not exists submissions (
  id uuid primary key default uuid_generate_v4(),
  check_request_id uuid not null references check_requests(id) on delete cascade,
  employee_id uuid references employees(id),
  submitted_at timestamptz default now(),
  photo_urls text[] not null default '{}',
  geolocation_lat double precision,
  geolocation_lng double precision,
  employee_note text,
  is_late boolean default false,
  manager_rating_freshness int check (manager_rating_freshness between 1 and 5),
  manager_rating_stocked int check (manager_rating_stocked between 1 and 5),
  manager_rating_cleanliness int check (manager_rating_cleanliness between 1 and 5),
  -- manager_rating_total is a GENERATED column — never write to it directly
  manager_rating_total int generated always as
    (coalesce(manager_rating_freshness,0) + coalesce(manager_rating_stocked,0) + coalesce(manager_rating_cleanliness,0)) stored,
  rated_at timestamptz,
  rated_by uuid references auth.users(id),
  -- FixIt: submissions scoring below 9/15 get a 30-minute redo window
  fix_status text check (fix_status is null or fix_status in ('needs_fix', 'fixed', 'expired')),
  fix_deadline timestamptz,
  fix_photo_urls text[],
  fixed_at timestamptz
);

create table if not exists shift_scores (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_points int default 0,
  on_time_count int default 0,
  late_count int default 0,
  missed_count int default 0,
  avg_rating double precision default 0,
  rank int,
  created_at timestamptz default now(),
  unique (employee_id, location_id, period_start)
);

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid not null references locations(id),
  type text not null check (type in ('missed_check', 'two_misses', 'submission_ready', 'daily_digest')),
  message text not null,
  station_name text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique (employee_id, endpoint)
);

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

-- Progressive-discipline record. Requires both employee and manager
-- e-signature. Every 3rd coaching for an employee (3rd, 6th, 9th...) is
-- an escalation requiring the manager to pick a consequence.
create table if not exists coachings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  triggering_submission_ids uuid[] not null,
  employee_explanation text,
  employee_signature_name text,
  employee_signed_at timestamptz,
  manager_id uuid references employees(id),
  manager_signature_name text,
  manager_signed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz default now(),
  coaching_number int,
  is_escalation boolean not null default false,
  escalation_action text check (escalation_action is null or escalation_action in ('final_written_warning', 'suspension_3day')),
  suspension_start_date date,
  suspension_end_date date
);

-- ============================================================
-- PENDING SCHEMA PATCHES (idempotent — apply on top of the live DB)
-- ============================================================
-- The CREATE TABLE blocks above are a point-in-time snapshot introspected
-- from the live DB (see header) and are `if not exists`, so they no-op
-- against an already-existing table. The columns/constraint below are new
-- and must be applied via ALTER for them to actually land on the live
-- database; they're also included inline above so a fresh install gets
-- them from the start.

-- Gap 1: TrustIt geofence columns on locations (GPS capture via
-- LocationsPage.jsx's "Set GPS / TrustIt" button).
alter table locations
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists geofence_radius_meters integer default 150;

-- Gap 3: relax employees.user_id from a globally-unique column to
-- unique(user_id, location_id), so one auth user can hold one employee
-- row per location (multi-location memberships via create_additional_location)
-- while still being blocked from two rows at the same location.
do $$
begin
  -- Default Postgres name for the original inline `unique` on employees.user_id.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'employees'::regclass and conname = 'employees_user_id_key'
  ) then
    alter table employees drop constraint employees_user_id_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'employees'::regclass and conname = 'employees_user_id_location_id_key'
  ) then
    alter table employees add constraint employees_user_id_location_id_key unique (user_id, location_id);
  end if;
end $$;

-- Security fix: the live `emp_insert` policy previously allowed a
-- self-registering user to insert role='owner' directly (no role
-- constraint at all), letting anyone grant themselves owner access to any
-- existing location via a raw client insert. Owners are only ever meant to
-- be created through setup_owner_location() (security definer, bypasses
-- RLS) — self-registration (AuthContext.jsx signUp) only ever needs
-- 'employee'/'manager'. Re-create the policy with that restriction.
drop policy if exists "emp_insert" on employees;
create policy "emp_insert" on employees for insert with check (user_id = auth.uid() and role in ('employee', 'manager'));

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Note: several tables carry duplicate policies (same logic, two names)
-- left over from an earlier migration pass — harmless since permissive
-- policies OR together, but worth cleaning up eventually.

alter table locations enable row level security;
alter table employees enable row level security;
alter table stations enable row level security;
alter table check_schedules enable row level security;
alter table check_requests enable row level security;
alter table submissions enable row level security;
alter table shift_scores enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table platform_admins enable row level security;
alter table coachings enable row level security;

-- locations
create policy "loc_select" on locations for select using (id = get_my_location_id());
create policy "loc_insert" on locations for insert with check (auth.uid() = owner_id);
create policy "loc_update" on locations for update using (auth.uid() = owner_id);

-- Unauthenticated sign-up needs to browse the location list (AuthPage's
-- "Select a location" dropdown runs before the user has an employee row,
-- so get_my_location_id() above resolves to null and hides every row).
-- Column-scoped via grant since RLS can't restrict by column, keeping
-- billing/stripe fields out of the anonymous read.
create policy "loc_select_public" on locations for select to anon using (true);
revoke select on locations from anon;
grant select (id, name, address) on locations to anon;

-- employees
create policy "emp_select_own" on employees for select using (user_id = auth.uid());
create policy "emp_select_colleagues" on employees for select using (location_id = get_my_location_id());
-- Self-registration (AuthContext.jsx signUp) only ever needs to insert
-- 'employee'/'manager' rows for the caller's own user_id — 'owner' rows are
-- created exclusively via the setup_owner_location() security-definer RPC,
-- which bypasses RLS. Restricting role here closes a privilege-escalation
-- hole where a signed-up user could otherwise insert role='owner' directly.
create policy "emp_insert" on employees for insert with check (user_id = auth.uid() and role in ('employee', 'manager'));
create policy "emp_update" on employees for update using (location_id = get_my_location_id() and is_manager_or_above());

-- stations
create policy "sta_select" on stations for select using (location_id = get_my_location_id());
create policy "sta_insert" on stations for insert with check (location_id = get_my_location_id() and is_manager_or_above());
create policy "sta_update" on stations for update using (location_id = get_my_location_id() and is_manager_or_above());

-- check_schedules
create policy "sch_select" on check_schedules for select
  using (station_id in (select id from stations where location_id = get_my_location_id()));
create policy "sch_insert" on check_schedules for insert
  with check (station_id in (select id from stations where location_id = get_my_location_id()) and is_manager_or_above());
create policy "sch_update" on check_schedules for update
  using (station_id in (select id from stations where location_id = get_my_location_id()) and is_manager_or_above());
create policy "sch_delete" on check_schedules for delete
  using (station_id in (select id from stations where location_id = get_my_location_id()) and is_manager_or_above());

-- check_requests
create policy "cr_select" on check_requests for select
  using (station_id in (select id from stations where location_id = get_my_location_id()));
create policy "cr_insert" on check_requests for insert
  with check (station_id in (select id from stations where location_id = get_my_location_id()) and is_manager_or_above());
create policy "cr_update" on check_requests for update
  using (station_id in (select id from stations where location_id = get_my_location_id()));

-- submissions
create policy "sub_select_own" on submissions for select
  using (employee_id = (select id from employees where user_id = auth.uid() limit 1));
create policy "sub_select_manager" on submissions for select
  using (is_manager_or_above() and check_request_id in (
    select id from check_requests where station_id in (select id from stations where location_id = get_my_location_id())
  ));
create policy "sub_insert" on submissions for insert
  with check (employee_id = (select id from employees where user_id = auth.uid() limit 1));
create policy "sub_update" on submissions for update
  using (is_manager_or_above() and check_request_id in (
    select id from check_requests where station_id in (select id from stations where location_id = get_my_location_id())
  ));

-- shift_scores
create policy "ss_select" on shift_scores for select using (location_id = get_my_location_id());
create policy "ss_insert" on shift_scores for insert
  with check (employee_id = (select id from employees where user_id = auth.uid() limit 1));
create policy "ss_update" on shift_scores for update
  using (employee_id = (select id from employees where user_id = auth.uid() limit 1));

-- notifications
create policy "notif_select" on notifications for select using (location_id = get_my_location_id());
create policy "notif_update" on notifications for update using (location_id = get_my_location_id());

-- push_subscriptions
create policy "push_sub_own_select" on push_subscriptions for select
  using (employee_id = (select id from employees where user_id = auth.uid() limit 1));
create policy "push_sub_own_insert" on push_subscriptions for insert
  with check (employee_id = (select id from employees where user_id = auth.uid() limit 1));
create policy "push_sub_own_delete" on push_subscriptions for delete
  using (employee_id = (select id from employees where user_id = auth.uid() limit 1));

-- coachings — reads only; all writes go through the security-definer
-- RPCs below (sign_coaching_employee / sign_coaching_manager), which
-- do their own authorization checks and bypass RLS intentionally.
create policy "coaching_select_own_location" on coachings for select using (location_id = get_my_location_id());

-- platform_admins has no policies — deliberately locked down; only
-- readable/writable via the security-definer admin_* RPCs.

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function get_my_location_id()
returns uuid language sql stable security definer as $$
  select location_id from employees
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function get_my_employee()
returns employees language sql stable as $$
  select * from employees where user_id = auth.uid() and is_active = true limit 1;
$$;

create or replace function is_manager_or_above()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from employees
    where user_id = auth.uid() and is_active = true and role in ('manager', 'owner')
  );
$$;

create or replace function is_platform_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ============================================================
-- OWNER / LOCATION SETUP
-- ============================================================
-- Both of these are SECURITY DEFINER + explicit auth guards. They must
-- NOT be security invoker: they do INSERT ... RETURNING on locations,
-- and locations' SELECT policy requires get_my_location_id() to already
-- resolve — which is impossible for a brand-new owner (chicken-and-egg).
-- Postgres treats RETURNING's implicit read-back as a SELECT, so under
-- SECURITY INVOKER this fails with "violates row-level security policy"
-- even though the INSERT's own WITH CHECK passes. Discovered + fixed
-- live in this project — do not revert to invoker.

create or replace function setup_owner_location(
  p_name text, p_address text, p_display_name text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_location_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into locations (name, address, owner_id)
  values (p_name, p_address, auth.uid())
  returning id into v_location_id;

  insert into employees (user_id, location_id, display_name, role, is_active)
  values (auth.uid(), v_location_id, p_display_name, 'owner', true);

  return v_location_id;
end;
$$;

create or replace function create_additional_location(
  p_name text, p_address text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_location_id uuid;
  v_display_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select display_name into v_display_name
  from employees where user_id = auth.uid() and role = 'owner' limit 1;

  if v_display_name is null then
    raise exception 'Only existing owners can create additional locations';
  end if;

  insert into locations (name, address, owner_id)
  values (p_name, p_address, auth.uid())
  returning id into v_location_id;

  insert into employees (user_id, location_id, display_name, role, is_active)
  values (auth.uid(), v_location_id, v_display_name, 'owner', true);

  return v_location_id;
end;
$$;

-- Sets the TrustIt geofence anchor point for a location (LocationsPage.jsx's
-- "Set GPS / TrustIt" button). SECURITY DEFINER + explicit auth guard,
-- following the same pattern as the RPCs above: only an owner/manager who
-- actually holds an active employee row AT THAT SPECIFIC LOCATION may set
-- it — deliberately checked against p_location_id directly (not via
-- get_my_location_id(), which is only meaningful for a user's single
-- "current" location) so this works correctly for owners managing
-- multiple locations.
create or replace function set_location_coordinates(
  p_location_id uuid, p_lat numeric, p_lng numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from employees
    where user_id = auth.uid() and location_id = p_location_id
      and is_active = true and role in ('owner', 'manager')
  ) then
    raise exception 'Not authorized';
  end if;

  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid coordinates';
  end if;

  update locations set latitude = p_lat, longitude = p_lng
  where id = p_location_id;
end;
$$;

-- Flips which of the caller's employees rows is "active" (LocationsPage.jsx's
-- "Switch to this" button / AuthContext's switchLocation()). This MUST run
-- server-side and MUST be transactional: get_my_location_id() and every RLS
-- policy built on it pick an employees row via `is_active = true` with no
-- deterministic ordering, so a user who ever ends up with more than one
-- simultaneously-active row (e.g. right after create_additional_location)
-- would have RLS-scoped reads/writes resolve to an arbitrary location. This
-- RPC guarantees at most one active row per user at all times: it verifies
-- the caller actually holds an employees row at p_location_id, then clears
-- is_active on ALL of the caller's rows and sets it only on that one, in a
-- single statement-scoped transaction (function body = one implicit
-- transaction), so no intermediate state with zero or multiple active rows
-- is ever visible to a concurrent request.
create or replace function switch_active_location(
  p_location_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from employees
    where user_id = auth.uid() and location_id = p_location_id
  ) then
    raise exception 'Not authorized';
  end if;

  update employees set is_active = false
  where user_id = auth.uid() and is_active = true and location_id is distinct from p_location_id;

  update employees set is_active = true
  where user_id = auth.uid() and location_id = p_location_id;
end;
$$;

-- ============================================================
-- MANAGER RATING / FIXIT / COACHING
-- ============================================================
-- submit_manager_rating runs the ENTIRE rating flow server-side
-- (rating, ShiftScore points, FixIt trigger, coaching trigger with
-- redemption logic) so none of it can be tampered with from the client.

create or replace function submit_manager_rating(
  p_submission_id uuid, p_freshness int, p_stocked int, p_cleanliness int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_submission submissions%rowtype;
  v_location_id uuid;
  v_total int;
  v_bonus_points int := 0;
  v_week_start timestamptz;
  v_score_row shift_scores%rowtype;
  v_last_coaching_at timestamptz;
  v_active_strikes uuid[] := '{}';
  v_streak int := 0;
  v_redemptions int := 0;
  rec record;
  v_coaching_id uuid;
  v_coaching_number int;
  v_is_escalation boolean;
begin
  if not is_manager_or_above() then
    raise exception 'Not authorized';
  end if;
  if p_freshness not between 1 and 5 or p_stocked not between 1 and 5 or p_cleanliness not between 1 and 5 then
    raise exception 'Ratings must be between 1 and 5';
  end if;

  select * into v_submission from submissions where id = p_submission_id;
  if v_submission.id is null then raise exception 'Submission not found'; end if;
  if v_submission.rated_at is not null then raise exception 'Submission already rated'; end if;

  select s.location_id into v_location_id
    from check_requests cr join stations s on s.id = cr.station_id
    where cr.id = v_submission.check_request_id;

  v_total := p_freshness + p_stocked + p_cleanliness;

  update submissions set
    manager_rating_freshness = p_freshness,
    manager_rating_stocked = p_stocked,
    manager_rating_cleanliness = p_cleanliness,
    rated_at = now(),
    rated_by = auth.uid(),
    fix_status = case when v_total < 9 then 'needs_fix' else fix_status end,
    fix_deadline = case when v_total < 9 then now() + interval '30 minutes' else fix_deadline end
  where id = p_submission_id;

  if v_total >= 13 then v_bonus_points := 15;
  elsif v_total >= 9 then v_bonus_points := 8;
  end if;

  if v_bonus_points > 0 and v_submission.employee_id is not null then
    v_week_start := date_trunc('week', now());
    select * into v_score_row from shift_scores
      where employee_id = v_submission.employee_id and period_start >= v_week_start limit 1;
    if v_score_row.id is not null then
      update shift_scores set
        total_points = total_points + v_bonus_points,
        avg_rating = ((avg_rating * greatest(on_time_count + late_count - 1, 0)) + v_total)
                     / nullif(on_time_count + late_count, 0)
      where id = v_score_row.id;
    end if;
  end if;

  -- FixIt/Coaching: strikes below 9, redeemed by 3 CONSECUTIVE scores >= 13
  if v_submission.employee_id is not null then
    select max(created_at) into v_last_coaching_at
      from coachings where employee_id = v_submission.employee_id;

    for rec in
      select sub.id, sub.manager_rating_total as total
      from submissions sub
      where sub.employee_id = v_submission.employee_id
        and sub.rated_at is not null
        and (v_last_coaching_at is null or sub.rated_at > v_last_coaching_at)
      order by sub.rated_at asc
    loop
      if rec.total < 9 then
        v_active_strikes := v_active_strikes || rec.id;
        v_streak := 0;
      elsif rec.total >= 13 then
        v_streak := v_streak + 1;
        if v_streak >= 3 then
          if array_length(v_active_strikes, 1) > 0 then
            v_active_strikes := v_active_strikes[2:array_length(v_active_strikes, 1)];
            v_redemptions := v_redemptions + 1;
          end if;
          v_streak := 0;
        end if;
      else
        v_streak := 0;
      end if;
    end loop;

    if array_length(v_active_strikes, 1) >= 3 then
      select coalesce(max(coaching_number), 0) + 1 into v_coaching_number
        from coachings where employee_id = v_submission.employee_id;
      v_is_escalation := (v_coaching_number % 3 = 0);

      insert into coachings (employee_id, location_id, triggering_submission_ids, coaching_number, is_escalation)
      values (v_submission.employee_id, v_location_id, v_active_strikes[1:3], v_coaching_number, v_is_escalation)
      returning id into v_coaching_id;
    end if;
  end if;

  return jsonb_build_object(
    'total', v_total, 'needs_fix', v_total < 9,
    'active_strikes', coalesce(array_length(v_active_strikes, 1), 0),
    'redemptions_applied', v_redemptions,
    'coaching_triggered', v_coaching_id is not null,
    'coaching_id', v_coaching_id, 'coaching_number', v_coaching_number,
    'is_escalation', coalesce(v_is_escalation, false)
  );
end;
$$;

create or replace function submit_fixit_photos(
  p_submission_id uuid, p_photo_urls text[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_submission submissions%rowtype;
begin
  select * into v_submission from submissions where id = p_submission_id;
  if v_submission.id is null then raise exception 'Submission not found'; end if;
  if v_submission.employee_id != (select id from employees where user_id = auth.uid() and is_active = true limit 1) then
    raise exception 'Not authorized';
  end if;
  if v_submission.fix_status != 'needs_fix' then
    raise exception 'This submission is not awaiting a fix';
  end if;
  if now() > v_submission.fix_deadline then
    update submissions set fix_status = 'expired' where id = p_submission_id;
    raise exception 'The 30-minute fix window has expired';
  end if;

  update submissions set fix_photo_urls = p_photo_urls, fix_status = 'fixed', fixed_at = now()
  where id = p_submission_id;
end;
$$;

create or replace function expire_stale_fixits()
returns void language sql security definer set search_path = public as $$
  update submissions set fix_status = 'expired'
  where fix_status = 'needs_fix' and fix_deadline < now();
$$;

create or replace function sign_coaching_employee(
  p_coaching_id uuid, p_signature_name text, p_explanation text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_coaching coachings%rowtype;
  v_my_employee_id uuid;
begin
  select id into v_my_employee_id from employees where user_id = auth.uid() and is_active = true limit 1;
  select * into v_coaching from coachings where id = p_coaching_id;

  if v_coaching.id is null then raise exception 'Coaching record not found'; end if;
  if v_coaching.employee_id != v_my_employee_id then raise exception 'Not authorized'; end if;
  if trim(coalesce(p_explanation, '')) = '' then raise exception 'An explanation is required'; end if;
  if trim(coalesce(p_signature_name, '')) = '' then raise exception 'A signature is required'; end if;

  update coachings set
    employee_explanation = p_explanation,
    employee_signature_name = p_signature_name,
    employee_signed_at = now(),
    status = case when manager_signed_at is not null then 'completed' else status end
  where id = p_coaching_id;
end;
$$;

-- NOTE: only ONE version of this function should ever exist. An earlier
-- 2-arg version (pre-escalation) was left behind by CREATE OR REPLACE
-- not matching signatures and had to be explicitly DROPped, because it
-- let a manager sign an escalation coaching without picking a
-- consequence — a real bypass that was live for a time. If you ever add
-- parameters to this function again, DROP the old signature explicitly.
create or replace function sign_coaching_manager(
  p_coaching_id uuid, p_signature_name text, p_escalation_action text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_coaching coachings%rowtype;
  v_my_employee_id uuid;
begin
  if not is_manager_or_above() then raise exception 'Not authorized'; end if;
  select id into v_my_employee_id from employees where user_id = auth.uid() and is_active = true limit 1;
  select * into v_coaching from coachings where id = p_coaching_id;

  if v_coaching.id is null then raise exception 'Coaching record not found'; end if;
  if v_coaching.location_id != get_my_location_id() then raise exception 'Not authorized'; end if;
  if trim(coalesce(p_signature_name, '')) = '' then raise exception 'A signature is required'; end if;
  if v_coaching.is_escalation and p_escalation_action not in ('final_written_warning', 'suspension_3day') then
    raise exception 'This is a 3rd-strike coaching — select Final Written Warning or 3-Day Suspension before signing';
  end if;

  update coachings set
    manager_id = v_my_employee_id,
    manager_signature_name = p_signature_name,
    manager_signed_at = now(),
    escalation_action = case when is_escalation then p_escalation_action else escalation_action end,
    suspension_start_date = case when is_escalation and p_escalation_action = 'suspension_3day' then current_date else suspension_start_date end,
    suspension_end_date = case when is_escalation and p_escalation_action = 'suspension_3day' then current_date + 2 else suspension_end_date end,
    status = case when employee_signed_at is not null then 'completed' else status end
  where id = p_coaching_id;
end;
$$;

-- ============================================================
-- PLATFORM ADMIN (Shaun's own super-admin tools, not per-location owner)
-- ============================================================

create or replace function admin_list_locations()
returns table (
  id uuid, name text, address text, plan_tier text, subscription_status text,
  trial_ends_at timestamptz, created_at timestamptz,
  owner_email text, owner_name text, active_employee_count bigint
) language plpgsql security definer as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  return query
  select l.id, l.name, l.address, l.plan_tier, l.subscription_status, l.trial_ends_at, l.created_at,
    u.email as owner_email, e.display_name as owner_name,
    (select count(*) from employees e2 where e2.location_id = l.id and e2.is_active) as active_employee_count
  from locations l
  left join employees e on e.location_id = l.id and e.role = 'owner'
  left join auth.users u on u.id = l.owner_id
  order by l.created_at desc;
end;
$$;

create or replace function admin_grant_trial(p_location_id uuid, p_days int default 14, p_tier text default 'pro')
returns void language plpgsql security definer as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  update locations set plan_tier = p_tier, subscription_status = 'trialing',
    trial_ends_at = now() + (p_days || ' days')::interval
  where id = p_location_id;
end;
$$;

create or replace function admin_comp_plan(p_location_id uuid, p_tier text)
returns void language plpgsql security definer as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  update locations set plan_tier = p_tier, subscription_status = 'comped', trial_ends_at = null
  where id = p_location_id;
end;
$$;

create or replace function admin_reset_billing(p_location_id uuid)
returns void language plpgsql security definer as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  update locations set plan_tier = 'starter', subscription_status = 'inactive', trial_ends_at = null
  where id = p_location_id;
end;
$$;

create or replace function admin_add_platform_admin(p_email text)
returns void language plpgsql security definer as $$
declare
  v_uid uuid;
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then
    raise exception 'No user found with that email — they need to sign up in the app first';
  end if;
  insert into platform_admins (user_id, email) values (v_uid, p_email) on conflict (user_id) do nothing;
end;
$$;

-- ============================================================
-- SCHEDULED JOBS (pg_cron — not Vercel cron; see note below)
-- ============================================================
-- IMPORTANT: do not add a `crons` block to vercel.json. On Vercel's
-- Hobby tier that silently kills every deployment after the build
-- succeeds, with no visible error. All scheduling lives here instead.

select cron.schedule(
  'process-checks-every-15-min', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://aahfydouyyrvrcubwoxa.supabase.co/functions/v1/process-checks',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'proveit-daily-digest', '0 12 * * *', $$
  select net.http_post(
    url := 'https://aahfydouyyrvrcubwoxa.supabase.co/functions/v1/daily-digest',
    headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'proveit-expire-fixits', '*/5 * * * *', $$select expire_stale_fixits();$$
);

-- ============================================================
-- STORAGE
-- ============================================================
-- Bucket "submissions" is PRIVATE (public: false) — check-photo URLs are
-- Supabase signed URLs (10-year expiry, set at upload time in
-- CheckPage.jsx), not public URLs. Do not switch back to getPublicUrl()
-- on this bucket; it will 403.

-- ============================================================
-- REALTIME
-- ============================================================
-- check_requests, submissions, and notifications are added to the
-- supabase_realtime publication for live dashboard updates.
