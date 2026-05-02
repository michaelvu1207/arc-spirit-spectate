import { fetchAssetsData } from '$lib/supabase';
import type { PlayCatalog } from '../types';

const CACHE_TTL_MS = 60_000;

let cachedCatalog: PlayCatalog | null = null;
let cachedAt = 0;

export async function loadPlayCatalog(): Promise<PlayCatalog> {
	const now = Date.now();
	if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) {
		return cachedCatalog;
	}

	const assets = await fetchAssetsData();
	const classNames = new Map(assets.classes.map((entry) => [entry.id, entry.name]));
	const originNames = new Map(assets.origins.map((entry) => [entry.id, entry.name]));
	const catalog: PlayCatalog = {
		guardians: [...assets.guardians]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((guardian) => ({
				id: guardian.id,
				name: guardian.name,
				originId: guardian.origin_id
			})),
		spirits: [...assets.spirits]
			.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
			.map((spirit) => ({
				id: spirit.id,
				name: spirit.name,
				cost: spirit.cost,
				classes: Object.fromEntries(
					(spirit.traits?.class_ids ?? []).map((id) => [classNames.get(id) ?? id, 1])
				),
				origins: Object.fromEntries(
					(spirit.traits?.origin_ids ?? []).map((id) => [originNames.get(id) ?? id, 1])
				)
			})),
		runes: [...assets.runes]
			.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
			.map((rune) => ({
				id: rune.id,
				name: rune.name,
				kind: rune.class_id ? 'augment' : rune.origin_id ? 'rune' : 'relic',
				originId: rune.origin_id,
				classId: rune.class_id
			})),
		dice: [
			...assets.customDice
				.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
				.map((die) => ({
					id: die.id,
					name: die.name,
					diceType: die.dice_type
				})),
			{
				id: 'defense_dice',
				name: 'Defense Dice',
				diceType: 'defense' as const
			}
		]
	};

	cachedCatalog = catalog;
	cachedAt = now;
	return catalog;
}
