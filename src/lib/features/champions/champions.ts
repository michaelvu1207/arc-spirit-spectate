// Shared mapping + sorting for the "Hall of Champions" leaderboard. Used by the web
// /leaderboard page and the in-game /play/champions screen so both rank identically.

import type { RatingLeaderboardRow, LeaderboardLastGameEntry } from '$lib/types';

export interface ChampionEntry {
	username: string;
	usernameKey: string;
	/** OpenSkill ordinal, displayed as "Rating". Null until a player is rated. */
	rating: number | null;
	winRatePct: number;
	gamesPlayed: number;
	wins: number;
	avgPoints: number;
	avgPlacement: number;
	lastGameAt: string | null;
	lastGames: LeaderboardLastGameEntry[];
}

export function mapChampion(row: RatingLeaderboardRow): ChampionEntry {
	return {
		username: row.username,
		usernameKey: row.username_key,
		rating: row.ordinal,
		winRatePct: Math.round((((row.win_rate ?? 0) * 100) + Number.EPSILON) * 10) / 10,
		gamesPlayed: row.games_played,
		wins: row.wins,
		avgPoints: row.avg_victory_points,
		avgPlacement: row.avg_placement,
		lastGameAt: row.last_game_at,
		lastGames: row.last_games ?? []
	};
}

/**
 * Canonical leaderboard ordering: rating desc → games played desc →
 * avg placement asc → username. Returns a new sorted array.
 */
export function sortChampions(entries: ChampionEntry[]): ChampionEntry[] {
	return [...entries].sort((a, b) => {
		const aR = a.rating ?? Number.NEGATIVE_INFINITY;
		const bR = b.rating ?? Number.NEGATIVE_INFINITY;
		const byR = bR - aR;
		if (byR !== 0) return byR;
		const byG = b.gamesPlayed - a.gamesPlayed;
		if (byG !== 0) return byG;
		const byP = a.avgPlacement - b.avgPlacement;
		if (byP !== 0) return byP;
		return a.username.localeCompare(b.username);
	});
}

/** Map + sort in one step. */
export function toSortedChampions(rows: RatingLeaderboardRow[]): ChampionEntry[] {
	return sortChampions(rows.map(mapChampion));
}

/** Rank label for the podium top three. */
export function rankLabel(rank: number): string {
	if (rank === 1) return 'Champion';
	if (rank === 2) return 'Runner-Up';
	if (rank === 3) return 'Third';
	return '';
}
