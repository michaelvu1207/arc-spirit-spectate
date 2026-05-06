import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';

// GET /admin/composition-analysis/health
// Verifies dual-write integrity between the new compositions table and the
// legacy `tag` string columns. Returns drift / orphan / missing counts so a
// post-deploy curl can confirm migration consistency.

export const GET: RequestHandler = async ({ cookies }) => {
	if (!isAdminRequest(cookies)) throw svelteError(401, 'admin auth required');
	const admin = getSupabaseAdmin();
	if (!admin) throw svelteError(500, 'service role not configured');

	const [
		{ data: compositions, error: compErr },
		{ data: targetRows, error: targetErr },
		{ data: tagRows, error: tagErr }
	] = await Promise.all([
		admin.from('compositions').select('id, name'),
		admin.from('composition_tag_targets').select('tag, composition_id'),
		admin.from('player_composition_tags').select('tag, composition_id')
	]);

	if (compErr) throw svelteError(500, `compositions read failed: ${compErr.message}`);
	if (targetErr) throw svelteError(500, `targets read failed: ${targetErr.message}`);
	if (tagErr) throw svelteError(500, `tags read failed: ${tagErr.message}`);

	const compsByName = new Map<string, string>();
	const compsById = new Map<string, string>();
	for (const c of (compositions as Array<{ id: string; name: string }> | null) ?? []) {
		compsByName.set(c.name, c.id);
		compsById.set(c.id, c.name);
	}

	let driftTargets = 0;
	let nullCompIdTargets = 0;
	for (const r of (targetRows as Array<{ tag: string; composition_id: string | null }> | null) ?? []) {
		if (r.composition_id === null) {
			nullCompIdTargets++;
			continue;
		}
		const expected = compsByName.get(r.tag);
		if (expected !== r.composition_id) driftTargets++;
	}

	let driftPlayerTags = 0;
	let nullCompIdTags = 0;
	let orphanTags = 0;
	for (const r of (tagRows as Array<{ tag: string; composition_id: string | null }> | null) ?? []) {
		if (r.composition_id === null) {
			nullCompIdTags++;
			continue;
		}
		const namedFromComp = compsById.get(r.composition_id);
		if (!namedFromComp) {
			orphanTags++;
			continue;
		}
		if (namedFromComp !== r.tag) driftPlayerTags++;
	}

	const drift_count = driftTargets + driftPlayerTags;
	const orphan_tags = orphanTags;
	const missing_compositions = nullCompIdTargets + nullCompIdTags;

	return json({
		ok: drift_count === 0 && orphan_tags === 0 && missing_compositions === 0,
		drift_count,
		orphan_tags,
		missing_compositions,
		details: {
			drift_in_targets: driftTargets,
			drift_in_player_tags: driftPlayerTags,
			null_composition_id_in_targets: nullCompIdTargets,
			null_composition_id_in_player_tags: nullCompIdTags
		},
		composition_count: compsByName.size
	});
};
