import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { normalizeCompositionTag } from '$lib/server/compositionTags';

type TagRow = {
	player_color: string;
	tag: string;
};

export const load: PageServerLoad = async ({ params, cookies }) => {
	const gameId = String(params.id ?? '').trim();
	if (!gameId) throw error(400, 'Missing game id');

	let isAdmin = false;
	try {
		isAdmin = isAdminRequest(cookies);
	} catch {
		isAdmin = false;
	}
	if (!isAdmin) {
		return {
			isAdmin: false,
			taggingConfigError: null,
			compositionTagsByColor: {} as Record<string, string[]>,
			tagOptions: [] as string[]
		};
	}

	const supabaseAdmin = getSupabaseAdmin();
	if (!supabaseAdmin) {
		return {
			isAdmin: true,
			taggingConfigError:
				'Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to `.env` to enable tagging.',
			compositionTagsByColor: {} as Record<string, string[]>,
			tagOptions: [] as string[]
		};
	}

	const [
		{ data: tagRows, error: fetchTagsError },
		{ data: tagOptionsRows, error: fetchTagOptionsError }
	] = await Promise.all([
		supabaseAdmin
			.from('player_composition_tags')
			.select('player_color, tag')
			.eq('game_id', gameId)
			.order('player_color', { ascending: true })
			.order('tag', { ascending: true }),
		supabaseAdmin.from('composition_tag_catalog').select('tag').order('tag', { ascending: true })
	]);

	if (fetchTagsError) {
		throw error(500, `Failed to load composition tags: ${fetchTagsError.message}`);
	}
	if (fetchTagOptionsError) {
		throw error(500, `Failed to load tag options: ${fetchTagOptionsError.message}`);
	}

	const compositionTagsByColor: Record<string, string[]> = {};
	for (const row of (tagRows as TagRow[] | null) ?? []) {
		const list = compositionTagsByColor[row.player_color] ?? [];
		list.push(row.tag);
		compositionTagsByColor[row.player_color] = list;
	}

	const tagOptions = ((tagOptionsRows as Array<{ tag: string }> | null) ?? []).map((r) => r.tag);

	return {
		isAdmin: true,
		taggingConfigError: null,
		compositionTagsByColor,
		tagOptions
	};
};

export const actions: Actions = {
	addTag: async ({ request, params, cookies }) => {
		const gameId = String(params.id ?? '').trim();
		if (!gameId) return fail(400, { error: 'Missing game id.' });
		try {
			if (!isAdminRequest(cookies)) return fail(403, { error: 'Not authorized.' });
		} catch {
			return fail(403, { error: 'Not authorized.' });
		}

		const supabaseAdmin = getSupabaseAdmin();
		if (!supabaseAdmin)
			return fail(500, { error: 'Missing SUPABASE_SERVICE_ROLE_KEY on the server.' });

		const form = await request.formData();
		const playerColor = String(form.get('playerColor') ?? '').trim();
		const rawTag = String(form.get('tag') ?? '');
		const tag = normalizeCompositionTag(rawTag);

		if (!playerColor) return fail(400, { error: 'Missing player color.' });
		if (!tag) return fail(400, { error: 'Tag cannot be empty.' });

		const { error: upsertError } = await supabaseAdmin
			.from('player_composition_tags')
			.upsert(
				{ game_id: gameId, player_color: playerColor, tag },
				{ onConflict: 'game_id,player_color,tag' }
			);

		if (upsertError) {
			throw error(500, `Failed to save tag: ${upsertError.message}`);
		}

		return { ok: true };
	},
	removeTag: async ({ request, params, cookies }) => {
		const gameId = String(params.id ?? '').trim();
		if (!gameId) return fail(400, { error: 'Missing game id.' });
		try {
			if (!isAdminRequest(cookies)) return fail(403, { error: 'Not authorized.' });
		} catch {
			return fail(403, { error: 'Not authorized.' });
		}

		const supabaseAdmin = getSupabaseAdmin();
		if (!supabaseAdmin)
			return fail(500, { error: 'Missing SUPABASE_SERVICE_ROLE_KEY on the server.' });

		const form = await request.formData();
		const playerColor = String(form.get('playerColor') ?? '').trim();
		const rawTag = String(form.get('tag') ?? '');
		const tag = normalizeCompositionTag(rawTag);

		if (!playerColor) return fail(400, { error: 'Missing player color.' });
		if (!tag) return fail(400, { error: 'Missing tag.' });

		const { error: deleteError } = await supabaseAdmin
			.from('player_composition_tags')
			.delete()
			.eq('game_id', gameId)
			.eq('player_color', playerColor)
			.eq('tag', tag);

		if (deleteError) {
			throw error(500, `Failed to remove tag: ${deleteError.message}`);
		}

		return { ok: true };
	}
};
