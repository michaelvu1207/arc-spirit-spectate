import { describe, expect, it } from 'vitest';
import { buildAbilityInteractions, type AbilityInteractionSource } from './abilityInteractions';

describe('buildAbilityInteractions', () => {
	it('returns an empty list when the player has nothing to resolve', () => {
		expect(buildAbilityInteractions({})).toEqual([]);
	});

	it('maps each owner field to its interaction kind', () => {
		const source: AbilityInteractionSource = {
			pendingCorruptionDiscard: { count: 2, reason: 'corrupted' },
			pendingAwakenReward: { grants: [{ kind: 'vp', amount: 1, source: 'Golden Ruler' }] },
			pendingDecisions: [
				{ id: 'd1', source: 'class', kind: 'purifierAugment', prompt: 'Pick', options: [{ id: 'a', label: 'A' }] }
			],
			unplacedAugments: [{ runeId: 'r1', name: 'Spirit Augment' }],
			awakenOffers: [{ slotIndex: 5, spiritName: 'Faerie', requirement: 'Discard a relic', discardCount: 1, options: [] }],
			awakenLocked: [{ slotIndex: 6, spiritName: 'Locked', requirement: 'Needs a relic' }],
			manualPrompts: [{ id: 'm1', source: 'awaken', text: 'Resolve by hand' }]
		};
		const kinds = buildAbilityInteractions(source).map((i) => i.kind);
		// Priority order: forced obligations → choices → augments → offers → hints → manual.
		expect(kinds).toEqual([
			'corruptionDiscard',
			'reward',
			'choice',
			'augment',
			'awaken',
			'awakenLocked',
			'manual'
		]);
	});

	it('omits empty/zero obligations', () => {
		const kinds = buildAbilityInteractions({
			pendingCorruptionDiscard: { count: 0 },
			pendingAwakenReward: { grants: [] },
			unplacedAugments: []
		}).map((i) => i.kind);
		expect(kinds).toEqual([]);
	});

	it('emits one choice per pending decision', () => {
		const result = buildAbilityInteractions({
			pendingDecisions: [
				{ id: 'd1', source: 'class', kind: 'a', prompt: 'P1', options: [] },
				{ id: 'd2', source: 'class', kind: 'b', prompt: 'P2', options: [] }
			]
		});
		expect(result).toHaveLength(2);
		expect(result.every((i) => i.kind === 'choice')).toBe(true);
	});
});
