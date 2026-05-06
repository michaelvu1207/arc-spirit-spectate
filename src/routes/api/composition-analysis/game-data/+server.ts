import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';
import type { Composition } from '$lib/compositions/schema';

// GET /api/composition-analysis/game-data?game_id=X
// Returns everything the games tab needs to render one game's overlay chart
// + drive the diagnostic report. Single round-trip.

export interface GamePlayerVp {
	round: number;
	vp: number;
}

export interface GameTagPayload {
	playerColor: string;
	compositionId: string | null;
	composition: Composition | null;
}

export interface GameDataPayload {
	gameId: string;
	displayName: string | null;
	endedAt: string | null;
	totalRounds: number | null;
	tags: GameTagPayload[];
	vpsByPlayer: Record<string, GamePlayerVp[]>;
	playerOrder: string[]; // stable ordering for chart legend
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!isAdminRequest(cookies)) throw svelteError(401, 'admin auth required');
	const gameId = url.searchParams.get('game_id');
	if (!gameId) throw svelteError(400, 'game_id query required');

	const admin = getSupabaseAdmin();
	if (!admin) throw svelteError(500, 'service role not configured');

	const [
		{ data: summaryRows, error: summaryErr },
		{ data: snapshotRows, error: snapErr },
		{ data: tagRows, error: tagErr },
		{ data: compRows, error: compErr }
	] = await Promise.all([
		admin
			.from('composition_games_summary')
			.select('display_name, ended_at, total_rounds')
			.eq('game_id', gameId)
			.maybeSingle(),
		admin
			.from('game_state_snapshots')
			.select('player_color, navigation_count, victory_points')
			.eq('game_id', gameId),
		admin
			.from('player_composition_tags')
			.select('player_color, composition_id, tag')
			.eq('game_id', gameId),
		admin.from('compositions').select('*')
	]);

	if (summaryErr) throw svelteError(500, `summary read failed: ${summaryErr.message}`);
	if (snapErr) throw svelteError(500, `snapshot read failed: ${snapErr.message}`);
	if (tagErr) throw svelteError(500, `tag read failed: ${tagErr.message}`);
	if (compErr) throw svelteError(500, `compositions read failed: ${compErr.message}`);

	const compsById = new Map<string, Composition>();
	const compsByName = new Map<string, Composition>();
	for (const c of (compRows as Composition[] | null) ?? []) {
		compsById.set(c.id, c);
		compsByName.set(c.name, c);
	}

	const vpsByPlayer: Record<string, GamePlayerVp[]> = {};
	for (const r of (snapshotRows as Array<{
		player_color: string;
		navigation_count: number;
		victory_points: number | null;
	}> | null) ?? []) {
		const list = vpsByPlayer[r.player_color] ?? [];
		list.push({ round: r.navigation_count, vp: r.victory_points ?? 0 });
		vpsByPlayer[r.player_color] = list;
	}
	for (const list of Object.values(vpsByPlayer)) list.sort((a, b) => a.round - b.round);

	const tagsRaw =
		(tagRows as Array<{ player_color: string; composition_id: string | null; tag: string }> | null) ??
		[];

	const tagsByPlayer = new Map<string, GameTagPayload>();
	for (const t of tagsRaw) {
		// composition_id is the canonical link; fall back to legacy tag string lookup if null.
		const composition =
			(t.composition_id ? compsById.get(t.composition_id) : compsByName.get(t.tag)) ?? null;
		tagsByPlayer.set(t.player_color, {
			playerColor: t.player_color,
			compositionId: t.composition_id,
			composition
		});
	}

	const playerOrder = Object.keys(vpsByPlayer).sort();
	for (const color of playerOrder) {
		if (!tagsByPlayer.has(color)) {
			tagsByPlayer.set(color, { playerColor: color, compositionId: null, composition: null });
		}
	}

	const payload: GameDataPayload = {
		gameId,
		displayName: summaryRows?.display_name ?? null,
		endedAt: summaryRows?.ended_at ?? null,
		totalRounds: summaryRows?.total_rounds ?? null,
		tags: playerOrder.map((c) => tagsByPlayer.get(c)!),
		vpsByPlayer,
		playerOrder
	};

	return json(payload);
};
