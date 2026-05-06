// Typed CRUD over the `compositions` table. Server-only — uses the service-role
// admin client. Mutations log a structured audit line to console (Vercel logs
// serve as the audit trail per the design plan).

import { getSupabaseAdmin } from './supabaseAdmin';
import {
	type Composition,
	type CompositionCreateInput,
	type CompositionUpdateInput,
	REFERENCE_NAME,
	validateCategory,
	validateColor,
	validateCurvePoints,
	validateDescription,
	validateName
} from '$lib/compositions/schema';

export class CompositionsServiceError extends Error {
	constructor(
		public code:
			| 'admin_unavailable'
			| 'duplicate_name'
			| 'not_found'
			| 'fk_in_use'
			| 'reserved_name'
			| 'unknown',
		message: string
	) {
		super(message);
		this.name = 'CompositionsServiceError';
	}
}

function audit(evt: string, payload: Record<string, unknown>): void {
	// Vercel function logs serve as the audit trail.
	// eslint-disable-next-line no-console
	console.log(JSON.stringify({ evt: `composition.${evt}`, ts: new Date().toISOString(), ...payload }));
}

function admin() {
	const a = getSupabaseAdmin();
	if (!a) throw new CompositionsServiceError('admin_unavailable', 'Service role key not configured');
	return a;
}

export async function listCompositions(opts?: { activeOnly?: boolean }): Promise<Composition[]> {
	const q = admin().from('compositions').select('*').order('name', { ascending: true });
	const { data, error } = opts?.activeOnly ? await q.eq('is_active', true) : await q;
	if (error) throw new CompositionsServiceError('unknown', error.message);
	return (data as Composition[]) ?? [];
}

export async function getComposition(id: string): Promise<Composition | null> {
	const { data, error } = await admin().from('compositions').select('*').eq('id', id).maybeSingle();
	if (error) throw new CompositionsServiceError('unknown', error.message);
	return (data as Composition | null) ?? null;
}

export async function getCompositionByName(name: string): Promise<Composition | null> {
	const { data, error } = await admin()
		.from('compositions')
		.select('*')
		.eq('name', name)
		.maybeSingle();
	if (error) throw new CompositionsServiceError('unknown', error.message);
	return (data as Composition | null) ?? null;
}

export async function createComposition(input: CompositionCreateInput): Promise<Composition> {
	const name = validateName(input.name);
	if (name === REFERENCE_NAME) {
		throw new CompositionsServiceError('reserved_name', 'reference baseline already exists');
	}
	const row = {
		name,
		category: validateCategory(input.category ?? null),
		color: validateColor(input.color ?? '#24d4ff'),
		ideal_curve_points: validateCurvePoints(input.ideal_curve_points ?? null),
		description: validateDescription(input.description ?? null),
		is_active: input.is_active ?? true
	};

	const { data, error } = await admin().from('compositions').insert(row).select().single();
	if (error) {
		if (error.code === '23505') {
			throw new CompositionsServiceError('duplicate_name', `composition "${name}" already exists`);
		}
		throw new CompositionsServiceError('unknown', error.message);
	}
	audit('create', { id: (data as Composition).id, name });
	return data as Composition;
}

export async function updateComposition(
	id: string,
	patch: CompositionUpdateInput
): Promise<Composition> {
	const updates: Record<string, unknown> = {};
	if (patch.name !== undefined) updates.name = validateName(patch.name);
	if (patch.category !== undefined) updates.category = validateCategory(patch.category);
	if (patch.color !== undefined) updates.color = validateColor(patch.color);
	if (patch.ideal_curve_points !== undefined)
		updates.ideal_curve_points = validateCurvePoints(patch.ideal_curve_points);
	if (patch.description !== undefined) updates.description = validateDescription(patch.description);
	if (patch.is_active !== undefined) updates.is_active = !!patch.is_active;

	if (Object.keys(updates).length === 0) {
		const existing = await getComposition(id);
		if (!existing) throw new CompositionsServiceError('not_found', `composition ${id} not found`);
		return existing;
	}

	const { data, error } = await admin()
		.from('compositions')
		.update(updates)
		.eq('id', id)
		.select()
		.maybeSingle();
	if (error) {
		if (error.code === '23505') {
			throw new CompositionsServiceError('duplicate_name', 'name conflicts with an existing composition');
		}
		throw new CompositionsServiceError('unknown', error.message);
	}
	if (!data) throw new CompositionsServiceError('not_found', `composition ${id} not found`);

	audit('update', { id, patch: Object.keys(updates) });
	return data as Composition;
}

export async function deleteComposition(id: string): Promise<void> {
	// FK on player_composition_tags is ON DELETE RESTRICT — caller must reassign first.
	const { error } = await admin().from('compositions').delete().eq('id', id);
	if (error) {
		if (error.code === '23503') {
			throw new CompositionsServiceError(
				'fk_in_use',
				'composition is tagged on existing games — reassign tags first'
			);
		}
		throw new CompositionsServiceError('unknown', error.message);
	}
	audit('delete', { id });
}

export async function countTagsForComposition(id: string): Promise<number> {
	const { count, error } = await admin()
		.from('player_composition_tags')
		.select('*', { count: 'exact', head: true })
		.eq('composition_id', id);
	if (error) throw new CompositionsServiceError('unknown', error.message);
	return count ?? 0;
}
