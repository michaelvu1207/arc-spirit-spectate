import { error as svelteError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { listCompositions } from '$lib/server/compositionsService';
import type { Spirit } from '$lib/types';

export interface RoundSnapshot {
	round: number;
	timestamp: string | null;
	victoryPoints: number;
	spirits: Spirit[];
}

export const load: PageServerLoad = async ({ params }) => {
	const gameId = params.gameId;
	const playerColor = params.playerColor;
	if (!gameId || !playerColor) throw svelteError(400, 'gameId + playerColor required');

	const admin = getSupabaseAdmin();
	if (!admin) throw svelteError(500, 'service role not configured');

	const [
		{ data: snapshotRows, error: snapErr },
		{ data: existingTagRow, error: existingTagErr },
		compositions
	] = await Promise.all([
		admin
			.from('game_state_snapshots')
			.select('navigation_count, game_timestamp, victory_points, spirits')
			.eq('game_id', gameId)
			.eq('player_color', playerColor)
			.order('navigation_count', { ascending: true }),
		admin
			.from('player_composition_tags')
			.select('tag, composition_id, created_at')
			.eq('game_id', gameId)
			.eq('player_color', playerColor)
			.maybeSingle(),
		listCompositions()
	]);

	if (snapErr) throw svelteError(500, `snapshot read failed: ${snapErr.message}`);
	if (existingTagErr) throw svelteError(500, `existing tag read failed: ${existingTagErr.message}`);

	const snapshots: RoundSnapshot[] = (
		(snapshotRows as Array<{
			navigation_count: number;
			game_timestamp: string | null;
			victory_points: number | null;
			spirits: Spirit[] | null;
		}> | null) ?? []
	).map((r) => ({
		round: r.navigation_count,
		timestamp: r.game_timestamp,
		victoryPoints: r.victory_points ?? 0,
		spirits: Array.isArray(r.spirits) ? r.spirits : []
	}));

	return {
		gameId,
		playerColor,
		snapshots,
		existingTag: existingTagRow,
		compositions
	};
};
