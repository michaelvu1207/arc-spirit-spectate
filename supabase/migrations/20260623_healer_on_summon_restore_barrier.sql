-- The Healer ability lives on the class EFFECT LINE (effect_schema), which is the source
-- of truth and is implemented in code (src/lib/play/effects/classes/healer.ts):
--   • onSpiritSummon → restore 2 barrier (scoped to the summoned spirit in runtime.ts)
--   • onRest → at 10 max barrier, opt-in to restore 3 barrier + gain 1 VP
-- Set the effect line to describe that full kit in current terminology (dropping the stale
-- pre-rename "potential/health" wording and the bogus translation strings).
UPDATE arc_spirits_assets.classes
SET effect_schema = '[{"color":"bronze","count":1,"effects":[{"type":"benefit","description":"When summoned, restore 2 barrier. On rest, if you have 10 max barrier, you may restore 3 barrier and gain 1 VP."}]}]'::jsonb
WHERE name = 'Healer';
