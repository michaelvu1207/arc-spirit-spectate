import type { ClassAbility } from './types';

// Sharpshooter — DB-intended: "On summon, gain 1 Enchanted Attack. Your side may
// always attack at the same time as the enemy."
//
// The simultaneous-attack rule lives in combat.ts (`hasSimultaneousAttack`), which
// keys directly on Sharpshooter count >= 1 — it does NOT depend on the per-combat
// `stunImmune` flag. We still emit `setStunImmune` on summon: it surfaces the
// "you cannot be stunned" guarantee as a log line at summon time (no silent no-op)
// and backstops the simultaneous-strike intent.
export const ability: ClassAbility[] = [
	{
		on: 'onSpiritSummon',
		breakpoints: [
			{
				count: 1,
				actions: [{ kind: 'gainAttackDice', tier: 'enchanted', amount: 1 }, { kind: 'setStunImmune' }]
			}
		]
	}
];
