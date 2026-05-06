import type { PageServerLoad } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

export interface UntaggedRow {
	gameId: string;
	playerColor: string;
	displayName: string | null;
	endedAt: string | null;
	totalRounds: number | null;
}

export const load: PageServerLoad = async () => {
	const admin = getSupabaseAdmin();
	if (!admin) return { untagged: [] as UntaggedRow[] };

	const { data, error } = await admin
		.from('untagged_player_games')
		.select('game_id, player_color, display_name, ended_at, total_rounds')
		.order('ended_at', { ascending: false, nullsFirst: false })
		.limit(500);

	if (error) throw new Error(`Failed to load untagged queue: ${error.message}`);

	const untagged: UntaggedRow[] = (
		(data as Array<{
			game_id: string;
			player_color: string;
			display_name: string | null;
			ended_at: string | null;
			total_rounds: number | null;
		}> | null) ?? []
	).map((r) => ({
		gameId: r.game_id,
		playerColor: r.player_color,
		displayName: r.display_name?.trim() || null,
		endedAt: r.ended_at,
		totalRounds: r.total_rounds
	}));

	return { untagged };
};
