-- 2026-11-12 — results.gross_score: gross strokes for the round, for the Max 40 tiebreak.
-- Run in the Supabase SQL editor.
--
-- From weeks.date >= 2026-11-11, when two or more bonus-eligible players score 40+ raw
-- Stableford points in a week, the lowest gross score wins (see lib/weekly-winner.ts).
-- score_vs_par cannot be used for this: it is Stableford points minus 36, not strokes.
-- Entered by hand on the admin review screen, only for players in a 40+ group, so the
-- column is nullable and stays null for every other row and for all past weeks.
--
-- merge_players() moves results rows with `update ... set player_id`, so the new column
-- travels with them and the function needs no change.

alter table public.results add column if not exists gross_score integer null;
