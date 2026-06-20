import { describe, expect, test } from 'vitest';
import type {
	AssetsData
} from '$lib/supabase';
import type {
	ClassTrait,
	HexSpiritAsset,
	RuneAsset
} from '$lib/types';
import { buildPlayCatalog } from './catalog';
import { WILDCARD_RUNE_IDS } from '../awakenConditions';
import type { NormalizedAwaken } from '../types';

// ── Real DB sample ids (confirmed against arc-spirits-rev2) ───────────────────
const ANY_RELIC = WILDCARD_RUNE_IDS.anyRelic; // 19d72567-… ("Any Relic")
const ANY_RUNE = WILDCARD_RUNE_IDS.anyRune; // 7ca279f0-… ("Any Rune")
const TEAPOT = 'a6111d01-2c55-4b1f-854a-32887d92b8e1'; // relic (no class_id/origin_id)
const FLOWER = '690a7e3b-5737-4494-bb8a-b58bee13f473'; // relic
const SWORDSMAN = 'efa4b29a-06f0-43af-bd11-d60c180e793e'; // augment (class_id set)
const FOREST = '34b2a963-f8c6-4fc0-8272-ddc50b0036a8'; // rune (origin_id set)

// Runes mirroring the real `runes` table FK columns (drives kind resolution).
const RUNES: RuneAsset[] = [
	{ id: ANY_RELIC, name: 'Any Relic', origin_id: null, class_id: null, icon_path: null },
	{ id: ANY_RUNE, name: 'Any Rune', origin_id: 'd459ae53-…', class_id: null, icon_path: null },
	{ id: TEAPOT, name: 'Teapot', origin_id: null, class_id: null, icon_path: null },
	{ id: FLOWER, name: 'Flower', origin_id: null, class_id: null, icon_path: null },
	{ id: SWORDSMAN, name: 'Swordsman', origin_id: null, class_id: 'dd17c072-…', icon_path: null },
	{ id: FOREST, name: 'Forest', origin_id: 'ad555f03-…', class_id: null, icon_path: null }
];

function spirit(overrides: Partial<HexSpiritAsset> & Pick<HexSpiritAsset, 'id' | 'name'>): HexSpiritAsset {
	return {
		cost: 1,
		traits: { class_ids: [], origin_ids: [] },
		awaken_condition: null,
		game_print_image_path: null,
		art_raw_image_path: null,
		...overrides
	};
}

const FIGHTER_CLASS: ClassTrait = {
	id: 'fighter-id',
	name: 'Fighter',
	position: 1,
	icon_png: null,
	color: '#fff',
	description: 'Deal extra damage.',
	effect_schema: [
		{ count: 2, color: 'bronze', description: '+1 damage', effects: [{ type: 'combatBonus' }] },
		{ count: 4, color: 'silver', description: '+2 damage' }
	],
	footer: null,
	class_type: 'combat',
	is_special: false
};

const ELEMENTALIST_CLASS: ClassTrait = {
	id: 'elementalist-id',
	name: 'Elementalist',
	position: 2,
	icon_png: null,
	color: '#5cdfff',
	description: 'Elemental synergy.',
	effect_schema: [{ count: 2, color: 'bronze', description: 'synergy', effects: [] }],
	footer: null,
	class_type: 'common',
	is_special: false
};

// Spirits exercising every awaken branch.
const SPIRITS: HexSpiritAsset[] = [
	// rune_cost with a repeated wildcard uuid → count 2, wildcard true.
	spirit({
		id: 'comet-caller',
		name: 'Comet Caller',
		awaken_condition: { type: 'rune_cost', rune_ids: [ANY_RELIC, ANY_RELIC] }
	}),
	// mixed cost: 2 Teapot (relic) + 1 Any Relic wildcard (mirrors Water Dragon).
	spirit({
		id: 'water-dragon',
		name: 'Water Dragon',
		awaken_condition: { type: 'rune_cost', rune_ids: [TEAPOT, TEAPOT, ANY_RELIC] }
	}),
	// text awaken → carried verbatim.
	spirit({
		id: 'lightcatcher',
		name: 'Lightcatcher',
		awaken_condition: { type: 'text', text: 'Discard 3 Elementalist Traits (Spirits/Augments)' }
	}),
	// no awaken → undefined.
	spirit({ id: 'plain', name: 'Plain Spirit', awaken_condition: null }),
	// grants the SAME class 3× plus one Fighter → role counts must be summed,
	// not collapsed to 1 (the Astrobiologist undercount regression).
	spirit({
		id: 'astrobiologist',
		name: 'Astrobiologist',
		traits: {
			class_ids: ['elementalist-id', 'elementalist-id', 'elementalist-id', 'fighter-id'],
			origin_ids: []
		}
	})
];

