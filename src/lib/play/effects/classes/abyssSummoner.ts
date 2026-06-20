import { runAction } from '../actions';
import type { ClassAbility, ClassHandler } from './types';

/**
 * "In the Floral Patch, you may draw 3 and summon 1 abyss spirit, then awaken it."
 * Offered as an opt-in decision only when the player navigated to the Floral Patch;
 * the runtime's `resolveDecision` honors Yes by starting an Abyss draw flagged
 * `autoAwaken`. Gated on location so it never appears elsewhere.
 */
const abyssSummonerOnNavigate: ClassHandler = (ctx) => {
	if (ctx.player.navigationDestination !== 'Floral Patch') return;
	runAction(ctx, {
		kind: 'choose',
		decisionKind: 'abyssSummonFlorality',
		prompt: 'Floral Patch: draw 3 and summon 1 Abyss spirit, then awaken it?',
		options: [
			{ id: 'yes', label: 'Summon from the Abyss' },
			{ id: 'no', label: 'Not now' }
		]
	});
};

export const ability: ClassAbility[] = [{ on: 'onNavigate', run: abyssSummonerOnNavigate }];
