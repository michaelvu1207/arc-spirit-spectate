import { runAction } from '../actions';
import { nextId } from '../../rng';
import type { ClassAbility, ClassDecisions } from './types';

// Rune Mage — "In the Awakening phase, you may discard a rune to gain an Enchanted
// Attack and/or a Relic for an Exalted Attack."
//
// CHANGED entirely from (onLocationInteraction trade handler: +1 Enchanted per rune
// traded, +1 Exalted per relic traded) to a single Awakening-phase opt-in.
// Implemented as a bespoke `run` handler on `awakeningPhase` (fires once per active
// player at cleanup) so we can gate precisely on the player HOLDING the relevant
// item — runes and relics both live as `player.mats` entries (`type === 'rune'` vs
// `type === 'relic'`, with `hasRune` true), which the declarative conditions can't
// read. The colocated `runeMageTrade` resolver discards exactly one item of the
// chosen kind and grants the matching attack die, then RE-OFFERS the choice so a
// player can do both (the "and/or": discard a rune for Enchanted AND a relic for
// Exalted in the same Awakening).

type EffectContextLike = Parameters<ClassDecisions[string]>[0];

const heldRune = (player: EffectContextLike['player']) =>
	player.mats.some((r) => r.type === 'rune' && r.hasRune);
const heldRelic = (player: EffectContextLike['player']) =>
	player.mats.some((r) => r.type === 'relic' && r.hasRune);

/** Build the decision options for whatever the player can currently afford. Always
 *  includes a "no" out. Returns null when neither item is held (nothing to offer). */
function tradeOptions(player: EffectContextLike['player']) {
	const options: { id: string; label: string }[] = [];
	if (heldRune(player)) options.push({ id: 'rune', label: 'Discard rune → 1 Enchanted Attack' });
	if (heldRelic(player)) options.push({ id: 'relic', label: 'Discard relic → 1 Exalted Attack' });
	if (options.length === 0) return null;
	options.push({ id: 'no', label: 'No' });
	return options;
}

const TRADE_PROMPT =
	'Awakening: you may discard a rune for 1 Enchanted Attack and/or a relic for 1 Exalted Attack.';

function offerTrade(ctx: EffectContextLike): void {
	const { player, state, log } = ctx;
	const options = tradeOptions(player);
	if (!options) return;
	player.pendingDecisions.push({
		id: nextId(state.rng, 'dec'),
		source: 'class',
		kind: 'runeMageTrade',
		prompt: TRADE_PROMPT,
		options
	});
	log.push('Decision: Awakening — discard a rune for Enchanted and/or a relic for Exalted?');
}

export const ability: ClassAbility[] = [
	{
		on: 'awakeningPhase',
		run(ctx) {
			const { player, log } = ctx;
			if (!heldRune(player) && !heldRelic(player)) {
				// No-silent-no-op: a player holding neither a rune nor a relic simply isn't
				// offered the choice. The eligibility gate (offering only when an item is
				// held) is the UX surface; the log breadcrumb keeps the gate observable.
				log.push('Rune Mage: no rune or relic to discard.');
				return;
			}
			offerTrade(ctx);
		}
	}
];

/** Discard exactly one held rune (non-relic). Returns true if one was discarded.
 *  Matches awakenHandlers' discard semantics: flip the slot's `hasRune` off. */
function discardOneRune(ctx: EffectContextLike): boolean {
	const slot = ctx.player.mats.find((r) => r.type === 'rune' && r.hasRune);
	if (!slot) return false;
	slot.hasRune = false;
	ctx.log.push('Discarded rune.');
	return true;
}

/** Discard exactly one held relic; keeps the `relics` tally in sync. Returns true if
 *  one was discarded. */
function discardOneRelic(ctx: EffectContextLike): boolean {
	const slot = ctx.player.mats.find((r) => r.type === 'relic' && r.hasRune);
	if (!slot) return false;
	slot.hasRune = false;
	if (ctx.player.relics > 0) ctx.player.relics -= 1;
	ctx.log.push('Discarded relic.');
	return true;
}

// Colocated resolver for the opt-in card. On "rune": discard one rune → 1 Enchanted.
// On "relic": discard one relic → 1 Exalted. Either way, RE-OFFER the choice while the
// player still holds a tradeable item (the "and/or" — convert both in one Awakening).
// The runtime removes the just-resolved decision by id AFTER this runs, so the freshly
// enqueued `runeMageTrade` (new id) survives and surfaces as the next decision card.
export const decisions: ClassDecisions = {
	runeMageTrade(ctx, optionId) {
		if (optionId === 'rune') {
			if (!discardOneRune(ctx)) return; // stale-card guard
			runAction(ctx, { kind: 'gainAttackDice', tier: 'enchanted', amount: 1 });
		} else if (optionId === 'relic') {
			if (!discardOneRelic(ctx)) return; // stale-card guard
			runAction(ctx, { kind: 'gainAttackDice', tier: 'exalted', amount: 1 });
		} else {
			return; // "no" / unknown — stop offering
		}
		offerTrade(ctx);
	}
};
