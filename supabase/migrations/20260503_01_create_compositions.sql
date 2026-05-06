-- Composition Analysis Rework — Phase 1
-- Promote `composition` to a first-class entity with FK from existing tag tables.
-- See docs/composition-analysis-design.md for the full plan.
--
-- Phase 1 is forward-compatible: adds new table + nullable FK columns. Old code
-- that reads/writes the legacy `tag` string keeps working.

set search_path = "arc-spirits-game-history", public;

-- ----------------------------------------------------------------------------
-- 1. compositions table
-- ----------------------------------------------------------------------------

create table if not exists compositions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        text,
  color           text not null default '#24d4ff',
  ideal_curve_points jsonb,            -- nullable; null = no ideal curve defined
  description     text,
  is_reference    boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint compositions_name_unique unique (name),
  constraint compositions_color_hex   check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint compositions_name_len    check (char_length(name) between 1 and 64),
  constraint compositions_category_len check (category is null or char_length(category) <= 64),
  constraint compositions_description_len check (description is null or char_length(description) <= 500)
);

create index if not exists compositions_category_idx on compositions (category) where category is not null;
create index if not exists compositions_active_idx   on compositions (is_active);

-- ----------------------------------------------------------------------------
-- 2. Add composition_id FK columns to existing tag tables (NULLABLE for now)
-- ----------------------------------------------------------------------------

alter table composition_tag_targets
  add column if not exists composition_id uuid references compositions(id) on delete restrict;

alter table player_composition_tags
  add column if not exists composition_id uuid references compositions(id) on delete restrict;

create index if not exists composition_tag_targets_composition_id_idx
  on composition_tag_targets (composition_id);

create index if not exists player_composition_tags_composition_id_idx
  on player_composition_tags (composition_id);

-- Verify the (game_id, player_color) composite index exists; create if missing.
create index if not exists player_composition_tags_game_player_idx
  on player_composition_tags (game_id, player_color);

-- ----------------------------------------------------------------------------
-- 3. Service-role grants (mirrors pattern from 20260427_grant_*)
-- ----------------------------------------------------------------------------

grant all on table compositions to service_role;
grant select on table compositions to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger
-- ----------------------------------------------------------------------------

create or replace function compositions_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists compositions_updated_at on compositions;
create trigger compositions_updated_at
  before update on compositions
  for each row execute function compositions_set_updated_at();
