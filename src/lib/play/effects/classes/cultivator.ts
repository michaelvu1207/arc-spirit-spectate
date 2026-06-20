import type { ClassAbility } from './types';

// Cultivator — the potential engine, super-linear ladder (2/3/4/5 → +1/+2/+5/+10):
// a 5-Cultivator pool MAXES potential (cap 10) in a single Cultivate. A lone
// Cultivator grants nothing. gainPotential is capped at 10.
export const ability: ClassAbility[] = [
	{
		on: 'onCultivate',
		breakpoints: [
			{ count: 2, actions: [{ kind: 'gainPotential', amount: 1 }] },
			{ count: 3, actions: [{ kind: 'gainPotential', amount: 2 }] },
			{ count: 4, actions: [{ kind: 'gainPotential', amount: 5 }] },
			{ count: 5, actions: [{ kind: 'gainPotential', amount: 10 }] }
		]
	}
];
