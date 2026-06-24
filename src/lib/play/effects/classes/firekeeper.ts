import { runAction } from '../actions';
import { nextId } from '../../rng';
import type { ClassAbility, ClassDecisions } from './types';

// Firekeeper — "In the Awakening phase, you may discard a relic for 3 max barrier or
// 1 Arcane Attack."
//
// Was an awakening gain (1 Arcane Attack) + onTakeDamage damage reduction; now a
// single Awakening-phase opt-in. Implemented as a bespoke `run` handler on
// `awakeningPhase` (fires once per active player at cleanup) so we can gate
// precisely on the player HOLDING a relic — relics live as `player.mats` entries
// with `type === 'relic'` & `hasRune`, which the declarative conditions can't read.
// The colocated `firekeeperRelicTrade` resolver discards exactly one relic and
// grants the chosen reward (3 max barrier OR 1 Arcane Attack).
export const ability: ClassAbility[] = [
	{
		on: 'awakeningPhase',
		run(ctx) {
			const { player, log, state } = ctx;
			const hasRelic = player.mats.some((r) => r.type === 'relic' && r.hasRune);
			if (!hasRelic) {
				// No-silent-no-op: a player holding no relic simply isn't offered the
				// choice. The eligibility gate (offering only when a relic is held) is the
				// UX surface; the log breadcrumb keeps the gate observable.
				log.push('Firekeeper: no relic to discard.');
				return;
			}
			player.pendingDecisions.push({
				id: nextId(state.rng, 'dec'),
				source: 'class',
				kind: 'firekeeperRelicTrade',
				prompt: 'Awakening: you may discard a relic for 3 max barrier or 1 Arcane Attack.',
				options: [
					{ id: 'potential', label: 'Discard relic → 3 max barrier' },
					{ id: 'arcane', label: 'Discard relic → 1 Arcane Attack' },
					{ id: 'no', label: 'No' }
				]
			});
			log.push('Decision: Awakening — discard a relic for 3 max barrier or 1 Arcane Attack?');
		}
	}
];

/** Discard exactly one held relic; keeps the `relics` tally in sync. Returns true
 *  if a relic was actually discarded (matches awakenHandlers' discard semantics:
 *  flip the slot's `hasRune` off rather than removing the slot). */
function discardOneRelic(ctx: EffectContextLike): boolean {
	const { player, log } = ctx;
	const slot = player.mats.find((r) => r.type === 'relic' && r.hasRune);
	if (!slot) return false;
	slot.hasRune = false;
	if (player.relics > 0) player.relics -= 1;
	log.push('Discarded relic.');
	return true;
}

type EffectContextLike = Parameters<ClassDecisions[string]>[0];

// Colocated resolver for the opt-in card: discard one relic, then grant the reward.
export const decisions: ClassDecisions = {
	firekeeperRelicTrade(ctx, optionId) {
		if (optionId !== 'potential' && optionId !== 'arcane') return;
		// Only pay (and grant) when a relic is actually present — guards a stale card.
		if (!discardOneRelic(ctx)) return;
		if (optionId === 'potential') {
			runAction(ctx, { kind: 'gainMaxBarrier', amount: 3 });
		} else {
			runAction(ctx, { kind: 'gainAttackDice', tier: 'arcane', amount: 1 });
		}
	}
};
