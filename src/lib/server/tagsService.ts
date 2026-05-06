// Typed CRUD over `player_composition_tags`. Server-only.
// Dual-writes both `composition_id` (FK, new) and `tag` (string, legacy)
// during the migration soak window for lossless rollback.

import { getSupabaseAdmin } from './supabaseAdmin';
import { getComposition } from './compositionsService';

export interface PlayerCompositionTag {
	game_id: string;
	player_color: string;
	tag: string;
	composition_id: string | null;
	created_at: string;
	created_by: string | null;
}

export class TagsServiceError extends Error {
	constructor(
		public code:
			| 'admin_unavailable'
			| 'composition_missing'
			| 'duplicate'
			| 'unknown',
		message: string
	) {
		super(message);
		this.name = 'TagsServiceError';
	}
}

function admin() {
	const a = getSupabaseAdmin();
	if (!a) throw new TagsServiceError('admin_unavailable', 'Service role key not configured');
	return a;
}

function audit(evt: string, payload: Record<string, unknown>): void {
	// eslint-disable-next-line no-console
	console.log(JSON.stringify({ evt: `tag.${evt}`, ts: new Date().toISOString(), ...payload }));
}

export async function listTagsForGame(gameId: string): Promise<PlayerCompositionTag[]> {
	const { data, error } = await admin()
		.from('player_composition_tags')
		.select('*')
		.eq('game_id', gameId);
	if (error) throw new TagsServiceError('unknown', error.message);
	return (data as PlayerCompositionTag[]) ?? [];
}

export async function listTagsForComposition(compositionId: string): Promise<PlayerCompositionTag[]> {
	const { data, error } = await admin()
		.from('player_composition_tags')
		.select('*')
		.eq('composition_id', compositionId);
	if (error) throw new TagsServiceError('unknown', error.message);
	return (data as PlayerCompositionTag[]) ?? [];
}

export async function assignTag(params: {
	gameId: string;
	playerColor: string;
	compositionId: string;
	createdBy?: string | null;
}): Promise<PlayerCompositionTag> {
	const composition = await getComposition(params.compositionId);
	if (!composition) {
		throw new TagsServiceError('composition_missing', `composition ${params.compositionId} not found`);
	}

	// Remove any prior tag for this (game, player) — single tag per slot.
	await admin()
		.from('player_composition_tags')
		.delete()
		.eq('game_id', params.gameId)
		.eq('player_color', params.playerColor);

	const row = {
		game_id: params.gameId,
		player_color: params.playerColor,
		tag: composition.name,
		composition_id: composition.id,
		created_by: params.createdBy ?? null
	};

	const { data, error } = await admin()
		.from('player_composition_tags')
		.insert(row)
		.select()
		.single();
	if (error) {
		if (error.code === '23505') {
			throw new TagsServiceError('duplicate', 'tag already exists');
		}
		throw new TagsServiceError('unknown', error.message);
	}
	audit('assign', {
		gameId: params.gameId,
		playerColor: params.playerColor,
		compositionId: composition.id,
		name: composition.name
	});
	return data as PlayerCompositionTag;
}

export async function unassignTag(gameId: string, playerColor: string): Promise<void> {
	const { error } = await admin()
		.from('player_composition_tags')
		.delete()
		.eq('game_id', gameId)
		.eq('player_color', playerColor);
	if (error) throw new TagsServiceError('unknown', error.message);
	audit('unassign', { gameId, playerColor });
}

// Bulk reassign — used when deleting a composition that's still in use.
export async function reassignAllTags(fromCompositionId: string, toCompositionId: string): Promise<number> {
	const target = await getComposition(toCompositionId);
	if (!target) {
		throw new TagsServiceError('composition_missing', `target composition ${toCompositionId} not found`);
	}

	const { data, error } = await admin()
		.from('player_composition_tags')
		.update({ composition_id: target.id, tag: target.name })
		.eq('composition_id', fromCompositionId)
		.select();
	if (error) throw new TagsServiceError('unknown', error.message);

	const moved = data?.length ?? 0;
	audit('reassign_bulk', {
		from: fromCompositionId,
		to: toCompositionId,
		moved
	});
	return moved;
}
