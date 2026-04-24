import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { rate, rating } from "https://esm.sh/openskill@4.1.0?target=deno";

const SCHEMA = "arc-spirits-game-history";

type GameResultRow = {
  game_id: string;
  started_at: string | null;
  ended_at: string | null;
  navigation_count: number;
  player_color: string;
  username: string | null;
  raw_username: string | null;
  selected_character: string;
  victory_points: number;
  player_count: number;
};

type MatchPlayer = {
  playerColor: string;
  username: string;
  usernameKey: string;
  rawUsername: string | null;
  selectedCharacter: string;
  victoryPoints: number;
  placement: number;
};

type MatchParticipant = {
  playerColor: string;
  username: string | null;
  usernameKey: string | null;
  rawUsername: string | null;
  selectedCharacter: string;
  victoryPoints: number;
  placement: number;
};

type Match = {
  gameId: string;
  startedAt: string | null;
  endedAt: string | null;
  navigationCount: number;
  playerCountExpected: number;
  playerCountActual: number;
  isValid: boolean;
  invalidReason: string | null;
  participants: MatchParticipant[];
  players: MatchPlayer[];
};

function jsonResponse(
  body: unknown,
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...(init?.headers ?? {}),
    },
  });
}

function getDbUrl(): string | null {
  return Deno.env.get("SUPABASE_DB_URL") ??
    Deno.env.get("SUPABASE_DB_CONNECTION_STRING") ??
    Deno.env.get("DATABASE_URL") ??
    null;
}

function usernameKey(username: string): string {
  return username.trim().toLowerCase();
}

function groupByGame(rows: GameResultRow[]): Map<string, GameResultRow[]> {
  const map = new Map<string, GameResultRow[]>();
  for (const row of rows) {
    const list = map.get(row.game_id);
    if (list) list.push(row);
    else map.set(row.game_id, [row]);
  }
  return map;
}

