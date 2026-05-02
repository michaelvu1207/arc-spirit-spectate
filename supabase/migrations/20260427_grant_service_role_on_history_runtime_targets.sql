grant usage on schema "arc-spirits-game-history" to service_role;

grant all on table
  "arc-spirits-game-history".game_state_snapshots,
  "arc-spirits-game-history".replay_codes
to service_role;

grant all on all sequences in schema "arc-spirits-game-history" to service_role;
