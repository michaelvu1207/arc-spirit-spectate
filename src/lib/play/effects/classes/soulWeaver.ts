import type { ClassAbility } from './types';

// Soul Weaver — DB intent:
//   (1) "On a Spirit World or Abyss Summon, you may put all spirits back and draw
//       again." → the redraw mechanic. `redrawAvailable` is armed when a summon DRAW
//       OPENS (runtime.startDraw, gated on awakened Soul Weaver count) so the ↻ Redraw
//       button shows BEFORE the first pick, and is cleared once the player picks a
//       spirit (runtime spawnHandSpirit). It is NOT re-armed per-summon — hence no
//       onSpiritSummon breakpoint here.
//   (2) At >=2, your side may always attack at the same time as the enemy
//       (setStunImmune backs the count-based rule in combat.ts).
//   (3) At >=3, on Rest restore 2 health.
export const ability: ClassAbility[] = [
	{
		on: 'onRest',
		breakpoints: [
			{ count: 2, actions: [{ kind: 'setStunImmune' }] },
			{ count: 3, actions: [{ kind: 'setStunImmune' }, { kind: 'restoreBarrier', amount: 2 }] }
		]
	}
];
