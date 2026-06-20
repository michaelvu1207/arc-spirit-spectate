import type { ClassAbility } from './types';

// Blood Hunter — "In Combat, deal 1 damage per Arcane Blood (max 4)."
export const ability: ClassAbility[] = [
	{
		on: 'inCombat',
		breakpoints: [{ count: 1, actions: [{ kind: 'combatBonusFromArcaneBlood', max: 4 }] }]
	}
];
