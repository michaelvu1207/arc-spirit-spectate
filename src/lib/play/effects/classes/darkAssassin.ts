import type { ClassAbility, ClassHandler } from './types';

/**
 * Dark Assassin — "For every Cursed Spirit trait you have, gain 2 Attack Damage."
 *
 * Bespoke `inCombat` handler: sum the `Cursed Spirit` trait count across the
 * player's face-up (awakened) spirits and add `2 * count` to the per-combat
 * `combatDamageBonus` read by `rollAttack`. UX channel: a passive combat number
 * plus a log line, so it is never a silent no-op when Cursed Spirit traits are
 * present. Zero Cursed Spirit traits ⇒ untouched, no log.
 */
const darkAssassinInCombat: ClassHandler = (ctx) => {
	const cursedSpirits = ctx.player.spirits.reduce(
		(sum, s) => (s.isFaceDown ? sum : sum + (s.classes?.['Cursed Spirit'] ?? 0)),
		0
	);
	if (cursedSpirits > 0) {
		const bonus = 2 * cursedSpirits;
		ctx.player.combatDamageBonus += bonus;
		ctx.log.push(`Dark Assassin — +${bonus} combat damage from ${cursedSpirits} Cursed Spirit trait(s).`);
	}
};

export const ability: ClassAbility[] = [{ on: 'inCombat', run: darkAssassinInCombat }];
