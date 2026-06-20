// Shared player-profile derivations. Used by the web /players/[username] page and the
// in-game PlayerDetailPanel so both compute identical pace/placement/win-rate stats.

import type { GameResultRow, PlayerStatsRow, RatingLeaderboardRow } from '$lib/types';
import { mean, median, safeDurationMs } from '$lib/features/stats/format';

export type PlayerStats = RatingLeaderboardRow | PlayerStatsRow;

export function gameDurationMs(g: GameResultRow): number | null {
	return safeDurationMs(g.started_at, g.ended_at);
}

export function ratingOf(stats: PlayerStats | null): number | null {
	return stats && 'ordinal' in stats ? stats.ordinal : null;
}

export function winRatePct(stats: PlayerStats | null): number {
	if (!stats) return 0;
	if ('win_rate' in stats && stats.win_rate != null) return stats.win_rate * 100;
	return (stats.wins / Math.max(1, stats.games_played)) * 100;
}

/** Share of games finishing in the top half of the table (placement ≤ ceil(n/2)). */
export function top4Pct(games: GameResultRow[]): number {
	if (games.length === 0) return 0;
	const top = games.filter((g) => g.placement <= Math.ceil(g.player_count / 2)).length;
	return (top / games.length) * 100;
}

export function topHalfCount(games: GameResultRow[]): number {
	return games.filter((g) => g.placement <= Math.ceil(g.player_count / 2)).length;
}

export function totalPlayTimeMs(games: GameResultRow[]): number {
	return games.reduce((sum, g) => sum + (gameDurationMs(g) ?? 0), 0);
}

export interface PlacementBar {
	place: number;
	count: number;
	frac: number;
}

export function placementDistribution(games: GameResultRow[]): PlacementBar[] {
	const max = Math.max(0, ...games.map((g) => g.player_count ?? 4));
	const buckets = max > 0 ? max : 8;
	const counts = new Array(buckets).fill(0);
	for (const g of games) {
		const p = Math.max(1, Math.min(buckets, g.placement));
		counts[p - 1] += 1;
	}
	const peak = Math.max(1, ...counts);
	return counts.map((c, i) => ({ place: i + 1, count: c, frac: c / peak }));
}

export interface PaceMetric {
	mean: number | null;
	median: number | null;
}

export interface PlayerPace {
	vpPerTurn: PaceMetric;
	timePerTurn: PaceMetric;
	rounds: PaceMetric;
	vp: PaceMetric;
	placement: PaceMetric;
	duration: PaceMetric;
}

export function playerPace(games: GameResultRow[]): PlayerPace {
	const vpPerTurn = games
		.filter((g) => g.navigation_count > 0)
		.map((g) => g.victory_points / g.navigation_count);
	const timePerTurnMs = games
		.map((g) => {
			const d = gameDurationMs(g);
			return d != null && g.navigation_count > 0 ? d / g.navigation_count : null;
		})
		.filter((v): v is number => v != null);
	const rounds = games.map((g) => g.navigation_count).filter((v) => v > 0);
	const vp = games.map((g) => g.victory_points);
	const placement = games.map((g) => g.placement);
	const durations = games.map((g) => gameDurationMs(g)).filter((v): v is number => v != null);

	return {
		vpPerTurn: { mean: mean(vpPerTurn), median: median(vpPerTurn) },
		timePerTurn: { mean: mean(timePerTurnMs), median: median(timePerTurnMs) },
		rounds: { mean: mean(rounds), median: median(rounds) },
		vp: { mean: mean(vp), median: median(vp) },
		placement: { mean: mean(placement), median: median(placement) },
		duration: { mean: mean(durations), median: median(durations) }
	};
}

export type PlacementTone = 'p-gold' | 'p-silver' | 'p-good' | 'p-bad';

export function placementColor(p: number, total: number): PlacementTone {
	if (p === 1) return 'p-gold';
	if (p === 2) return 'p-silver';
	if (p <= Math.ceil(total / 2)) return 'p-good';
	return 'p-bad';
}
