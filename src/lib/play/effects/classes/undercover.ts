import { runAction } from '../actions';
import type { ClassAbility, ClassHandler } from './types';

/**
 * "Gain 3 Initiative. Your next rune-to-relic trade is free, then discard this
 * spirit." A single-use awakening effect: when an Undercover spirit awakens it
 * gains 3 Initiative, arms a one-shot free rune→relic trade, and discards itself.
 *
 * Deterministic parts (initiative + self-discard) are handled here; this sets the
 * one-shot `freeNextRelicTrade` flag on PrivatePlayerState. The consuming side IS
 * wired: `runtime.resolveLocationInteraction` waives the cost of the next rune→relic
 * trade and clears the flag, and the UI (`LocationInteractionMenu.affordable`) treats
 * such a trade as affordable so the card stays clickable even without the runes.
 */
const undercoverAwakening: ClassHandler = (ctx) => {
	const slot = (ctx.command as { slotIndex?: number } | undefined)?.slotIndex;
	if (slot == null) return;
	const idx = ctx.player.spirits.findIndex(
		(s) => s.slotIndex === slot && (s.classes?.Undercover ?? 0) > 0
	);
	if (idx < 0) return;

	// +3 Initiative (deterministic, in-file).
	runAction(ctx, { kind: 'gainInitiative', amount: 3 });

	// Arm the one-shot free rune→relic trade — honored + cleared by the trade-cost
	// step in runtime's resolveLocationInteraction.
	ctx.player.freeNextRelicTrade = true;
	ctx.log.push('Your next rune-to-relic trade is free.');

	// Single-use: discard the spirit that just awakened.
	const [discarded] = ctx.player.spirits.splice(idx, 1);
	ctx.log.push(`${discarded.name} went undercover and was discarded.`);
};

export const ability: ClassAbility[] = [{ on: 'awakening', run: undercoverAwakening }];
