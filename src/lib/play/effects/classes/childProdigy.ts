import type { ClassAbility } from './types';

// Child Prodigy — "You may do ALL location interactions up to two times." +1 per-row
// allowance via extraActions['locationInteraction']; re-granted onNavigate.
export const ability: ClassAbility[] = [
	{
		on: 'onNavigate',
		breakpoints: [{ count: 1, actions: [{ kind: 'extraAction', actionKey: 'locationInteraction', amount: 1 }] }]
	}
];
