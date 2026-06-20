import { runAction } from '../actions';
import type { ClassAbility, ClassDecisions } from './types';

// Arc Mage — "When you cultivate, you may discard 4 attack dice to gain 1 Arcane
// Attack Dice." (CHANGED: was 3 → now 4.) Gated on ≥4 dice, then an opt-in Yes/No
// card (`arcMageTrade`). REPEATABLE: each Yes re-offers the choice while the player
// still holds ≥4 dice, so they can convert multiple sets in one cultivate.
const TRADE_COST = 4;

const tradePrompt = `When you cultivate, you may discard ${TRADE_COST} attack dice to gain 1 Arcane Attack Dice.`;
const tradeOptions = [
	{ id: 'yes', label: `Discard ${TRADE_COST} dice → 1 Arcane` },
	{ id: 'no', label: 'No' }
];

export const ability: ClassAbility[] = [
	{
		on: 'onCultivate',
		breakpoints: [
			{
				count: 1,
				actions: [
					{
						kind: 'conditional',
						when: { kind: 'hasAttackDice', amount: TRADE_COST },
						then: [
							{
								kind: 'choose',
								decisionKind: 'arcMageTrade',
								prompt: tradePrompt,
								options: tradeOptions
							}
						]
					}
				]
			}
		]
	}
];

// Colocated resolver for the opt-in Yes/No card. On Yes, discard 4 → gain 1 Arcane,
// then re-offer the choice if the player still holds ≥4 dice (repeatable). The
// runtime removes the just-resolved decision by id AFTER this runs, so the freshly
// enqueued `choose` (new id) survives and surfaces as the next decision card.
export const decisions: ClassDecisions = {
	arcMageTrade(ctx, optionId) {
		if (optionId !== 'yes') return;
		runAction(ctx, { kind: 'discardAttackDice', amount: TRADE_COST });
		runAction(ctx, { kind: 'gainAttackDice', tier: 'arcane', amount: 1 });
		if (ctx.player.attackDice.length >= TRADE_COST) {
			runAction(ctx, {
				kind: 'choose',
				decisionKind: 'arcMageTrade',
				prompt: tradePrompt,
				options: tradeOptions
			});
		}
	}
};
