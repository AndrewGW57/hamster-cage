-- 2026-10-19 — Merge players: player_merges log table + merge_players() function.
-- Run in the Supabase SQL editor. Additive only: no existing table, row or function is changed.
--
-- merge_players(p_a, p_b, p_final_name, p_dry_run, p_admin) returns jsonb
--   Survivor = older created_at (tie: lower id). The other row is removed.
--   Dry run writes nothing and returns both rows, per-table counts, aliases, collisions,
--   blockers and warnings. A real run aborts on any collision or blocker, moves every
--   referencing row to the survivor, logs to player_merges, and returns the result.
--   Callable by service_role only.

begin;

-- ---------------------------------------------------------------------
-- Merge log — enough to reverse a bad merge by hand
-- ---------------------------------------------------------------------
create table if not exists public.player_merges (
  id uuid primary key default gen_random_uuid(),
  merged_at timestamptz not null default now(),
  admin_username text not null,
  survivor_id uuid not null,        -- deliberately not FKs: the log outlives later deletes
  removed_id uuid not null,
  final_name text not null,
  survivor_before jsonb not null,   -- players row + aliases, before the merge
  removed_before jsonb not null,    -- players row + aliases, before the merge
  moved jsonb not null,             -- ids of every row repointed, per table
  result jsonb not null
);

alter table public.player_merges enable row level security;
-- No policies: service role only.
revoke all on public.player_merges from anon, authenticated;

