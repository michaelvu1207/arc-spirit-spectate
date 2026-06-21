import { runAction } from '../actions';
import type { ClassAbility, ClassHandler } from './types';

/**
 * "Gain 3 Initiative. Your next rune-to-relic trade is free, then discard this
 * spirit." A single-use awakening effect: when an Undercover spirit awakens it
 * gains 3 Initiative and arms a one-shot free rune→relic trade.
 *
 * The spirit is NOT discarded on awaken — it STAYS on the board until the free trade
 * is actually used ("…then discard this spirit"). The discard happens on the consuming
 * side: `runtime.resolveLocationInteraction` waives the cost of the next rune→relic
 * trade, clears the flag, AND discards the awakened Undercover spirit(s) at that point.
 * The UI (`LocationInteractionMenu.affordable`) treats such a trade as affordable so the
 * card stays clickable even without the runes.
 */
const undercoverAwakening: ClassHandler = (ctx) => {
	const slot = (ctx.command as { slotIndex?: number } | undefined)?.slotIndex;
	if (slot == null) return;
	const spirit = ctx.player.spirits.find(
		(s) => s.slotIndex === slot && (s.classes?.Undercover ?? 0) > 0
	);
	if (!spirit) return;

	// +3 Initiative (deterministic, in-file).
	runAction(ctx, { kind: 'gainInitiative', amount: 3 });

	// Arm the one-shot free rune→relic trade — honored + cleared (and the spirit
	// discarded) by the trade-cost step in runtime's resolveLocationInteraction.
	ctx.player.freeNextRelicTrade = true;
	ctx.log.push('Your next rune-to-relic trade is free — this spirit stays until you use it.');
};

export const ability: ClassAbility[] = [{ on: 'awakening', run: undercoverAwakening }];