function buildMatches(
  gameRows: Map<string, GameResultRow[]>,
  options: { minVictoryPoints: number },
): Match[] {
  const matches: Match[] = [];
  const minVictoryPoints = options.minVictoryPoints;

  for (const [gameId, rows] of gameRows) {
    const meta = rows[0];
    const expectedCount = meta.player_count;

    let invalidReason: string | null = null;

    if (!meta.ended_at) {
      invalidReason = "Missing ended_at on game result";
    }

    if (expectedCount < 2 || expectedCount > 6) {
      invalidReason = `Unsupported player_count=${expectedCount} (expected 2-6)`;
    }

    const eligibleRows = rows.filter((r) => (r.victory_points ?? 0) >= minVictoryPoints);

    const participantsRaw: Omit<MatchParticipant, "placement">[] = [];
    for (const r of eligibleRows) {
      const uname = (r.username ?? "").trim();
      const key = uname ? usernameKey(uname) : null;
      participantsRaw.push({
        playerColor: r.player_color,
        username: uname || null,
        usernameKey: key,
        rawUsername: r.raw_username,
        selectedCharacter: r.selected_character,
        victoryPoints: r.victory_points,
      });
    }

    if (!invalidReason) {
      const actualCount = participantsRaw.length;
      if (actualCount < 2) {
        invalidReason = `Not enough players after filtering (<${minVictoryPoints} VP excluded)`;
      } else if (actualCount > 6) {
        invalidReason = `Unsupported filtered player_count=${actualCount} (expected 2-6)`;
      }
    }

    if (!invalidReason) {
      const seenUsers = new Set<string>();
      for (const p of participantsRaw) {
        if (!p.usernameKey) continue;
        if (seenUsers.has(p.usernameKey)) {
          invalidReason = `Duplicate username_key in match: ${p.usernameKey}`;
          break;
        }
        seenUsers.add(p.usernameKey);
      }
    }

    let participants: MatchParticipant[] = [];
    let players: MatchPlayer[] = [];
    if (!invalidReason) {
      const sorted = [...participantsRaw].sort((a, b) =>
        b.victoryPoints - a.victoryPoints || a.playerColor.localeCompare(b.playerColor)
      );

      // Dense ranks: equal victory_points => equal placement (1,2,2,3...).
      let placement = 0;
      let lastVp: number | null = null;
      participants = sorted.map((p) => {
        if (lastVp === null || p.victoryPoints !== lastVp) {
          placement += 1;
          lastVp = p.victoryPoints;
        }
        return { ...p, placement };
      });

      players = participants
        .filter((p) => p.usernameKey != null && p.username != null)
        .map((p) => ({
          playerColor: p.playerColor,
          username: p.username as string,
          usernameKey: p.usernameKey as string,
          rawUsername: p.rawUsername,
          selectedCharacter: p.selectedCharacter,
          victoryPoints: p.victoryPoints,
          placement: p.placement,
        }));
    }

    matches.push({
      gameId,
      startedAt: meta.started_at,
      endedAt: meta.ended_at,
      navigationCount: meta.navigation_count,
      playerCountExpected: expectedCount,
      playerCountActual: participantsRaw.length,
      isValid: invalidReason == null,
      invalidReason,
      participants,
      players,
    });
  }

  // Stable chronological processing for ratings.
  matches.sort((a, b) => {
    const aEnded = a.endedAt ? Date.parse(a.endedAt) : Number.POSITIVE_INFINITY;
    const bEnded = b.endedAt ? Date.parse(b.endedAt) : Number.POSITIVE_INFINITY;
    if (aEnded !== bEnded) return aEnded - bEnded;
    return a.gameId.localeCompare(b.gameId);
  });

  return matches;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-recompute-token",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const minTurns = typeof body.minTurns === "number" ? Math.floor(body.minTurns) : 10;
  const minVictoryPoints = typeof body.minVictoryPoints === "number"
    ? Math.floor(body.minVictoryPoints)
    : 10;
  const statsVersion = typeof body.statsVersion === "number" ? Math.floor(body.statsVersion) : 1;
  const ratingVersion = typeof body.ratingVersion === "number" ? Math.floor(body.ratingVersion) : 1;

  const providedToken = req.headers.get("x-recompute-token")?.trim() ?? "";
  if (!providedToken) {
    return jsonResponse({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return jsonResponse({ success: false, error: "Database connection string not set" }, { status: 500 });
  }

  const client = new Client(dbUrl);

  try {
    await client.connect();

    const tokenResult = await client.queryObject<{ value: string }>(
      `select value from "${SCHEMA}".internal_tokens where key = 'recompute_stats_token' limit 1;`,
    );
    const expectedToken = tokenResult.rows?.[0]?.value ?? null;
    if (!expectedToken || expectedToken !== providedToken) {
      return jsonResponse({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Pull all verified game results once (heavy query, but runs rarely).
    const results = await client.queryObject<GameResultRow>(
      `select
        game_id,
        started_at,
        ended_at,
        navigation_count,
        player_color,
        username,
        raw_username,
        selected_character,
        victory_points,
        player_count
      from "${SCHEMA}".game_results_verified
      where navigation_count > $1
      order by ended_at asc nulls last, game_id asc, victory_points desc;`,
      [minTurns],
    );

    const matches = buildMatches(groupByGame(results.rows), { minVictoryPoints });

    const gamesTotal = matches.length;
    const validMatches = matches.filter((m) => m.isValid);
    const gamesValid = validMatches.length;
    const playersTotal = matches.reduce((sum, m) => sum + m.playerCountActual, 0);
    const playersValid = validMatches.reduce((sum, m) => sum + m.participants.length, 0);

    await client.queryArray("begin");

    await client.queryArray(
      `truncate
        "${SCHEMA}".player_rating_events,
        "${SCHEMA}".player_ratings,
        "${SCHEMA}".verified_match_players,
        "${SCHEMA}".verified_matches;`,
    );

    // Persist matches and match players (store invalid matches too, for visibility).
    for (const match of matches) {
      await client.queryArray(
        `insert into "${SCHEMA}".verified_matches (
          game_id,
          started_at,
          ended_at,
          navigation_count,
          player_count_expected,
          player_count_actual,
          is_valid,
          invalid_reason,
          stats_version,
          processed_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now());`,
        [match.gameId, match.startedAt, match.endedAt, match.navigationCount, match.playerCountExpected, match.playerCountActual, match.isValid, match.invalidReason, statsVersion],
      );

      if (!match.isValid) continue;

      for (const p of match.players) {
        await client.queryArray(
          `insert into "${SCHEMA}".verified_match_players (
            game_id,
            player_color,
            username_key,
            username,
            raw_username,
            selected_character,
            victory_points,
            placement
          ) values ($1,$2,$3,$4,$5,$6,$7,$8);`,
          [match.gameId, p.playerColor, p.usernameKey, p.username, p.rawUsername, p.selectedCharacter, p.victoryPoints, p.placement],
        );
      }
    }

    // Rating recompute (placement-only OpenSkill).
    const current = new Map<string, { mu: number; sigma: number; username: string }>();
    const gamesPlayed = new Map<string, number>();
    const lastGame = new Map<
      string,
      { gameId: string | null; endedAt: string | null; username: string }
    >();

    for (const match of validMatches) {
      const participants = match.participants;

      // Build teams in a stable order and pass rank explicitly.
      const teams = participants.map((p) => {
        if (!p.usernameKey) return [rating()];

        const existing = current.get(p.usernameKey);
        const base = existing ? rating({ mu: existing.mu, sigma: existing.sigma }) : rating();
        return [base];
      });
      const ranks = participants.map((p) => p.placement);

      const updated = rate(teams, { rank: ranks });

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        if (!p.usernameKey || !p.username) continue;

        const before = current.get(p.usernameKey) ?? { mu: teams[i][0].mu, sigma: teams[i][0].sigma, username: p.username };
        const after = updated[i][0];

        await client.queryArray(
          `insert into "${SCHEMA}".player_rating_events (
            game_id,
            ended_at,
            username_key,
            username,
            placement,
            mu_before,
            sigma_before,
            mu_after,
            sigma_after,
            rating_version
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
          [match.gameId, match.endedAt, p.usernameKey, p.username, p.placement, before.mu, before.sigma, after.mu, after.sigma, ratingVersion],
        );

        current.set(p.usernameKey, { mu: after.mu, sigma: after.sigma, username: p.username });
        gamesPlayed.set(p.usernameKey, (gamesPlayed.get(p.usernameKey) ?? 0) + 1);
        lastGame.set(p.usernameKey, { gameId: match.gameId, endedAt: match.endedAt, username: p.username });
      }
    }

    // Persist current ratings.
    for (const [key, value] of current) {
      const gp = gamesPlayed.get(key) ?? 0;
      const last = lastGame.get(key) ?? { gameId: null, endedAt: null, username: value.username };
      await client.queryArray(
        `insert into "${SCHEMA}".player_ratings (
          username_key,
          username,
          mu,
          sigma,
          games_played,
          last_game_id,
          last_game_at,
          rating_version,
          updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,now());`,
        [key, last.username, value.mu, value.sigma, gp, last.gameId, last.endedAt, ratingVersion],
      );
    }

    await client.queryArray("commit");

    return jsonResponse({
      success: true,
      statsVersion,
      ratingVersion,
      minTurns,
      minVictoryPoints,
      gamesTotal,
      gamesValid,
      playersTotal,
      playersValid,
      playersRated: current.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    try {
      await client.queryArray("rollback");
    } catch {
      // ignore rollback errors
    }
    console.error("recompute-stats failed:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    await client.end();
  }
});
