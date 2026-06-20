import type { ClassAbility } from './types';

// Aquamaiden — "When you Take Damage, take 3 less damage."
export const ability: ClassAbility[] = [
	{
		on: 'onTakeDamage',
		breakpoints: [{ count: 1, actions: [{ kind: 'reduceIncomingDamage', amount: 3 }] }]
	}
];
