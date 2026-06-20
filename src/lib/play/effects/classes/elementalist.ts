import type { ClassAbility } from './types';

// Elementalist — dice QUALITY. Super-linear (2/3/4/5 → upgrade 1/2/5/10 times) per
// Rest; a lone Elementalist does nothing. Reaching 4–5 needs Elementalist augments.
export const ability: ClassAbility[] = [
	{
		on: 'onRest',
		breakpoints: [
			{ count: 2, actions: [{ kind: 'upgradeDice', times: 1 }] },
			{ count: 3, actions: [{ kind: 'upgradeDice', times: 2 }] },
			{ count: 4, actions: [{ kind: 'upgradeDice', times: 5 }] },
			{ count: 5, actions: [{ kind: 'upgradeDice', times: 10 }] }
		]
	}
];
