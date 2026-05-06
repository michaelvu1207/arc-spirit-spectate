import type { LayoutServerLoad } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

// Loads the games list for the persistent sidebar — shared across all three
// sub-routes (library / games / tagging). Backed by the
// composition_games_summary view (see migration 20260503_03).

export interface SidebarGame {
	gameId: string;
	displayName: string | null;
	endedAt: string | null;
	totalRounds: number | null;
	taggedCount: number;
	playerCount: number;
}

export const load: LayoutServerLoad = async () => {
	const admin = getSupabaseAdmin();
	if (!admin) {
		return { sidebarGames: [] as SidebarGame[] };
	}

	const { data, error } = await admin
		.from('composition_games_summary')
		.select('game_id, display_name, ended_at, total_rounds, player_count, tagged_count')
		.order('ended_at', { ascending: false, nullsFirst: false })
		.limit(200);

	if (error) throw new Error(`Failed to load games sidebar: ${error.message}`);

	const sidebarGames: SidebarGame[] = (
		(data as Array<{
			game_id: string;
			display_name: string | null;
			ended_at: string | null;
			total_rounds: number | null;
			player_count: number;
			tagged_count: number;
		}> | null) ?? []
	).map((g) => ({
		gameId: g.game_id,
		displayName: g.display_name?.trim() || null,
		endedAt: g.ended_at,
		totalRounds: g.total_rounds,
		taggedCount: g.tagged_count,
		playerCount: g.player_count
	}));

	return { sidebarGames };
};
