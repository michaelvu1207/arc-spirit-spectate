// Client-side loader for a single game's final standings, used by the in-game
// GameDetailPanel. Derives a ranked roster from the final-round snapshots (the
// highest navigation_count), so it needs no server loader.

import { fetchMaxNavigationCount, fetchGameSnapshotsForRound } from '$lib/supabase';
import type { GameSnapshot } from '$lib/types';

export interface FinalStanding {
	placement: number;
	playerColor: string;
	username: string | null;
	character: string;
	victoryPoints: number;
	barrier: number;
	blood: number;
}

export interface GameFinalState {
	navigationCount: number;
	standings: FinalStanding[];
}

function toStanding(s: GameSnapshot, placement: number): FinalStanding {
	return {
		placement,
		playerColor: s.player_color,
		username: s.tts_username,
		character: s.selected_character,
		victoryPoints: s.victory_points,
		barrier: s.barrier,
		blood: s.blood
	};
}

/**
 * Load the final standings for a game. Ranks players by victory points desc,
 * breaking ties by barrier then blood (mirrors the table's tie ordering).
 * Returns null when the game has no snapshots.
 */
export async function loadGameFinalState(gameId: string): Promise<GameFinalState | null> {
	const navCount = await fetchMaxNavigationCount(gameId);
	// A max navigation_count of 0 means no completed-round snapshots exist; skip the
	// second (guaranteed-empty) query.
	if (navCount === 0) return null;
	const snapshots = await fetchGameSnapshotsForRound(gameId, navCount);
	if (snapshots.length === 0) return null;

	const ranked = [...snapshots].sort((a, b) => {
		if (b.victory_points !== a.victory_points) return b.victory_points - a.victory_points;
		if (b.barrier !== a.barrier) return b.barrier - a.barrier;
		return b.blood - a.blood;
	});

	return {
		navigationCount: navCount,
		standings: ranked.map((s, i) => toStanding(s, i + 1))
	};
}
