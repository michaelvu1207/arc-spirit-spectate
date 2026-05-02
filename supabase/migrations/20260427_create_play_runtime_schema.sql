create schema if not exists "arc-spirits-play";

create table if not exists "arc-spirits-play".game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  game_id text unique,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  revision integer not null default 0,
  scenario jsonb,
  public_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists "arc-spirits-play".session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references "arc-spirits-play".game_sessions (id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('host', 'player', 'spectator')),
  seat_color text,
  selected_guardian text,
  private_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, id)
);

create table if not exists "arc-spirits-play".game_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references "arc-spirits-play".game_sessions (id) on delete cascade,
  revision integer not null,
  actor_member_id uuid references "arc-spirits-play".session_members (id) on delete set null,
  command_type text not null,
  command_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists play_game_sessions_room_code_idx
  on "arc-spirits-play".game_sessions (room_code);

create index if not exists play_game_sessions_status_idx
  on "arc-spirits-play".game_sessions (status, updated_at desc);

create index if not exists play_session_members_session_idx
  on "arc-spirits-play".session_members (session_id, joined_at asc);

create index if not exists play_session_members_session_seat_idx
  on "arc-spirits-play".session_members (session_id, seat_color);

create index if not exists play_game_session_events_session_revision_idx
  on "arc-spirits-play".game_session_events (session_id, revision asc);

create or replace function "arc-spirits-play".touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_sessions_touch_updated_at
  on "arc-spirits-play".game_sessions;

create trigger game_sessions_touch_updated_at
before update on "arc-spirits-play".game_sessions
for each row
execute function "arc-spirits-play".touch_updated_at();

drop trigger if exists session_members_touch_updated_at
  on "arc-spirits-play".session_members;

create trigger session_members_touch_updated_at
before update on "arc-spirits-play".session_members
for each row
execute function "arc-spirits-play".touch_updated_at();

alter table "arc-spirits-play".game_sessions enable row level security;
alter table "arc-spirits-play".session_members enable row level security;
alter table "arc-spirits-play".game_session_events enable row level security;