function emptyAssets(): AssetsData {
	return {
		spirits: [],
		runes: [],
		customDice: [],
		monsters: [],
		statusIcons: [],
		iconPool: [],
		gameLocations: [],
		guardians: [],
		classes: [],
		origins: [],
		costDuplicates: null
	};
}

function buildCatalog() {
	return buildPlayCatalog({
		...emptyAssets(),
		spirits: SPIRITS,
		runes: RUNES,
		classes: [FIGHTER_CLASS, ELEMENTALIST_CLASS]
	});
}

function awakenOf(name: string): NormalizedAwaken | undefined {
	const catalog = buildCatalog();
	return catalog.spirits.find((s) => s.name === name)?.awaken;
}

describe('buildPlayCatalog — normalized awaken', () => {
	test('repeated wildcard uuid groups into one requirement with count 2', () => {
		const awaken = awakenOf('Comet Caller');
		expect(awaken).toEqual({
			kind: 'rune_cost',
			runes: [
				{ runeId: ANY_RELIC, name: 'Any Relic', kind: 'relic', count: 2, wildcard: true }
			]
		});
	});

	test('mixed cost groups repeats and resolves kinds + wildcard flags', () => {
		const awaken = awakenOf('Water Dragon');
		expect(awaken).toEqual({
			kind: 'rune_cost',
			runes: [
				{ runeId: TEAPOT, name: 'Teapot', kind: 'relic', count: 2, wildcard: false },
				{ runeId: ANY_RELIC, name: 'Any Relic', kind: 'relic', count: 1, wildcard: true }
			]
		});
	});

	test('text awaken is carried verbatim', () => {
		expect(awakenOf('Lightcatcher')).toEqual({
			kind: 'text',
			text: 'Discard 3 Elementalist Traits (Spirits/Augments)'
		});
	});

	test('a spirit with no awaken_condition has undefined awaken', () => {
		expect(awakenOf('Plain Spirit')).toBeUndefined();
	});
});

describe('buildPlayCatalog — classes', () => {
	test('carries class effect_schema verbatim with metadata', () => {
		const catalog = buildCatalog();
		const fighter = catalog.classes.find((c) => c.name === 'Fighter');
		expect(fighter).toEqual({
			id: 'fighter-id',
			name: 'Fighter',
			classType: 'combat',
			isSpecial: false,
			effectSchema: FIGHTER_CLASS.effect_schema
		});
	});

	test('sums repeated role grants from one spirit (Astrobiologist 3× Elementalist regression)', () => {
		const catalog = buildCatalog();
		const astro = catalog.spirits.find((s) => s.name === 'Astrobiologist');
		// Three Elementalist class_ids must total 3 (not collapse to 1), and a
		// distinct Fighter grant is counted alongside it.
		expect(astro?.classes).toEqual({ Elementalist: 3, Fighter: 1 });
	});
});

describe('buildPlayCatalog — rune kind resolution', () => {
	test('resolves augment (class_id), rune (origin_id), and relic (neither)', () => {
		const catalog = buildCatalog();
		const byId = new Map(catalog.runes.map((r) => [r.id, r]));
		expect(byId.get(SWORDSMAN)?.kind).toBe('augment');
		expect(byId.get(FOREST)?.kind).toBe('rune');
		expect(byId.get(TEAPOT)?.kind).toBe('relic');
	});
});
