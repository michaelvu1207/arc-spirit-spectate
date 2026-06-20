import type { ClassAbility, ClassHandler } from './types';

/**
 * "Gain 4 Initiative. In the Battle Step, roll your attack twice and take the higher
 * roll." Both halves are deterministic + built-in: +4 initiative and the
 * `attackRollAdvantage` flag that makes `rollAttack` roll twice and keep the higher.
 */
const darkFighterInCombat: ClassHandler = (ctx) => {
	ctx.player.initiative += 4;
	ctx.player.attackRollAdvantage = true;
	ctx.log.push('Gained 4 initiative; will roll attack twice and take the higher.');
};

export const ability: ClassAbility[] = [{ on: 'inCombat', run: darkFighterInCombat }];
