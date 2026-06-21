import { describe, expect, test } from 'vitest';
import { buildSpiritAugmentRow } from './spiritAugments';
import type { PlayerSnapshot, MatAsset } from '$lib/types';

const augmentAsset: MatAsset = {
	id: 'augment-fighter',
	name: 'Fighter',
	origin_id: null,
	icon_path: 'runes/fighter.png'
};

const runeAsset: MatAsset = {
	id: 'rune-forest',
	name: 'Forest',
	origin_id: 'forest',
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
		mats: [],
		handDraws: [],
		spiritAugmentAttachments: [],
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
				mats: [
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
						classId: 'fighter'
					}
				],
				spiritAugmentAttachments: [
					{
						runeId: augmentAsset.id,
						spiritId: 'spirit-1',
						spiritSlotIndex: 3,
						classId: 'fighter'
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
