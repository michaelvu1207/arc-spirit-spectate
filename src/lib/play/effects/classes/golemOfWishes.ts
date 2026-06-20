import type { ClassAbility } from './types';

// Golem of Wishes — "In combat, deflect 4 damage."
export const ability: ClassAbility[] = [
	{
		on: 'inCombat',
		breakpoints: [{ count: 1, actions: [{ kind: 'deflect', amount: 4 }] }]
	}
];
