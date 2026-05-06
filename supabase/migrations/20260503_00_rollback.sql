-- Composition Analysis Rework — ROLLBACK for migrations 20260503_01 + _02 + _03 + _04.
-- Apply ONLY if Phase 1 needs to be reversed during the dual-write soak window.
-- Forward-compatible: legacy `tag` string columns and existing data are NOT touched.
--
-- This file is provided as documentation/safety. Run manually via Supabase SQL editor
-- if rollback becomes necessary. Do NOT add to the regular migration sequence.
--
-- After rollback:
--   - composition_id columns are dropped from both tag tables
--   - compositions table is dropped (data lost — tags survive in legacy `tag` column)
--   - games-summary + untagged-queue views are dropped
--   - Old code that reads/writes only the legacy `tag` column resumes working

set search_path = "arc-spirits-game-history", public;

-- 1. Drop dependent views first
drop view if exists untagged_player_games;
drop view if exists composition_games_summary;

-- 2. Drop FK columns (no data loss — tag string column is the original source of truth)
alter table player_composition_tags drop column if exists composition_id;
alter table composition_tag_targets drop column if exists composition_id;

-- 3. Drop trigger + function
drop trigger if exists compositions_updated_at on compositions;
drop function if exists compositions_set_updated_at();

-- 4. Drop the new table (curve metadata in compositions is LOST; ideal_points still
--    exist on composition_tag_targets, so curves are recoverable that way)
drop table if exists compositions;
