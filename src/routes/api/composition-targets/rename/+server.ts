import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

const REFERENCE_TAG = '__reference__';

// Rename a composition tag in BOTH the dashboard config table and the
// player-game-tag table.
//
// If newTag already exists, the two are MERGED:
//   - composition_tag_targets: newTag's ideal_points + category are preserved;
//     oldTag's row is dropped (no curve overwrite — would silently lose work).
//   - player_composition_tags: every (game_id, player_color, oldTag) row gets
//     re-tagged as newTag. Duplicates (e.g. a player already tagged with both)
//     collapse via ON CONFLICT DO NOTHING; the old rows are then deleted.
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as
		| { oldTag?: string; newTag?: string }
		| null;
	const oldTag = typeof body?.oldTag === 'string' ? body.oldTag.trim() : '';
	const newTag = typeof body?.newTag === 'string' ? body.newTag.trim() : '';

	if (!oldTag) throw svelteError(400, 'oldTag is required');
	if (!newTag) throw svelteError(400, 'newTag is required');
	if (oldTag === newTag) return json({ ok: true, oldTag, newTag, noop: true });
	if (newTag === REFERENCE_TAG || newTag.startsWith('__')) {
		throw svelteError(400, 'newTag is reserved');
	}
	if (oldTag === REFERENCE_TAG) {
		throw svelteError(400, 'cannot rename the reference baseline');
	}
	if (newTag.length > 64) throw svelteError(400, 'newTag must be ≤ 64 chars');

	const admin = getSupabaseAdmin();
	if (!admin) throw svelteError(500, 'Service role key not configured for this environment');

	// Does newTag already have a config row? Drives whether we update or merge.
	const { data: existingTarget, error: lookupErr } = await admin
		.from('composition_tag_targets')
		.select('tag')
		.eq('tag', newTag)
		.maybeSingle();
	if (lookupErr) throw svelteError(500, `Lookup failed: ${lookupErr.message}`);
	const merging = Boolean(existingTarget);

	// 1. Reconcile composition_tag_targets.
	if (merging) {
		// Keep newTag's existing row (curve + category). Just remove oldTag.
		const { error: delErr } = await admin
			.from('composition_tag_targets')
			.delete()
			.eq('tag', oldTag);
		if (delErr) throw svelteError(500, `Failed to drop old target: ${delErr.message}`);
	} else {
		const { error: updErr } = await admin
			.from('composition_tag_targets')
			.update({ tag: newTag, updated_at: new Date().toISOString() })
			.eq('tag', oldTag);
		if (updErr) throw svelteError(500, `Failed to rename target row: ${updErr.message}`);
	}

	// 2. Migrate player_composition_tags. Pull all (game_id, player_color) rows
	// for oldTag, re-insert them as newTag, then delete the originals.
	const { data: oldGameRows, error: fetchErr } = await admin
		.from('player_composition_tags')
		.select('game_id, player_color, created_at, created_by')
		.eq('tag', oldTag);
	if (fetchErr) throw svelteError(500, `Failed to fetch old game tags: ${fetchErr.message}`);

	const rows = oldGameRows ?? [];
	if (rows.length > 0) {
		const reinserts = rows.map((r) => ({
			game_id: r.game_id,
			player_color: r.player_color,
			tag: newTag,
			created_at: r.created_at,
			created_by: r.created_by
		}));
		const { error: upsertErr } = await admin
			.from('player_composition_tags')
			.upsert(reinserts, { onConflict: 'game_id,player_color,tag', ignoreDuplicates: true });
		if (upsertErr) {
			throw svelteError(500, `Failed to migrate game tags: ${upsertErr.message}`);
		}
		const { error: cleanupErr } = await admin
			.from('player_composition_tags')
			.delete()
			.eq('tag', oldTag);
		if (cleanupErr) {
			throw svelteError(500, `Failed to clean up old game tags: ${cleanupErr.message}`);
		}
	}

	return json({ ok: true, oldTag, newTag, merged: merging });
};