-- ---------------------------------------------------------------------
-- merge_players
-- ---------------------------------------------------------------------
create or replace function public.merge_players(
  p_a uuid,
  p_b uuid,
  p_final_name text,
  p_dry_run boolean,
  p_admin text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_keep players%rowtype;
  v_drop players%rowtype;
  v_n int;
  v_unknown text;
  v_final text;
  v_keep_before jsonb;
  v_drop_before jsonb;
  v_counts jsonb;
  v_collisions jsonb;
  v_alias_conflicts jsonb;
  v_name_conflicts jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_can_merge boolean;
  v_moved jsonb;
  v_new_alias text;
  v_alias_added boolean := false;
  v_name text;
  v_merge_id uuid;
  v_result jsonb;
begin
  -- A null p_dry_run must never fall through to a real merge
  if p_dry_run is null then
    raise exception 'merge_players: p_dry_run must be true or false';
  end if;
  if p_a is null or p_b is null then
    raise exception 'merge_players: both player ids are required';
  end if;
  if p_a = p_b then
    raise exception 'merge_players: cannot merge a player with itself';
  end if;

  -- Lock both rows, in id order so two concurrent merges cannot deadlock
  select count(*) into v_n
  from (select id from players where id in (p_a, p_b) order by id for update) locked;
  if v_n <> 2 then
    raise exception 'merge_players: one or both players not found';
  end if;

  -- Refuse if anything other than the four known tables references players
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    into v_unknown
  from pg_constraint c
  where c.contype = 'f'
    and c.confrelid = 'public.players'::regclass
    and c.conrelid not in ('public.player_aliases'::regclass, 'public.results'::regclass,
                           'public.side_contests'::regclass, 'public.bonus_points'::regclass);
  if v_unknown is not null then
    raise exception 'merge_players: unhandled foreign key(s) to players: %', v_unknown;
  end if;

  -- Survivor is the older row
  select * into v_keep from players where id in (p_a, p_b) order by created_at, id limit 1;
  select * into v_drop from players where id in (p_a, p_b) and id <> v_keep.id;

  -- Final name: must be one of the two names, case-insensitive (matches rename-player).
  -- Exact spelling wins first, so two names differing only in case stay distinguishable.
  v_final := nullif(regexp_replace(btrim(coalesce(p_final_name, '')), '\s+', ' ', 'g'), '');
  if v_final is not null then
    if v_final = v_keep.display_name then
      v_final := v_keep.display_name;
    elsif v_final = v_drop.display_name then
      v_final := v_drop.display_name;
    elsif lower(v_final) = lower(v_keep.display_name) then
      v_final := v_keep.display_name;
    elsif lower(v_final) = lower(v_drop.display_name) then
      v_final := v_drop.display_name;
    else
      raise exception 'merge_players: final name must be "%" or "%"', v_keep.display_name, v_drop.display_name;
    end if;
  elsif not p_dry_run then
    raise exception 'merge_players: final name is required';
  end if;

  v_keep_before := to_jsonb(v_keep) || jsonb_build_object('aliases',
    (select coalesce(jsonb_agg(alias order by alias), '[]'::jsonb) from player_aliases where player_id = v_keep.id));
  v_drop_before := to_jsonb(v_drop) || jsonb_build_object('aliases',
    (select coalesce(jsonb_agg(alias order by alias), '[]'::jsonb) from player_aliases where player_id = v_drop.id));

  v_counts := jsonb_build_object(
    'survivor', jsonb_build_object(
      'results',        (select count(*) from results        where player_id = v_keep.id),
      'bonus_points',   (select count(*) from bonus_points   where player_id = v_keep.id),
      'side_contests',  (select count(*) from side_contests  where player_id = v_keep.id),
      'player_aliases', (select count(*) from player_aliases where player_id = v_keep.id)),
    'removed', jsonb_build_object(
      'results',        (select count(*) from results        where player_id = v_drop.id),
      'bonus_points',   (select count(*) from bonus_points   where player_id = v_drop.id),
      'side_contests',  (select count(*) from side_contests  where player_id = v_drop.id),
      'player_aliases', (select count(*) from player_aliases where player_id = v_drop.id)));

  -- Collisions: any week where both players have a row in the same table
  select coalesce(jsonb_agg(jsonb_build_object(
           'table', x.tbl, 'week_id', x.week_id, 'cohort', c.name,
           'week_number', w.week_number, 'date', w.date, 'course', w.course_name)
           order by w.date, x.tbl), '[]'::jsonb)
    into v_collisions
  from (
    (select 'results' as tbl, week_id from results where player_id = v_keep.id
     intersect
     select 'results', week_id from results where player_id = v_drop.id)
    union all
    (select 'bonus_points', week_id from bonus_points where player_id = v_keep.id
     intersect
     select 'bonus_points', week_id from bonus_points where player_id = v_drop.id)
    union all
    (select 'side_contests', week_id from side_contests where player_id = v_keep.id
     intersect
     select 'side_contests', week_id from side_contests where player_id = v_drop.id)
  ) x
  join weeks w on w.id = x.week_id
  left join cohorts c on c.id = w.cohort_id;

  -- Blockers: a third player owns either name, as an alias or as a display name
  select coalesce(jsonb_agg(jsonb_build_object('alias', a.alias, 'owner', p.display_name, 'owner_id', p.id)), '[]'::jsonb)
    into v_alias_conflicts
  from player_aliases a
  join players p on p.id = a.player_id
  where a.player_id not in (v_keep.id, v_drop.id)
    and lower(a.alias) in (lower(v_keep.display_name), lower(v_drop.display_name));

  select coalesce(jsonb_agg(jsonb_build_object('display_name', p.display_name, 'id', p.id)), '[]'::jsonb)
    into v_name_conflicts
  from players p
  where p.id not in (v_keep.id, v_drop.id)
    and lower(p.display_name) in (lower(v_keep.display_name), lower(v_drop.display_name));

  -- Warnings only: the survivor's value is kept
  if v_keep.country_code is not null and v_drop.country_code is not null
     and lower(v_keep.country_code) <> lower(v_drop.country_code) then
    v_warnings := v_warnings || jsonb_build_object('field', 'country_code',
      'survivor', v_keep.country_code, 'removed', v_drop.country_code);
  end if;
  if v_keep.ld_handicap_yards <> v_drop.ld_handicap_yards then
    v_warnings := v_warnings || jsonb_build_object('field', 'ld_handicap_yards',
      'survivor', v_keep.ld_handicap_yards, 'removed', v_drop.ld_handicap_yards);
  end if;

  v_can_merge := jsonb_array_length(v_collisions) = 0
             and jsonb_array_length(v_alias_conflicts) = 0
             and jsonb_array_length(v_name_conflicts) = 0;

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'survivor', v_keep_before,
      'removed', v_drop_before,
      'final_name', v_final,
      'counts', v_counts,
      'collisions', v_collisions,
      'alias_conflicts', v_alias_conflicts,
      'name_conflicts', v_name_conflicts,
      'warnings', v_warnings,
      'can_merge', v_can_merge);
  end if;

  -- ---------------- real run ----------------
  if nullif(btrim(coalesce(p_admin, '')), '') is null then
    raise exception 'merge_players: admin username is required';
  end if;
  if jsonb_array_length(v_collisions) > 0 then
    raise exception 'merge_players: % collision(s) — both players have rows in the same week', jsonb_array_length(v_collisions);
  end if;
  if jsonb_array_length(v_alias_conflicts) > 0 or jsonb_array_length(v_name_conflicts) > 0 then
    raise exception 'merge_players: another player already owns one of these names';
  end if;

  v_moved := jsonb_build_object(
    'results',        (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from results       where player_id = v_drop.id),
    'bonus_points',   (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from bonus_points  where player_id = v_drop.id),
    'side_contests',  (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from side_contests where player_id = v_drop.id),
    'player_aliases', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'alias', alias) order by alias), '[]'::jsonb)
                       from player_aliases where player_id = v_drop.id));

  update results       set player_id = v_keep.id where player_id = v_drop.id;
  update bonus_points  set player_id = v_keep.id where player_id = v_drop.id;
  update side_contests set player_id = v_keep.id where player_id = v_drop.id;

  -- Aliases: drop the removed player's case-insensitive duplicates, move the rest
  delete from player_aliases a
  where a.player_id = v_drop.id
    and exists (select 1 from player_aliases k
                where k.player_id = v_keep.id and lower(k.alias) = lower(a.alias));
  update player_aliases set player_id = v_keep.id where player_id = v_drop.id;

  -- Exactly one new alias: the original name that is not the final display name
  v_new_alias := case when v_final = v_keep.display_name then v_drop.display_name else v_keep.display_name end;
  if not exists (select 1 from player_aliases
                 where player_id = v_keep.id and lower(alias) = lower(v_new_alias)) then
    insert into player_aliases (player_id, alias) values (v_keep.id, v_new_alias);
    v_alias_added := true;
  end if;

  -- Nothing may still reference the removed row before it goes (FKs cascade)
  if exists (select 1 from results        where player_id = v_drop.id)
     or exists (select 1 from bonus_points   where player_id = v_drop.id)
     or exists (select 1 from side_contests  where player_id = v_drop.id)
     or exists (select 1 from player_aliases where player_id = v_drop.id) then
    raise exception 'merge_players: rows still reference the removed player; aborting';
  end if;

  delete from players where id = v_drop.id;

  -- Rename only after the delete (display_name is unique). Country copied only if survivor's is null.
  update players
     set display_name = v_final,
         country_code = coalesce(country_code, v_drop.country_code)
   where id = v_keep.id;

  -- Both original names must now resolve to the survivor, the way lib/match-player.ts
  -- resolves them: case-insensitive display_name first, then case-insensitive alias.
  foreach v_name in array array[v_keep.display_name, v_drop.display_name] loop
    if exists (select 1 from players where lower(display_name) = lower(v_name) and id <> v_keep.id)
       or exists (select 1 from player_aliases where lower(alias) = lower(v_name) and player_id <> v_keep.id)
       or not (exists (select 1 from players where id = v_keep.id and lower(display_name) = lower(v_name))
               or exists (select 1 from player_aliases where player_id = v_keep.id and lower(alias) = lower(v_name))) then
      raise exception 'merge_players: "%" does not resolve to the survivor after merge; aborting', v_name;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'dry_run', false,
    'survivor', (select to_jsonb(p) from players p where p.id = v_keep.id)
                || jsonb_build_object('aliases',
                   (select coalesce(jsonb_agg(alias order by alias), '[]'::jsonb) from player_aliases where player_id = v_keep.id)),
    'removed_id', v_drop.id,
    'alias_added', case when v_alias_added then v_new_alias end,
    'moved_counts', jsonb_build_object(
      'results',        jsonb_array_length(v_moved->'results'),
      'bonus_points',   jsonb_array_length(v_moved->'bonus_points'),
      'side_contests',  jsonb_array_length(v_moved->'side_contests'),
      'player_aliases', jsonb_array_length(v_moved->'player_aliases')),
    'warnings', v_warnings);

  insert into player_merges (admin_username, survivor_id, removed_id, final_name,
                             survivor_before, removed_before, moved, result)
  values (btrim(p_admin), v_keep.id, v_drop.id, v_final,
          v_keep_before, v_drop_before, v_moved, v_result)
  returning id into v_merge_id;

  return v_result || jsonb_build_object('merge_id', v_merge_id);
end;
$$;

-- Supabase grants execute on new public functions to anon/authenticated by default,
-- so revoke from them explicitly, not just from public.
revoke all on function public.merge_players(uuid, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.merge_players(uuid, uuid, text, boolean, text) to service_role;

commit;

-- Make the new function visible to the REST API immediately
notify pgrst, 'reload schema';
