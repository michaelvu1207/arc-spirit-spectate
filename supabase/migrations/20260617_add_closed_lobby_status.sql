-- Lobby lifecycle: add a terminal `closed` status for lobbies that are abandoned
-- (no human present) or aged out (>= 30 min old and never started). Closed rooms are
-- never listed or joinable. See src/lib/play/lobbyLifecycle.ts + server/service.ts.

-- 1. Allow `closed` in the live (history-schema) sessions table.
alter table "arc-spirits-game-history".play_game_sessions
  drop constraint if exists play_game_sessions_status_check;
alter table "arc-spirits-game-history".play_game_sessions
  add constraint play_game_sessions_status_check
  check (status in ('lobby', 'active', 'finished', 'closed'));

-- 2. Keep the legacy `arc-spirits-play` schema (created by an earlier migration but
--    unused by the app) consistent, if it exists.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'arc-spirits-play' and table_name = 'game_sessions'
  ) then
    alter table "arc-spirits-play".game_sessions
      drop constraint if exists game_sessions_status_check;
    alter table "arc-spirits-play".game_sessions
      add constraint game_sessions_status_check
      check (status in ('lobby', 'active', 'finished', 'closed'));
  end if;
end $$;

-- 3. One-time cleanup: close every lobby that has aged out (>= 30 min old, never
--    started). This reaps the backlog of stale lobbies that accumulated before the
--    lifecycle rules existed. Keep the row `status` and the embedded
--    `public_state.status` in sync so a stale client projection reads `closed` and a
--    late `startGame` cannot revive the room.
update "arc-spirits-game-history".play_game_sessions
set status = 'closed',
    ended_at = coalesce(ended_at, now()),
    revision = revision + 1,
    public_state = jsonb_set(public_state, '{status}', '"closed"'::jsonb, true)
where status = 'lobby'
  and started_at is null
  and created_at < now() - interval '30 minutes';
