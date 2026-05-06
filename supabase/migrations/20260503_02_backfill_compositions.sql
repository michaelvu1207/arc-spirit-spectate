-- Composition Analysis Rework — Phase 2
-- Backfill `compositions` from existing `composition_tag_targets` rows.
-- Idempotent — safe to re-run.

set search_path = "arc-spirits-game-history", public;

-- ----------------------------------------------------------------------------
-- 1. Insert one composition row per distinct tag string in composition_tag_targets
--    (skip the special __reference__ row — it becomes is_reference=true)
-- ----------------------------------------------------------------------------

insert into compositions (name, category, ideal_curve_points, is_reference, is_active)
select
  tag                          as name,
  category,
  ideal_points                 as ideal_curve_points,
  (tag = '__reference__')      as is_reference,
  (tag <> '__reference__')     as is_active
from composition_tag_targets
on conflict (name) do update
  set
    category           = excluded.category,
    ideal_curve_points = excluded.ideal_curve_points;

-- ----------------------------------------------------------------------------
-- 2. Insert any tags that exist in player_composition_tags but NOT in
--    composition_tag_targets (orphan tags — assign default color, no curve)
-- ----------------------------------------------------------------------------

insert into compositions (name, category, ideal_curve_points, is_reference, is_active)
select distinct
  pct.tag,
  null::text,
  null::jsonb,
  false,
  true
from player_composition_tags pct
where not exists (
  select 1 from compositions c where c.name = pct.tag
)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Populate composition_id columns by joining on name
-- ----------------------------------------------------------------------------

update composition_tag_targets t
   set composition_id = c.id
  from compositions c
 where c.name = t.tag
   and t.composition_id is distinct from c.id;

update player_composition_tags p
   set composition_id = c.id
  from compositions c
 where c.name = p.tag
   and p.composition_id is distinct from c.id;
