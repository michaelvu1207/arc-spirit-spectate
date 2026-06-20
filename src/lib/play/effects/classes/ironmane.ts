import type { ClassAbility } from './types';

// Ironmane — "You may initiate Monster Combat two times." Grants a +1 Monster-Combat
// allowance each round via extraActions['combat']; re-granted onNavigate.
export const ability: ClassAbility[] = [
	{
		on: 'onNavigate',
		breakpoints: [{ count: 1, actions: [{ kind: 'extraAction', actionKey: 'combat', amount: 1 }] }]
	}
];
