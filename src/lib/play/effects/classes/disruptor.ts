import type { ClassAbility, ClassHandler } from './types';

/**
 * "If the opponent has higher initiative, when you Take Damage, half it (rounding
 * up)." Reads the opposing seat's stored initiative (or the group's pooled total via
 * `combat.opponentInitiative`); if it exceeds this player's, flag the halve.
 */
const disruptorOnTakeDamage: ClassHandler = (ctx) => {
	const opponentSeat = ctx.combat?.opponent ?? ctx.opponent;
	const opponent = opponentSeat ? ctx.state.players[opponentSeat] : undefined;
	const opponentInitiative = ctx.combat?.opponentInitiative ?? opponent?.initiative;
	if (opponentInitiative != null && opponentInitiative > ctx.player.initiative) {
		ctx.player.halveIncoming = true;
		ctx.log.push('Opponent has higher initiative — incoming damage is halved.');
	}
};

export const ability: ClassAbility[] = [{ on: 'onTakeDamage', run: disruptorOnTakeDamage }];
