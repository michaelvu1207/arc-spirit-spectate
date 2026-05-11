import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CURVE_POINTS } from '$lib/compositions/schema';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

const POINTS_PER_LINE = CURVE_POINTS;
const REFERENCE_TAG = '__reference__';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as
		| { tag?: string; ideal_points?: unknown; category?: unknown }
		| null;

	const tag = typeof body?.tag === 'string' ? body.tag.trim() : '';
	if (!tag) throw svelteError(400, 'tag is required');

	const updates: Record<string, unknown> = { tag, updated_at: new Date().toISOString() };

	// Optional ideal_points: full POINTS_PER_LINE-element array of finite
	// numbers, or `null` to clear (so the tag has no ideal curve at all).
	if (body?.ideal_points !== undefined) {
		const rawPoints = body.ideal_points;
		if (rawPoints === null) {
			updates.ideal_points = null;
		} else {
			if (!Array.isArray(rawPoints) || rawPoints.length !== POINTS_PER_LINE) {
				throw svelteError(
					400,
					`ideal_points must be an array of exactly ${POINTS_PER_LINE} numbers (or null to clear)`
				);
			}
			const points: number[] = [];
			for (const v of rawPoints) {
				const n = typeof v === 'number' ? v : Number(v);
				if (!Number.isFinite(n)) {
					throw svelteError(400, 'ideal_points entries must all be finite numbers');
				}
				points.push(Math.max(-1000, Math.min(1000, n)));
			}
			updates.ideal_points = points;
		}
	}

	// Optional category: string assigns, null clears, missing leaves alone.
	if (body && Object.prototype.hasOwnProperty.call(body, 'category')) {
		const raw = body.category;
		if (raw === null) {
			updates.category = null;
		} else if (typeof raw === 'string') {
			const trimmed = raw.trim();
			if (trimmed.length > 64) throw svelteError(400, 'category must be ≤ 64 chars');
			// Reserved sentinel-style names disallowed.
			if (trimmed.startsWith('__')) throw svelteError(400, 'category may not start with __');
			updates.category = trimmed.length > 0 ? trimmed : null;
		} else {
			throw svelteError(400, 'category must be a string or null');
		}
	}

	if (tag === REFERENCE_TAG && updates.category !== undefined) {
		// Reference is global, can't belong to a category. Silently strip.
		delete updates.category;
	}

	if (Object.keys(updates).length <= 2) {
		// Only `tag` + `updated_at` — caller didn't actually request anything.
		throw svelteError(400, 'must provide ideal_points and/or category');
	}

	const admin = getSupabaseAdmin();
	if (!admin) throw svelteError(500, 'Service role key not configured for this environment');

	const { error: upsertErr } = await admin.from('composition_tag_targets').upsert(updates);
	if (upsertErr) throw svelteError(500, `Failed to save target: ${upsertErr.message}`);

	return json({ ok: true, ...updates });
};

// Hard delete a composition tag from the dashboard. Removes both the curve
// config row AND every player game-tag carrying the same name, so the tag
// disappears entirely from the lines list (vs. zombie-coming-back via the
// game-tag union).
export const DELETE: RequestHandler = async ({ request, url }) => {
	const body = await request.json().catch(() => null);
	const fromBody = body && typeof (body as { tag?: unknown }).tag === 'string'
		? ((body as { tag: string }).tag as string)
		: '';
	const fromQuery = url.searchParams.get('tag') ?? '';
	const tag = (fromBody || fromQuery).trim();

	if (!tag) throw svelteError(400, 'tag is required');
	if (tag === REFERENCE_TAG) throw svelteError(400, 'cannot delete the reference baseline');

	const admin = getSupabaseAdmin();
	if (!admin) throw svelteError(500, 'Service role key not configured for this environment');

	// Order matters: drop the per-game tags first so a partial failure leaves
	// the curve row visible (recoverable) rather than orphan game tags.
	const { error: gameErr } = await admin
		.from('player_composition_tags')
		.delete()
		.eq('tag', tag);
	if (gameErr) throw svelteError(500, `Failed to delete player game tags: ${gameErr.message}`);

	const { error: targetErr } = await admin
		.from('composition_tag_targets')
		.delete()
		.eq('tag', tag);
	if (targetErr) throw svelteError(500, `Failed to delete target row: ${targetErr.message}`);

	return json({ ok: true, tag });
};
