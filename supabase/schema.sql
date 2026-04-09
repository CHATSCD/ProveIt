-- ProveIt Database Schema
-- Run this in the Supabase SQL Editor

create extension if not exists "uuid-ossp";

create table if not exists locations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  address    text,
  owner_id   uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists employees (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references auth.users(id) unique not null,
  location_id  uuid references locations(id) on delete cascade,
  display_name text not null,
  role         text not null check (role in ('owner', 'manager', 'employee')),
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create table if not exists stations (
  id            uuid primary key default uuid_generate_v4(),
  location_id   uuid references locations(id) on delete cascade not null,
  name          text not null,
  qr_code_token text unique not null,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table if not exists check_schedules (
  id                        uuid primary key default uuid_generate_v4(),
  station_id                uuid references stations(id) on delete cascade not null,
  type                      text not null check (type in ('scheduled', 'random', 'manual')),
  interval_minutes          int,
  active_start_time         time,
  active_end_time           time,
  window_start              time,
  window_end                time,
  min_gap_minutes           int,
  submission_window_minutes int default 15,
  created_at                timestamptz default now()
);

create table if not exists check_requests (
  id           uuid primary key default uuid_generate_v4(),
  station_id   uuid references stations(id) on delete cascade not null,
  schedule_id  uuid references check_schedules(id),
  triggered_at timestamptz default now(),
  expires_at   timestamptz not null,
  trigger_type text not null check (trigger_type in ('scheduled', 'random', 'manual')),
  triggered_by uuid references auth.users(id),
  status       text default 'pending' check (status in ('pending', 'submitted', 'missed'))
);

create index if not exists idx_check_requests_station on check_requests(station_id, status);
create index if not exists idx_check_requests_expires on check_requests(expires_at);

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
  rated_at timestamptz,
  rated_by uuid references auth.users(id)
);

create index if not exists idx_submissions_employee on submissions(employee_id);
create index if not exists idx_submissions_rated on submissions(rated_at) where rated_at is null;

create table if not exists shift_scores (
  id            uuid primary key default uuid_generate_v4(),
  employee_id   uuid references employees(id) on delete cascade not null,
  location_id   uuid references locations(id) on delete cascade not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  total_points  int default 0,
  on_time_count int default 0,
  late_count    int default 0,
  missed_count  int default 0,
  avg_rating    float default 0,
  score_rank    int,
  created_at    timestamptz default now(),
  unique(employee_id, location_id, period_start)
);

-- Row Level Security

alter table locations       enable row level security;
alter table employees       enable row level security;
alter table stations        enable row level security;
alter table check_schedules enable row level security;
alter table check_requests  enable row level security;
alter table submissions     enable row level security;
alter table shift_scores    enable row level security;

-- Helper functions

create or replace function get_my_location_id()
returns uuid language sql stable as $$
  select location_id from employees
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function is_manager_or_above()
returns boolean language sql stable as $$
  select exists (
    select 1 from employees
    where user_id = auth.uid()
    and is_active = true
    and role in ('manager', 'owner')
  );
$$;

-- Policies: locations

create policy "loc_select"
  on locations for select
  using (id = get_my_location_id());

create policy "loc_insert"
  on locations for insert
  with check (auth.uid() = owner_id);

create policy "loc_update"
  on locations for update
  using (auth.uid() = owner_id);

-- Policies: employees

create policy "emp_select_own"
  on employees for select
  using (user_id = auth.uid());

create policy "emp_select_colleagues"
  on employees for select
  using (location_id = get_my_location_id());

create policy "emp_insert"
  on employees for insert
  with check (user_id = auth.uid());

create policy "emp_update"
  on employees for update
  using (location_id = get_my_location_id() and is_manager_or_above());

-- Policies: stations

create policy "sta_select"
  on stations for select
  using (location_id = get_my_location_id());

create policy "sta_insert"
  on stations for insert
  with check (location_id = get_my_location_id() and is_manager_or_above());

create policy "sta_update"
  on stations for update
  using (location_id = get_my_location_id() and is_manager_or_above());

-- Policies: check_schedules

create policy "sch_select"
  on check_schedules for select
  using (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
  );

create policy "sch_insert"
  on check_schedules for insert
  with check (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
    and is_manager_or_above()
  );

create policy "sch_update"
  on check_schedules for update
  using (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
    and is_manager_or_above()
  );

create policy "sch_delete"
  on check_schedules for delete
  using (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
    and is_manager_or_above()
  );

-- Policies: check_requests

create policy "cr_select"
  on check_requests for select
  using (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
  );

create policy "cr_insert"
  on check_requests for insert
  with check (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
    and is_manager_or_above()
  );

create policy "cr_update"
  on check_requests for update
  using (
    station_id in (
      select id from stations where location_id = get_my_location_id()
    )
  );

-- Policies: submissions

create policy "sub_select_own"
  on submissions for select
  using (
    employee_id = (
      select id from employees where user_id = auth.uid() limit 1
    )
  );

create policy "sub_select_manager"
  on submissions for select
  using (
    is_manager_or_above()
    and check_request_id in (
      select id from check_requests
      where station_id in (
        select id from stations where location_id = get_my_location_id()
      )
    )
  );

create policy "sub_insert"
  on submissions for insert
  with check (
    employee_id = (
      select id from employees where user_id = auth.uid() limit 1
    )
  );

create policy "sub_update"
  on submissions for update
  using (
    is_manager_or_above()
    and check_request_id in (
      select id from check_requests
      where station_id in (
        select id from stations where location_id = get_my_location_id()
      )
    )
  );

-- Policies: shift_scores

create policy "ss_select"
  on shift_scores for select
  using (location_id = get_my_location_id());

create policy "ss_insert"
  on shift_scores for insert
  with check (
    employee_id = (
      select id from employees where user_id = auth.uid() limit 1
    )
  );

create policy "ss_update"
  on shift_scores for update
  using (
    employee_id = (
      select id from employees where user_id = auth.uid() limit 1
    )
  );

-- Storage bucket for submission photos

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', true)
on conflict do nothing;

create policy "storage_insert"
  on storage.objects for insert
  with check (bucket_id = 'submissions' and auth.role() = 'authenticated');

create policy "storage_select"
  on storage.objects for select
  using (bucket_id = 'submissions');
