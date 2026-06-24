import type { ClassAbility } from './types';

// Cultivator — the max barrier engine, super-linear ladder (2/3/4/5 → +1/+2/+5/+10):
// a 5-Cultivator pool MAXES max barrier (cap 10) in a single Cultivate. A lone
// Cultivator grants nothing. gainMaxBarrier is capped at 10.
export const ability: ClassAbility[] = [
	{
		on: 'onCultivate',
		breakpoints: [
			{ count: 2, actions: [{ kind: 'gainMaxBarrier', amount: 1 }] },
			{ count: 3, actions: [{ kind: 'gainMaxBarrier', amount: 2 }] },
			{ count: 4, actions: [{ kind: 'gainMaxBarrier', amount: 5 }] },
			{ count: 5, actions: [{ kind: 'gainMaxBarrier', amount: 10 }] }
		]
	}
];
