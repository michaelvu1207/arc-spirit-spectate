-- Move bot identity + bot strategy OFF the display name onto explicit columns, so a
-- matchmaking bot can carry a human-looking name (and a real user_id, appearing on the
-- leaderboard + affecting ratings) while still being driven by the bot engine.
--
--  * is_bot      — the authoritative "this member is a bot" flag. Replaces the legacy
--                  "🤖 " display-name prefix heuristic for presence/abandonment, bot
--                  driving, and ranked result flagging. Defaults false (humans).
--  * bot_profile — the BOT_PROFILES difficulty/strategy key driving this bot (e.g.
--                  'medium', 'hard'). NULL for humans. Replaces parsing the difficulty
--                  word out of the display name.
--
-- Idempotent (safe to re-run): all adds are `if not exists`.
alter table arc_spirits_2d.play_session_members
  add column if not exists is_bot boolean not null default false;

alter table arc_spirits_2d.play_session_members
  add column if not exists bot_profile text;

-- Bots are looked up per-session by this flag (botSim.loadBotMembers); a partial index
-- keeps that scan cheap without bloating the much larger human-member population.
create index if not exists play_session_members_session_bot_idx
  on arc_spirits_2d.play_session_members (session_id)
  where is_bot;
