import { fetchAssetsData, type AssetsData } from '$lib/supabase';
import { normalizeAwaken, type AwakenRuneInfo } from '../awakenConditions';
import type { PlayCatalog, PlayCatalogClass, PlayCatalogRune } from '../types';

const CACHE_TTL_MS = 60_000;

let cachedCatalog: PlayCatalog | null = null;
let cachedAt = 0;

/** Resolve a rune's catalog `kind` from its FK columns (matches PlayCatalogRune). */
function runeKind(rune: { class_id: string | null; origin_id: string | null }): PlayCatalogRune['kind'] {
	return rune.class_id ? 'augment' : rune.origin_id ? 'rune' : 'relic';
}

/**
 * Count how many times each role NAME occurs across a spirit's trait id list.
 *
 * A single spirit can legitimately grant the SAME role multiple times (e.g. an
 * Astrobiologist granting 3 Elementalists), so we ACCUMULATE per resolved name.
 * The old `Object.fromEntries(ids.map((id) => [name, 1]))` collapsed repeats —
 * duplicate names overwrote each other down to a single `1` — undercounting any
 * spirit that grants 2+ of one role.
 */
function countRolesByName(ids: string[], names: Map<string, string>): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const id of ids) {
		const name = names.get(id) ?? id;
		counts[name] = (counts[name] ?? 0) + 1;
	}
	return counts;
}

/**
 * Pure builder: turn raw {@link AssetsData} into the engine {@link PlayCatalog}.
 * Side-effect free + I/O free so it can be unit-tested directly with fixtures.
 */
export function buildPlayCatalog(assets: AssetsData): PlayCatalog {
	const classNames = new Map(assets.classes.map((entry) => [entry.id, entry.name]));
	const originNames = new Map(assets.origins.map((entry) => [entry.id, entry.name]));
	// Rune name+kind by id, for normalizing each spirit's awaken rune cost.
	const runesById = new Map<string, AwakenRuneInfo>(
		assets.runes.map((rune) => [rune.id, { name: rune.name, kind: runeKind(rune) }])
	);

	return {
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
				classes: countRolesByName(spirit.traits?.class_ids ?? [], classNames),
				origins: countRolesByName(spirit.traits?.origin_ids ?? [], originNames),
				awaken: normalizeAwaken(spirit.awaken_condition, runesById)
			})),
		runes: [...assets.runes]
			.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
			.map((rune) => ({
				id: rune.id,
				name: rune.name,
				kind: runeKind(rune),
				originId: rune.origin_id,
				classId: rune.class_id
			})),
		classes: [...assets.classes]
			.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
			.map(
				(klass): PlayCatalogClass => ({
					id: klass.id,
					name: klass.name,
					classType: klass.class_type ?? null,
					isSpecial: klass.is_special ?? false,
					// Carry the breakpoint schema verbatim — later phases read it.
					effectSchema: klass.effect_schema ?? null
				})
			),
		dice: [
			...assets.customDice
				.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
				.map((die) => ({
					id: die.id,
					name: die.name,
					diceType: die.dice_type,
					// Numeric damage per face; special glyphs (e.g. "⧉") count as 0.
					sides: [...die.sides]
						.sort((a, b) => a.side_number - b.side_number)
						.map((side) => {
							const value = Number.parseFloat((side.reward_value ?? '').trim());
							return Number.isFinite(value) ? value : 0;
						})
				})),
			{
				id: 'defense_dice',
				name: 'Defense Dice',
				diceType: 'defense' as const,
				sides: []
			}
		],
		monsters: [...assets.monsters]
			.map((monster) => ({
				id: monster.id,
				name: monster.name,
				damage: typeof monster.damage === 'number' ? monster.damage : 0,
				barrier: typeof monster.barrier === 'number' ? monster.barrier : 1,
				rewardTrack: Array.isArray(monster.reward_track) ? monster.reward_track : [],
				dicePool: Array.isArray(monster.dice_pool) ? monster.dice_pool : [],
				chooseAmount: typeof monster.choose_amount === 'number' ? monster.choose_amount : 2,
				stage: typeof monster.stage === 'number' ? monster.stage : Number(monster.stage) || 1,
				order: typeof monster.order_num === 'number' ? monster.order_num : 0
			}))
			// The escalation ladder: weakest first. Sort by stage, then the difficulty
			// rung (order_num) — every row shares the same name, so name can't order them.
			.sort((a, b) => a.stage - b.stage || a.order - b.order || a.name.localeCompare(b.name)),
		// Per-location reward rows drive the in-game location interaction menu.
		locations: [...assets.gameLocations].map((loc) => ({
			name: loc.name,
			originId: loc.origin_id,
			rewardRows: Array.isArray(loc.reward_rows) ? loc.reward_rows : []
		})),
		// Bag copy-counts by cost (the Complete edition's editions.cost_duplicates).
		costDuplicates: assets.costDuplicates ?? null
	};
}

export async function loadPlayCatalog(): Promise<PlayCatalog> {
	const now = Date.now();
	if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) {
		return cachedCatalog;
	}

	const assets = await fetchAssetsData();
	const catalog = buildPlayCatalog(assets);

	cachedCatalog = catalog;
	cachedAt = now;
	return catalog;
}
