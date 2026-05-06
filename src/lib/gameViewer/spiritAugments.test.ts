import { describe, expect, test } from 'vitest';
import { buildSpiritAugmentRow } from './spiritAugments';
import type { PlayerSnapshot, RuneAsset } from '$lib/types';

const augmentAsset: RuneAsset = {
	id: 'augment-fighter',
	name: 'Fighter',
	origin_id: null,
	class_id: 'fighter',
	icon_path: 'runes/fighter.png'
};

const runeAsset: RuneAsset = {
	id: 'rune-forest',
	name: 'Forest',
	origin_id: 'forest',
	class_id: null,
	icon_path: 'runes/forest.png'
};

function player(overrides: Partial<PlayerSnapshot>): PlayerSnapshot {
	return {
		playerColor: 'Red',
		ttsUsername: null,
		selectedCharacter: 'Aurelia',
		navigationDestination: null,
		blood: 0,
		victoryPoints: 0,
		barrier: 4,
		maxTokens: 4,
		statusLevel: 1,
		statusToken: null,
		spirits: [],
		runes: [],
		handDraws: [],
		spiritRuneAttachments: [],
		dice: [],
		...overrides
	};
}

describe('buildSpiritAugmentRow', () => {
	test('returns class rune inventory and attached spirit augments, excluding origin runes', () => {
		const assets = new Map([
			[augmentAsset.id, augmentAsset],
			[runeAsset.id, runeAsset]
		]);

		const row = buildSpiritAugmentRow(
			player({
				runes: [
					{
						slotIndex: 1,
						hasRune: true,
						id: runeAsset.id,
						name: runeAsset.name,
						type: 'origin',
						originId: runeAsset.origin_id ?? undefined
					},
					{
						slotIndex: 2,
						hasRune: true,
						id: augmentAsset.id,
						name: augmentAsset.name,
						type: 'class',
						classId: augmentAsset.class_id ?? undefined
					}
				],
				spiritRuneAttachments: [
					{
						runeId: augmentAsset.id,
						spiritId: 'spirit-1',
						spiritSlotIndex: 3
					}
				]
			}),
			assets,
			(path) => `https://assets.example/${path}`
		);

			expect(row).toEqual([
				{
					key: 'inventory:augment-fighter:2:0',
					name: 'Fighter',
				imageUrl: 'https://assets.example/runes/fighter.png',
				location: 'Inventory'
			},
			{
				key: 'attached:augment-fighter:3:0',
				name: 'Fighter',
				imageUrl: 'https://assets.example/runes/fighter.png',
					location: 'Spirit 3'
				}
			]);
			expect(row).toHaveLength(2);
		});
	});
