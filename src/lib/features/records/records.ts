// Shared mapping + derivation for the "Game Records" archive. Used by the web home
// page (/) and the in-game /play/records screen so both compute the same stats.

import type { GameSummaryRow } from '$lib/types';
import { safeDurationMs } from '$lib/features/stats/format';

/** Games with fewer than this many turns are treated as "short"/incomplete. */
export const MIN_TURNS_TO_SHOW = 15;
/** "At a Glance" considers only the most recent N verified games. */
export const GLANCE_LIMIT = 8;

export type VerificationFilter = 'verified' | 'unverified' | 'all';
export type TurnFilter = '15plus' | 'under15' | 'all';

export interface RecordGame {
	gameId: string;
	startedAt: string | null;
	endedAt: string | null;
	navigationCount: number;
	playerCount: number;
	totalDurationMs: number | null;
	avgNavigationMs: number | null;
	winnerGuardian: string | null;
	winnerVp: number;
	verified: boolean;
}

export interface GlanceStats {
	recentVerified: number;
	totalRounds: number;
	totalPlayers: number;
	avgDurationMs: number | null;
	medianTurnDurationMs: number | null;
}

export function mapRecord(row: GameSummaryRow): RecordGame {
	return {
		gameId: row.game_id,
		startedAt: row.started_at,
		endedAt: row.ended_at ?? null,
		navigationCount: row.navigation_count,
		playerCount: row.player_count,
		totalDurationMs: safeDurationMs(row.started_at, row.ended_at ?? null),
		avgNavigationMs: row.avg_navigation_ms ?? null,
		winnerGuardian: row.winner_guardian ?? null,
		winnerVp: row.winner_vp ?? 0,
		verified: row.verified
	};
}

/** Newest first, by ended_at (falling back to started_at). */
function sortByRecency(a: RecordGame, b: RecordGame): number {
	return gameTimestamp(b) - gameTimestamp(a);
}

function gameTimestamp(g: RecordGame): number {
	const t = g.endedAt ?? g.startedAt;
	if (!t) return 0;
	const ms = Date.parse(t);
	return Number.isNaN(ms) ? 0 : ms;
}

export function toSortedRecords(rows: GameSummaryRow[]): RecordGame[] {
	return rows.map(mapRecord).sort(sortByRecency);
}

export function filterRecords(
	games: RecordGame[],
	verification: VerificationFilter,
	turns: TurnFilter
): RecordGame[] {
	let list = games;
	if (verification === 'verified') list = list.filter((g) => g.verified);
	else if (verification === 'unverified') list = list.filter((g) => !g.verified);
	if (turns === 'under15') return list.filter((g) => g.navigationCount < MIN_TURNS_TO_SHOW);
	if (turns === '15plus') return list.filter((g) => g.navigationCount >= MIN_TURNS_TO_SHOW);
	return list;
}

/**
 * "At a Glance" stats over the most recent GLANCE_LIMIT verified games.
 * Median turn length medians each game's precomputed avg_navigation_ms to
 * reduce skew from outlier games.
 */
export function deriveGlance(games: RecordGame[]): GlanceStats {
	const glance = games
		.filter((g) => g.verified)
		.slice()
		.sort(sortByRecency)
		.slice(0, GLANCE_LIMIT);

	const durations = glance.map((g) => g.totalDurationMs).filter((d): d is number => d != null);
	const avgDurationMs =
		durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0) / durations.length;

	const turns = glance
		.map((g) => g.avgNavigationMs)
		.filter((d): d is number => d != null && Number.isFinite(d) && d >= 0)
		.sort((a, b) => a - b);
	let medianTurnDurationMs: number | null = null;
	if (turns.length > 0) {
		const mid = Math.floor(turns.length / 2);
		medianTurnDurationMs = turns.length % 2 === 0 ? (turns[mid - 1] + turns[mid]) / 2 : turns[mid];
	}

	return {
		recentVerified: glance.length,
		totalRounds: glance.reduce((sum, g) => sum + g.navigationCount, 0),
		totalPlayers: glance.reduce((sum, g) => sum + g.playerCount, 0),
		avgDurationMs,
		medianTurnDurationMs
	};
}

/** Trim the long synced game id down to its readable middle segments. */
export function shortenGameId(gameId: string): string {
	const parts = gameId.split('_');
	if (parts.length >= 4) return `${parts[1]}_${parts[2]}_${parts[3]}`;
	return gameId.length > 22 ? gameId.slice(0, 22) + '…' : gameId;
}
