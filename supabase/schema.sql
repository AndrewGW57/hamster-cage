-- Hamster Cage Order of Merit — Supabase Schema
-- Run this in the Supabase SQL editor before first use.
--
-- =====================================================================
-- APPLIED MIGRATIONS (ALTER statements run against the live database)
-- The CREATE TABLE statements below reflect current target state.
-- =====================================================================
-- 2026-05-06  alter table results add column if not exists ineligible_for_bonus boolean not null default false;
-- 2026-05-27  alter table results alter column position drop not null;
-- 2026-05-27  alter table results alter column score_vs_par drop not null;
-- 2026-05-27  alter table results add column if not exists created_at timestamptz not null default now();
--             (created_at was in initial schema.sql but absent from live table; backfill sets now() for existing rows)
-- 2026-06-04  players_display_name_key confirmed present in live DB (btree unique index on display_name).
--             Constraint predates this schema file — origin unknown. Added unique to CREATE TABLE below to
--             match live state. No migration needed; constraint already exists in all environments.
-- 2026-06-17  alter table weeks drop constraint weeks_week_number_key;
--             alter table weeks add constraint weeks_cohort_week_number_unique unique (cohort_id, week_number);
-- 2026-08-12  alter table weeks add column if not exists is_bye boolean not null default false;
--             update weeks set is_bye = true where id = 'a03d393a-19fd-4340-a0d0-ae86d022b26e';
--             (Summer 2026 Week 5, Wentworth West, 2026-07-22 — Trackman malfunction forced a full
--              replay, so zero scores were recorded. The week is voided for every player, not skipped.)
-- 2026-09-03  alter table bonus_points drop constraint bonus_points_bonus_type_check;
--             alter table bonus_points add constraint bonus_points_bonus_type_check
--               check (bonus_type in ('ctp', 'ld', 'top10', 'winner'));
--             ('winner' = Weekly Stableford winner bonus: 1 point, 2 on Curveball weeks 3/6/9/12.
--              Max 40, Curveball Weeks, and Wooden Spoon are otherwise computed at read time —
--              see lib/rules.ts and lib/weekly-winner.ts — and need no other schema change.)
-- =====================================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  country_code text,                -- ISO 3166-1 alpha-2, e.g. 'gb', 'ae'
  created_at timestamptz not null default now()
);

-- Player aliases (alternate name spellings as returned by Trackman)
create table if not exists player_aliases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  alias text not null,
  unique (player_id, alias)
);

-- Weeks (one row per round played)
-- NOTE: cohort_id and the (cohort_id, week_number) unique constraint are added in the
-- "Cohort migration" section below — cohorts does not exist yet at this point in the file.
create table if not exists weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer not null,
  course_name text not null,
  date date not null,
  -- A bye week: scheduled and numbered, but voided for every player (e.g. a Trackman
  -- malfunction forcing a full replay). Treated as COMPLETE, never as upcoming.
  is_bye boolean not null default false,
  created_at timestamptz not null default now()
);

-- Results (player score per week)
create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  stableford_score integer not null,
  score_vs_par integer,
  position integer,
  ineligible_for_bonus boolean not null default false,
  created_at timestamptz not null default now(),
  unique (week_id, player_id)
);

-- Side contests (CTP and LD winners per week)
create table if not exists side_contests (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  contest text not null check (contest in ('ctp', 'ld')),
  hole integer,
  measurement text,
  created_at timestamptz not null default now()
);

-- Uploads (tracks which screenshots have been processed)
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  image_type text not null check (image_type in ('leaderboard', 'ctp', 'ld')),
  storage_path text not null,
  confirmed boolean not null default false,
  parsed_json jsonb,           -- full Claude Vision parse result (ctp/ld only)
  created_at timestamptz not null default now()
);
-- Migration for existing databases:
-- alter table uploads add column if not exists parsed_json jsonb;

-- order_of_merit view removed 2026-05-06 — home page now uses getCohortLeaderboard()
-- Run in Supabase SQL editor to clean up: drop view if exists order_of_merit;

-- Row Level Security
alter table players enable row level security;
alter table player_aliases enable row level security;
alter table weeks enable row level security;
alter table results enable row level security;
alter table side_contests enable row level security;
alter table uploads enable row level security;

