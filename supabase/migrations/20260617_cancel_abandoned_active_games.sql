-- One-time cleanup: cancel abandoned in-progress games. An `active` game never
-- reaches `finished` unless someone wins, so a game everyone walked away from would
-- otherwise linger as "live" forever. Going forward this is enforced continuously by
-- closeAbandonedRooms() (see src/lib/play/server/service.ts); this reaps the backlog.
--
-- Cancel only games with NO human (non-bot) member seen in the last 5 minutes — a
-- deliberately conservative cutoff (the live policy uses 2 min) so an in-progress
-- game with anyone currently present is never touched. Bots never count as presence.
update "arc-spirits-game-history".play_game_sessions s
set status = 'closed',
    ended_at = coalesce(s.ended_at, now()),
    revision = s.revision + 1,
    public_state = jsonb_set(s.public_state, '{status}', '"closed"'::jsonb, true)
where s.status = 'active'
  and not exists (
    select 1
    from "arc-spirits-game-history".play_session_members m
    where m.session_id = s.id
      and m.display_name not like '🤖 %'
      and m.last_seen_at >= now() - interval '5 minutes'
  );
