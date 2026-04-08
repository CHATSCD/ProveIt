-- ============================================================
-- ProveIt — Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- LOCATIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists locations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  address     text,
  owner_id    uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- EMPLOYEES
-- ─────────────────────────────────────────────────────────────
create table if not exists employees (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) unique not null,
  location_id  uuid references locations(id) on delete cascade,
  display_name text not null,
  role         text not null check (role in ('owner', 'manager', 'employee')),
  is_active    boolean default true,
  created_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- STATIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists stations (
  id             uuid primary key default uuid_generate_v4(),
  location_id    uuid references locations(id) on delete cascade not null,
  name           text not null,
  qr_code_token  text unique not null,
  is_active      boolean default true,
  created_at     timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- CHECK SCHEDULES
-- ─────────────────────────────────────────────────────────────
create table if not exists check_schedules (
  id                        uuid primary key default uuid_generate_v4(),
  station_id                uuid references stations(id) on delete cascade not null,
  type                      text not null check (type in ('scheduled', 'random', 'manual')),
  interval_minutes          int,          -- for scheduled: e.g. 120
  active_start_time         time,         -- e.g. '08:00:00'
  active_end_time           time,         -- e.g. '22:00:00'
  window_start              time,         -- for random
  window_end                time,         -- for random
  min_gap_minutes           int,          -- for random
  submission_window_minutes int default 15,
  created_at                timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- CHECK REQUESTS
-- ─────────────────────────────────────────────────────────────
create table if not exists check_requests (
  id           uuid primary key default uuid_generate_v4(),
  station_id   uuid references stations(id) on delete cascade not null,
  schedule_id  uuid references check_schedules(id),
  triggered_at timestamptz default now(),
  expires_at   timestamptz not null,
  trigger_type text not null check (trigger_type in ('scheduled', 'random', 'manual')),
  triggered_by uuid references auth.users(id),   -- null if auto
  status       text default 'pending' check (status in ('pending', 'submitted', 'missed'))
);

create index if not exists check_requests_station_status on check_requests(station_id, status);
create index if not exists check_requests_expires_at on check_requests(expires_at);

-- ─────────────────────────────────────────────────────────────
-- SUBMISSIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists submissions (
  id                         uuid primary key default uuid_generate_v4(),
  check_request_id           uuid references check_requests(id) on delete cascade not null,
  employee_id                uuid references employees(id),
  submitted_at               timestamptz default now(),
  photo_urls                 text[] not null default '{}',
  geolocation_lat            float,
  geolocation_lng            float,
  employee_note              text,
  is_late                    boolean default false,
  manager_rating_freshness   int check (manager_rating_freshness between 1 and 5),
  manager_rating_stocked     int check (manager_rating_stocked between 1 and 5),
  manager_rating_cleanliness int check (manager_rating_cleanliness between 1 and 5),
  manager_rating_total       int generated always as (
    coalesce(manager_rating_freshness, 0) +
    coalesce(manager_rating_stocked, 0) +
    coalesce(manager_rating_cleanliness, 0)
  ) stored,
  rated_at   timestamptz,
  rated_by   uuid references auth.users(id)
);

create index if not exists submissions_employee_id on submissions(employee_id);
create index if not exists submissions_rated_at on submissions(rated_at) where rated_at is null;

-- ─────────────────────────────────────────────────────────────
-- SHIFT SCORES
-- ─────────────────────────────────────────────────────────────
create table if not exists shift_scores (
  id             uuid primary key default uuid_generate_v4(),
  employee_id    uuid references employees(id) on delete cascade not null,
  location_id    uuid references locations(id) on delete cascade not null,
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  total_points   int default 0,
  on_time_count  int default 0,
  late_count     int default 0,
  missed_count   int default 0,
  avg_rating     float default 0,
  rank           int,
  created_at     timestamptz default now(),
  unique(employee_id, location_id, period_start)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table locations        enable row level security;
alter table employees        enable row level security;
alter table stations         enable row level security;
alter table check_schedules  enable row level security;
alter table check_requests   enable row level security;
alter table submissions      enable row level security;
alter table shift_scores     enable row level security;

-- ─────────────────────────────────────────────────────────────
-- HELPER: get current user's employee record
-- ─────────────────────────────────────────────────────────────
create or replace function get_my_employee()
returns employees
language sql stable
as $$
  select * from employees where user_id = auth.uid() and is_active = true limit 1;
$$;

create or replace function get_my_location_id()
returns uuid
language sql stable
as $$
  select location_id from employees where user_id = auth.uid() and is_active = true limit 1;
$$;

create or replace function is_manager_or_above()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from employees
    where user_id = auth.uid()
    and is_active = true
    and role in ('manager', 'owner')
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- LOCATIONS policies
-- ─────────────────────────────────────────────────────────────
create policy "Users can see their own location"
  on locations for select
  using (id = get_my_location_id());

create policy "Owners can create locations"
  on locations for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their location"
  on locations for update
  using (auth.uid() = owner_id);

-- ─────────────────────────────────────────────────────────────
-- EMPLOYEES policies
-- ─────────────────────────────────────────────────────────────
create policy "Employees can see colleagues at same location"
  on employees for select
  using (location_id = get_my_location_id());

create policy "Users can see their own employee record"
  on employees for select
  using (user_id = auth.uid());

create policy "Anyone can create their own employee record"
  on employees for insert
  with check (user_id = auth.uid());

create policy "Managers can update employees at their location"
  on employees for update
  using (location_id = get_my_location_id() and is_manager_or_above());

-- ─────────────────────────────────────────────────────────────
-- STATIONS policies
-- ─────────────────────────────────────────────────────────────
create policy "Location members can view stations"
  on stations for select
  using (location_id = get_my_location_id());

create policy "Managers can insert stations"
  on stations for insert
  with check (location_id = get_my_location_id() and is_manager_or_above());

create policy "Managers can update stations"
  on stations for update
  using (location_id = get_my_location_id() and is_manager_or_above());

-- ─────────────────────────────────────────────────────────────
-- CHECK SCHEDULES policies
-- ─────────────────────────────────────────────────────────────
create policy "Location members can view schedules"
  on check_schedules for select
  using (
    station_id in (select id from stations where location_id = get_my_location_id())
  );

create policy "Managers can manage schedules"
  on check_schedules for all
  using (
    station_id in (select id from stations where location_id = get_my_location_id())
    and is_manager_or_above()
  );

-- ─────────────────────────────────────────────────────────────
-- CHECK REQUESTS policies
-- ─────────────────────────────────────────────────────────────
create policy "Location members can view check requests"
  on check_requests for select
  using (
    station_id in (select id from stations where location_id = get_my_location_id())
  );

create policy "Managers can insert check requests"
  on check_requests for insert
  with check (
    station_id in (select id from stations where location_id = get_my_location_id())
    and is_manager_or_above()
  );

create policy "System can update check request status"
  on check_requests for update
  using (
    station_id in (select id from stations where location_id = get_my_location_id())
  );

-- ─────────────────────────────────────────────────────────────
-- SUBMISSIONS policies
-- ─────────────────────────────────────────────────────────────
create policy "Employees see their own submissions"
  on submissions for select
  using (employee_id = (select id from employees where user_id = auth.uid() limit 1));

create policy "Managers see all submissions for their location"
  on submissions for select
  using (
    is_manager_or_above() and
    check_request_id in (
      select cr.id from check_requests cr
      join stations s on cr.station_id = s.id
      where s.location_id = get_my_location_id()
    )
  );

create policy "Employees can insert their own submissions"
  on submissions for insert
  with check (
    employee_id = (select id from employees where user_id = auth.uid() limit 1)
  );

create policy "Managers can rate submissions"
  on submissions for update
  using (
    is_manager_or_above() and
    check_request_id in (
      select cr.id from check_requests cr
      join stations s on cr.station_id = s.id
      where s.location_id = get_my_location_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- SHIFT SCORES policies
-- ─────────────────────────────────────────────────────────────
create policy "Location members can view shift scores"
  on shift_scores for select
  using (location_id = get_my_location_id());

create policy "Employees can upsert their own shift score"
  on shift_scores for all
  using (employee_id = (select id from employees where user_id = auth.uid() limit 1));

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
-- Run this manually in the Supabase dashboard or via API:
-- create bucket "submissions" with public = true;

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', true)
on conflict do nothing;

create policy "Employees can upload to submissions"
  on storage.objects for insert
  with check (bucket_id = 'submissions' and auth.role() = 'authenticated');

create policy "Public can view submission photos"
  on storage.objects for select
  using (bucket_id = 'submissions');

-- ============================================================
-- SEED: Default location (for demo/onboarding)
-- ============================================================
-- Uncomment to insert a demo location:
-- insert into locations (id, name, address, owner_id)
-- values (uuid_generate_v4(), 'Demo Store', '123 Main St, Anytown, USA', null);
