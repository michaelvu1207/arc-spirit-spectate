grant usage on schema "arc-spirits-game-history" to service_role;

grant all on table
  "arc-spirits-game-history".play_game_sessions,
  "arc-spirits-game-history".play_session_members,
  "arc-spirits-game-history".play_game_session_events
to service_role;

grant all on all sequences in schema "arc-spirits-game-history" to service_role;
