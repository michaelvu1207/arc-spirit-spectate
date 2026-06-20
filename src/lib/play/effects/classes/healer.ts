import { runAction } from '../actions';
import { nextId } from '../../rng';
import type { ClassAbility, ClassDecisions } from './types';

// Healer — "On rest, if you have 10 potential, you may restore 3 health and gain 1 VP."
//
// Was a declarative onRest ladder (restore 5, includeColocated). Now a bespoke `run`
// handler gated on the player holding the full 10-potential pool: only then is the
// opt-in offered. The colocated `healerRestore` resolver performs the restore-3 (self
// only) and +1 VP when the player picks "yes".
export const ability: ClassAbility[] = [
	{
		on: 'onRest',
		run(ctx) {
			const { player, log, state } = ctx;
			// Gate: the reward is only available at the full 10-potential breakpoint.
			if (player.maxTokens < 10) {
				// No-silent-no-op: a player below 10 potential simply isn't offered the
				// choice. We leave a log breadcrumb so the gate stays observable.
				log.push('Healer: need 10 potential to restore health and gain VP.');
				return;
			}
			player.pendingDecisions.push({
				id: nextId(state.rng, 'dec'),
				source: 'class',
				kind: 'healerRestore',
				prompt: 'On rest, you may restore 3 health and gain 1 VP.',
				options: [
					{ id: 'yes', label: 'Restore 3 health and gain 1 VP' },
					{ id: 'no', label: 'No' }
				]
			});
			log.push('Decision: On rest, restore 3 health and gain 1 VP?');
		}
	}
];

// Colocated resolver for the opt-in card: restore 3 barrier (self only) and gain 1 VP.
export const decisions: ClassDecisions = {
	healerRestore(ctx, optionId) {
		if (optionId !== 'yes') return;
		runAction(ctx, { kind: 'restoreBarrier', amount: 3 });
		runAction(ctx, { kind: 'gainVP', amount: 1 });
	}
};
