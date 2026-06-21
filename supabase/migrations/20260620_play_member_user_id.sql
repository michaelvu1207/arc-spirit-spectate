-- Account ownership of play participation: stamp the authenticated user's id onto
-- their session member row, so a signed-in player's games are attributable to their
-- account rather than a spoofable display name. Nullable (guests have none); SET NULL
-- on user delete so historical rows survive account deletion.
alter table "arc-spirits-game-history".play_session_members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists play_session_members_user_id_idx
  on "arc-spirits-game-history".play_session_members (user_id);
