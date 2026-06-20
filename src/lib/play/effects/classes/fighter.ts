import type { ClassAbility } from './types';

// Fighter — the dice engine. SUPER-LINEAR breakpoints (counts 2/3/4/5 → +1/+2/+5/+10
// dice) so stacking Fighters pays off far more than repeat-resting a small pool: a
// 5-Fighter pool fills the entire 10-dice cap in ONE rest. Rewards action economy.
export const ability: ClassAbility[] = [
	{
		on: 'onRest',
		breakpoints: [
			{ count: 2, actions: [{ kind: 'gainAttackDice', tier: 'basic', amount: 1 }] },
			{ count: 3, actions: [{ kind: 'gainAttackDice', tier: 'basic', amount: 2 }] },
			{ count: 4, actions: [{ kind: 'gainAttackDice', tier: 'basic', amount: 5 }] },
			{ count: 5, actions: [{ kind: 'gainAttackDice', tier: 'basic', amount: 10 }] }
		]
	}
];
