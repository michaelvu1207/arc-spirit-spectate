import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';
import {
	getComposition,
	updateComposition,
	deleteComposition,
	countTagsForComposition,
	CompositionsServiceError
} from '$lib/server/compositionsService';
import { CompositionValidationError } from '$lib/compositions/schema';

function gateAdmin(cookies: Parameters<RequestHandler>[0]['cookies']): void {
	if (!isAdminRequest(cookies)) throw svelteError(401, 'admin auth required');
}

function handleError(err: unknown): never {
	if (err instanceof CompositionValidationError) {
		throw svelteError(400, `${err.field}: ${err.message}`);
	}
	if (err instanceof CompositionsServiceError) {
		const status =
			err.code === 'duplicate_name' ? 409 :
			err.code === 'not_found' ? 404 :
			err.code === 'fk_in_use' ? 409 :
			err.code === 'admin_unavailable' ? 500 :
			500;
		throw svelteError(status, err.message);
	}
	throw err;
}

export const GET: RequestHandler = async ({ cookies, params }) => {
	gateAdmin(cookies);
	if (!params.id) throw svelteError(400, 'id required');
	try {
		const c = await getComposition(params.id);
		if (!c) throw svelteError(404, 'composition not found');
		return json(c);
	} catch (err) {
		handleError(err);
	}
};

export const PATCH: RequestHandler = async ({ cookies, params, request }) => {
	gateAdmin(cookies);
	if (!params.id) throw svelteError(400, 'id required');
	const body = await request.json().catch(() => ({}));
	try {
		const updated = await updateComposition(params.id, body);
		return json(updated);
	} catch (err) {
		handleError(err);
	}
};

export const DELETE: RequestHandler = async ({ cookies, params, url }) => {
	gateAdmin(cookies);
	if (!params.id) throw svelteError(400, 'id required');
	try {
		// Optional safety: check tag count, return helpful error before DB throws.
		const inUse = await countTagsForComposition(params.id);
		if (inUse > 0 && url.searchParams.get('force') !== '1') {
			throw svelteError(
				409,
				`composition is tagged on ${inUse} (game,player) slots — reassign first or pass ?force=1`
			);
		}
		await deleteComposition(params.id);
		return json({ ok: true });
	} catch (err) {
		handleError(err);
	}
};
