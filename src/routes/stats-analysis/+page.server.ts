import type { PageServerLoad } from './$types';
import { supabase, TABLES } from '$lib/supabase';

const RECENT_LIMIT = 8;

export interface AvgVpPoint {
	round: number;
	normalizedRound: number; // round / totalRounds, in [0, 1]
	avgVp: number;
}

export interface AvgVpGameSeries {
	gameId: string;
	endedAt: string | null;
	totalRounds: number;
	playerCount: number;
	points: AvgVpPoint[];
}

// One series per distinct player_count — averaged across ALL verified games of
// that size, plotted by absolute round number.
export interface PlayerCountSeries {
	playerCount: number;
	gameCount: number; // total verified games with this player count
	points: Array<{
		round: number;
		avgVp: number;
		gameCount: number; // # distinct games contributing at this round
	}>;
}

interface SummaryRow {
	game_id: string;
	ended_at: string | null;
	navigation_count: number | null;
	player_count: number | null;
}

interface SnapRow {
	game_id: string;
	navigation_count: number;
	victory_points: number | null;
}

export const load: PageServerLoad = async () => {
	// 1. Eight most recently completed AND verified games. We pull only verified
	// rows so the chart isn't skewed by partial / abandoned / un-reviewed games.
	const { data: summaries, error: summaryErr } = await supabase
		.from(TABLES.GAME_SUMMARIES)
		.select('game_id, ended_at, navigation_count, player_count')
		.eq('verified', true)
		.not('ended_at', 'is', null)
		.order('ended_at', { ascending: false })
		.limit(RECENT_LIMIT);

	if (summaryErr) {
		throw new Error(`Failed to fetch recent game summaries: ${summaryErr.message}`);
	}

	const summaryRows = (summaries as SummaryRow[] | null) ?? [];
	const gameIds = summaryRows.map((s) => s.game_id);
	if (gameIds.length === 0) return { games: [] as AvgVpGameSeries[] };

	// 2. All snapshots for those eight games. We only need the columns that
	// feed the avg-VP-per-round series so payloads stay small.
	const { data: snaps, error: snapErr } = await supabase
		.from(TABLES.GAME_STATE_SNAPSHOTS)
		.select('game_id, navigation_count, victory_points')
		.in('game_id', gameIds);

	if (snapErr) {
		throw new Error(`Failed to fetch snapshots for stats analysis: ${snapErr.message}`);
	}

	const snapRows = (snaps as SnapRow[] | null) ?? [];

	// 3. Per game: average VP across players at each navigation round, then
	// normalize x to game-progress fraction so all 8 series share an axis.
	const games: AvgVpGameSeries[] = summaryRows.map((s) => {
		const rows = snapRows.filter((r) => r.game_id === s.game_id);
		const byRound = new Map<number, { sum: number; n: number }>();
		for (const r of rows) {
			const prev = byRound.get(r.navigation_count) ?? { sum: 0, n: 0 };
			prev.sum += r.victory_points ?? 0;
			prev.n += 1;
			byRound.set(r.navigation_count, prev);
		}

		const sortedRounds = Array.from(byRound.keys()).sort((a, b) => a - b);
		const totalRounds = Math.max(
			s.navigation_count ?? 0,
			sortedRounds[sortedRounds.length - 1] ?? 0
		);
		const denom = Math.max(1, totalRounds);

		const points: AvgVpPoint[] = sortedRounds.map((round) => {
			const e = byRound.get(round)!;
			return {
				round,
				normalizedRound: round / denom,
				avgVp: e.sum / Math.max(1, e.n)
			};
		});

		return {
			gameId: s.game_id,
			endedAt: s.ended_at,
			totalRounds,
			playerCount: s.player_count ?? 0,
			points
		};
	});

	// 4. Aggregate ALL verified games by player count for the second chart.
	// We need a wider sample than the recent-8 to get a stable per-player-count
	// average, so this is a separate query over the full verified history.
	const { data: allVerified, error: allErr } = await supabase
		.from(TABLES.GAME_SUMMARIES)
		.select('game_id, player_count')
		.eq('verified', true)
		.not('ended_at', 'is', null);

	if (allErr) {
		throw new Error(`Failed to fetch all verified summaries: ${allErr.message}`);
	}

	const allRows = (allVerified as Array<{ game_id: string; player_count: number | null }> | null) ?? [];
	const playerCountByGame = new Map<string, number>();
	for (const r of allRows) {
		if (typeof r.player_count === 'number') playerCountByGame.set(r.game_id, r.player_count);
	}

	let allSnaps: SnapRow[] = [];
	const allIds = Array.from(playerCountByGame.keys());
	if (allIds.length > 0) {
		const { data: aggSnaps, error: aggErr } = await supabase
			.from(TABLES.GAME_STATE_SNAPSHOTS)
			.select('game_id, navigation_count, victory_points')
			.in('game_id', allIds);
		if (aggErr) {
			throw new Error(`Failed to fetch snapshots for player-count aggregation: ${aggErr.message}`);
		}
		allSnaps = (aggSnaps as SnapRow[] | null) ?? [];
	}

	// playerCount -> round -> { sumVp across all player-rows, distinct game ids }
	const buckets = new Map<number, Map<number, { sum: number; n: number; gameIds: Set<string> }>>();
	for (const r of allSnaps) {
		const pc = playerCountByGame.get(r.game_id);
		if (pc == null) continue;
		let rounds = buckets.get(pc);
		if (!rounds) {
			rounds = new Map();
			buckets.set(pc, rounds);
		}
		const e = rounds.get(r.navigation_count) ?? { sum: 0, n: 0, gameIds: new Set<string>() };
		e.sum += r.victory_points ?? 0;
		e.n += 1;
		e.gameIds.add(r.game_id);
		rounds.set(r.navigation_count, e);
	}

	// Per player count, count distinct contributing games for the legend.
	const gamesByPc = new Map<number, number>();
	for (const pc of playerCountByGame.values()) {
		gamesByPc.set(pc, (gamesByPc.get(pc) ?? 0) + 1);
	}

	const byPlayerCount: PlayerCountSeries[] = Array.from(buckets.entries())
		.sort(([a], [b]) => a - b)
		.map(([playerCount, roundMap]) => {
			const points = Array.from(roundMap.entries())
				.sort(([a], [b]) => a - b)
				// Drop noisy single-game tail rounds: only emit a point if >=2 games
				// contributed (or if this player count itself only has one game).
				.filter(([, e]) => e.gameIds.size >= 2 || (gamesByPc.get(playerCount) ?? 0) <= 1)
				.map(([round, e]) => ({
					round,
					avgVp: e.sum / Math.max(1, e.n),
					gameCount: e.gameIds.size
				}));
			return {
				playerCount,
				gameCount: gamesByPc.get(playerCount) ?? 0,
				points
			};
		});

	return { games, byPlayerCount };
};