-- Public read policies
create policy "Public read players" on players for select using (true);
create policy "Public read weeks" on weeks for select using (true);
create policy "Public read results" on results for select using (true);
create policy "Public read side_contests" on side_contests for select using (true);
create policy "Public read player_aliases" on player_aliases for select using (true);

-- Service role bypasses RLS — no write policies needed for anon.

-- =====================================================================
-- Cohort migration (added 2026-05-06)
-- =====================================================================

create table cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  scores_to_count int not null default 3,
  created_at timestamptz default now()
);

alter table weeks add column cohort_id uuid references cohorts(id);

-- Week numbers are unique per cohort, not globally (replaced weeks_week_number_key 2026-06-17).
-- Must come after cohort_id exists — see the note on create table weeks above.
alter table weeks add constraint weeks_cohort_week_number_unique unique (cohort_id, week_number);

alter table players add column ld_handicap_yards int not null default 0;

create table bonus_points (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  cohort_id uuid not null references cohorts(id) on delete cascade,
  bonus_type text not null check (bonus_type in ('ctp', 'ld', 'top10', 'winner')),
  points int not null default 0,
  unique(week_id, player_id, bonus_type)
);

-- Seed Cohort 1 with all existing weeks
insert into cohorts (id, name, status, scores_to_count)
values ('00000000-0000-0000-0000-000000000001', 'Spring 2026', 'closed', 13);

update weeks set cohort_id = '00000000-0000-0000-0000-000000000001';

-- Seed Cohort 2
insert into cohorts (id, name, status, scores_to_count)
values ('00000000-0000-0000-0000-000000000002', 'May-June 2026', 'active', 3);

-- RLS for new tables
alter table cohorts enable row level security;
alter table bonus_points enable row level security;

create policy "Public read cohorts" on cohorts for select using (true);
create policy "Public read bonus_points" on bonus_points for select using (true);

-- 2026-05-06 — admins table (run before seed script)
-- create table if not exists admins (
--   id uuid primary key default gen_random_uuid(),
--   username text not null unique,
--   password_hash text not null,
--   created_at timestamptz default now()
-- );

-- 2026-05-06 — add min_rounds_to_rank and total_weeks to cohorts
-- Run in Supabase SQL editor:
-- alter table cohorts add column if not exists min_rounds_to_rank int not null default 1;
-- alter table cohorts add column if not exists total_weeks int not null default 0;
-- alter table cohorts add column if not exists weeks_per_tab int not null default 5;

-- 2026-05-06 — site_content table for admin-editable page content
-- Run in Supabase SQL editor:
-- create table if not exists site_content (
--   key text primary key,
--   value text not null,
--   updated_at timestamptz default now()
-- );
-- alter table site_content enable row level security;
-- create policy "Public read site_content" on site_content for select using (true);
-- insert into site_content (key, value) values ('rules_notes', 'Additional notes go here.')
--   on conflict (key) do nothing;

-- 2026-05-06 — ineligible_for_bonus flag on results (per-week afternoon-session players)
-- Run in Supabase SQL editor:
-- alter table results add column if not exists ineligible_for_bonus boolean not null default false;

-- 2026-05-27 — allow null position and score_vs_par on results (DNF players score 0 with null position/vs-par)
-- Run in Supabase SQL editor:
alter table results alter column position drop not null;
alter table results alter column score_vs_par drop not null;

-- 2026-08-12 — bye weeks (voided rounds that must not read as "upcoming")
-- Run in Supabase SQL editor:
alter table weeks add column if not exists is_bye boolean not null default false;

-- 2026-09-03 — 'winner' bonus_type (Weekly Stableford winner bonus, part of the Max 40 /
-- Curveball Weeks / Wooden Spoon rule set). Run in Supabase SQL editor:
alter table bonus_points drop constraint if exists bonus_points_bonus_type_check;
alter table bonus_points add constraint bonus_points_bonus_type_check
  check (bonus_type in ('ctp', 'ld', 'top10', 'winner'));

-- Summer 2026 (a9fba9af-fd55-4381-a7c2-65d961bcd46b) Week 5 — Wentworth West, 2026-07-22.
-- Trackman malfunction forced a full replay; zero scores recorded for anyone.
update weeks set is_bye = true where id = 'a03d393a-19fd-4340-a0d0-ae86d022b26e';
