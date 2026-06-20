import { runAction } from '../actions';
import type { ClassAbility, ClassDecisions } from './types';

// Strategist — "On rest, you may discard 3 attack dice to gain 1 Spirit Augment."
// Gated on holding ≥3 dice, then an opt-in Yes/No card resolved by `strategistTrade`.
export const ability: ClassAbility[] = [
	{
		on: 'onRest',
		breakpoints: [
			{
				count: 1,
				actions: [
					{
						kind: 'conditional',
						when: { kind: 'hasAttackDice', amount: 3 },
						then: [
							{
								kind: 'choose',
								decisionKind: 'strategistTrade',
								prompt: 'On rest, you may discard 3 attack dice to gain 1 Spirit Augment.',
								options: [
									{ id: 'yes', label: 'Discard 3 dice → 1 Augment' },
									{ id: 'no', label: 'No' }
								]
							}
						]
					}
				]
			}
		]
	}
];

// Colocated resolver for the opt-in Yes/No card.
export const decisions: ClassDecisions = {
	strategistTrade(ctx, optionId) {
		if (optionId === 'yes') {
			runAction(ctx, { kind: 'discardAttackDice', amount: 3 });
			runAction(ctx, { kind: 'gainAugment', amount: 1 });
		}
	}
};
