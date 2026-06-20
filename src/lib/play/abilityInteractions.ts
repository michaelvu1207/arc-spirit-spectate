/**
 * Pure builder for the unified Awakening-phase ability UX.
 *
 * Aggregates a player's owner-only interaction fields — corruption discard, reward
 * claim, decision cards, augments to place, awaken offers, locked hints, manual
 * prompts — into ONE ordered {@link AbilityInteraction}[] that a single screen
 * (AwakeningSheet) renders consistently. No state is mutated and no commands are
 * invoked here; resolution still flows through the existing commands per kind.
 *
 * Shared by the server projection ({@link buildSessionProjection}) and the client,
 * so it takes a structural subset satisfied by both PrivatePlayerState and
 * PlayerProjection. Order encodes priority: forced obligations first (corruption
 * discard, reward claim), then opt-in ability choices, then augment placement, then
 * the awaken offers/hints, with manual prompts last.
 */

import type {
	AbilityInteraction,
	AwakenLockedOffer,
	AwakenOffer,
	ManualPrompt,
	PendingAugment,
	PendingAwakenRewardState,
	PendingCorruptionDiscard,
	PendingDecision
} from './types';

/** The minimal player shape the builder reads — satisfied by the engine state and the
 *  client projection alike. */
export interface AbilityInteractionSource {
	pendingCorruptionDiscard?: PendingCorruptionDiscard | null;
	pendingAwakenReward?: PendingAwakenRewardState | null;
	pendingDecisions?: PendingDecision[];
	unplacedAugments?: PendingAugment[];
	awakenOffers?: AwakenOffer[];
	awakenLocked?: AwakenLockedOffer[];
	manualPrompts?: ManualPrompt[];
}

export function buildAbilityInteractions(player: AbilityInteractionSource): AbilityInteraction[] {
	const out: AbilityInteraction[] = [];

	// 1. Forced corruption discard — must be paid before the round can advance.
	const corruption = player.pendingCorruptionDiscard;
	if (corruption && corruption.count > 0) {
		out.push({ kind: 'corruptionDiscard', count: corruption.count, reason: corruption.reason });
	}

	// 2. Awakening-Phase reward claim (Cursed Spirit / Golden Ruler / …).
	const reward = player.pendingAwakenReward;
	if (reward && reward.grants.length > 0) {
		out.push({ kind: 'reward', grants: reward.grants });
	}

	// 3. Opt-in / choice ability cards (Purifier class pick, Mod Injector, Florality…).
	for (const decision of player.pendingDecisions ?? []) {
		out.push({
			kind: 'choice',
			id: decision.id,
			source: decision.source,
			prompt: decision.prompt,
			options: decision.options
		});
	}

	// 4. Augments awaiting placement onto a spirit.
	const augments = player.unplacedAugments ?? [];
	if (augments.length > 0) {
		out.push({ kind: 'augment', augments });
	}

	// 5. Face-down spirits ready to awaken (cost + optional discard choice).
	for (const offer of player.awakenOffers ?? []) {
		out.push({
			kind: 'awaken',
			slotIndex: offer.slotIndex,
			spiritName: offer.spiritName,
			requirement: offer.requirement,
			discardCount: offer.discardCount,
			options: offer.options
		});
	}

	// 6. Face-down spirits not yet awakenable — passive hints of what they need.
	for (const hint of player.awakenLocked ?? []) {
		out.push({
			kind: 'awakenLocked',
			slotIndex: hint.slotIndex,
			spiritName: hint.spiritName,
			requirement: hint.requirement
		});
	}

	// 7. Hand-resolved (manual) prompts — last resort, rare.
	for (const prompt of player.manualPrompts ?? []) {
		out.push({ kind: 'manual', id: prompt.id, source: prompt.source, text: prompt.text });
	}

	return out;
}
