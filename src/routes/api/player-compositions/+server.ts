import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';
import {
	assignTag,
	listTagsForGame,
	reassignAllTags,
	unassignTag,
	TagsServiceError
} from '$lib/server/tagsService';

function gateAdmin(cookies: Parameters<RequestHandler>[0]['cookies']): void {
	if (!isAdminRequest(cookies)) throw svelteError(401, 'admin auth required');
}

function handleError(err: unknown): never {
	if (err instanceof TagsServiceError) {
		const status =
			err.code === 'composition_missing' ? 404 :
			err.code === 'duplicate' ? 409 :
			err.code === 'admin_unavailable' ? 500 :
			500;
		throw svelteError(status, err.message);
	}
	throw err;
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	gateAdmin(cookies);
	const gameId = url.searchParams.get('game_id');
	if (!gameId) throw svelteError(400, 'game_id query required');
	try {
		const tags = await listTagsForGame(gameId);
		return json({ tags });
	} catch (err) {
		handleError(err);
	}
};

export const POST: RequestHandler = async ({ cookies, request }) => {
	gateAdmin(cookies);
	const body = (await request.json().catch(() => null)) as
		| { game_id?: string; player_color?: string; composition_id?: string; reassign_from?: string }
		| null;

	if (!body) throw svelteError(400, 'invalid body');

	// Bulk reassign mode: { reassign_from, composition_id }
	if (body.reassign_from && body.composition_id) {
		try {
			const moved = await reassignAllTags(body.reassign_from, body.composition_id);
			return json({ ok: true, moved });
		} catch (err) {
			handleError(err);
		}
	}

	// Single assign mode.
	if (!body.game_id || !body.player_color || !body.composition_id) {
		throw svelteError(400, 'game_id, player_color, composition_id required');
	}
	try {
		const tag = await assignTag({
			gameId: body.game_id,
			playerColor: body.player_color,
			compositionId: body.composition_id
		});
		return json(tag, { status: 201 });
	} catch (err) {
		handleError(err);
	}
};

export const DELETE: RequestHandler = async ({ cookies, url }) => {
	gateAdmin(cookies);
	const gameId = url.searchParams.get('game_id');
	const playerColor = url.searchParams.get('player_color');
	if (!gameId || !playerColor) {
		throw svelteError(400, 'game_id and player_color query params required');
	}
	try {
		await unassignTag(gameId, playerColor);
		return json({ ok: true });
	} catch (err) {
		handleError(err);
	}
};
