import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';
import {
	createComposition,
	listCompositions,
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
			err.code === 'duplicate_name' || err.code === 'reserved_name' ? 409 :
			err.code === 'not_found' ? 404 :
			err.code === 'fk_in_use' ? 409 :
			err.code === 'admin_unavailable' ? 500 :
			500;
		throw svelteError(status, err.message);
	}
	throw err;
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	gateAdmin(cookies);
	try {
		const activeOnly = url.searchParams.get('active') === '1';
		const items = await listCompositions({ activeOnly });
		return json({ compositions: items });
	} catch (err) {
		handleError(err);
	}
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	gateAdmin(cookies);
	const body = await request.json().catch(() => ({}));
	try {
		const created = await createComposition(body);
		return json(created, { status: 201 });
	} catch (err) {
		handleError(err);
	}
};
