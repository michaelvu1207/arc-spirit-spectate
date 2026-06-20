import { describe, expect, it } from 'vitest';
import { ability } from './cursedSpirit';
import { makePlayer, makeState, spirit } from './testHelpers';
import { applyTrigger } from '../apply';
import { enterBenefits } from '../../phases';
import type { AwakenGrant } from '../../types';

/**
 * Cursed Spirit — DB-intended behavior:
 *   Tainted  -> 1 potential OR 1 Enchanted (a player choice)
 *   Corrupt  -> 1 Relic
 *   Fallen   -> 1 Augment
 * each x (awakened Cursed Spirit count), in the Awakening Phase.
 *
 * This is ENGINE-handled, not effect-system handled. The class `ability` array is
 * intentionally empty. The grants surface to the player as a CLEANUP CLAIM card:
 * `enterBenefits` (phases.ts) builds `player.pendingAwakenReward.grants` — one line
 * per corruption stage entered this round, each scaled x N Cursed Spirits — and
 * `resolveAwakenReward` (runtime.ts) applies the player's picks. These tests assert
 * the claim-building behavior through the real engine entry point (`enterBenefits`),
 * which is the channel the player actually sees, and guard that nothing is granted
 * silently by the `awakeningPhase` effect trigger (no double-grant).
 */

/** A state whose Red player holds one awakened Cursed Spirit ×n and crossed `stage`. */
function stateForCursed(
	n: number,
	stages: {
		tainted?: boolean;
		corrupt?: boolean;
		fallen?: boolean;
	} = {}
) {
	const player = makePlayer({
		maxTokens: 10,
		spirits: [spirit(1, { 'Cursed Spirit': n })],
		becameTaintedThisRound: stages.tainted ?? false,
		becameCorruptThisRound: stages.corrupt ?? false,
		becameFallenThisRound: stages.fallen ?? false
	});
	const state = makeState(player);
	return { player, state };
}

function grants(player: ReturnType<typeof makePlayer>): AwakenGrant[] {
	return player.pendingAwakenReward?.grants ?? [];
}

describe('Cursed Spirit — engine-handled Cleanup claim', () => {
	it('the class ability array is intentionally empty (engine-handled, not effect-handled)', () => {
		expect(ability).toEqual([]);
	});

	it('Tainted → a taintedChoice claim line scaled ×N (potential OR Enchanted)', () => {
		const { player, state } = stateForCursed(2, { tainted: true });
		enterBenefits(state);
		expect(grants(player)).toEqual([
			{ kind: 'taintedChoice', amount: 2, source: 'Cursed Spirit' }
		]);
	});

	it('Corrupt → a relicChoice claim line scaled ×N', () => {
		const { player, state } = stateForCursed(3, { corrupt: true });
		enterBenefits(state);
		expect(grants(player)).toEqual([
			{ kind: 'relicChoice', amount: 3, source: 'Cursed Spirit' }
		]);
	});

	it('Fallen → an augment claim line scaled ×N', () => {
		const { player, state } = stateForCursed(2, { fallen: true });
		enterBenefits(state);
		expect(grants(player)).toEqual([{ kind: 'augment', amount: 2, source: 'Cursed Spirit' }]);
	});

	it('crossing every stage in one round builds one claim line per stage, all ×N', () => {
		const { player, state } = stateForCursed(1, { tainted: true, corrupt: true, fallen: true });
		enterBenefits(state);
		expect(grants(player)).toEqual([
			{ kind: 'taintedChoice', amount: 1, source: 'Cursed Spirit' },
			{ kind: 'relicChoice', amount: 1, source: 'Cursed Spirit' },
			{ kind: 'augment', amount: 1, source: 'Cursed Spirit' }
		]);
	});

	it('holding a Cursed Spirit but crossing no stage this round → no claim', () => {
		const { player, state } = stateForCursed(2, {});
		enterBenefits(state);
		expect(player.pendingAwakenReward).toBeNull();
	});

	it('crossing a stage with no awakened Cursed Spirit → no claim', () => {
		const player = makePlayer({ becameTaintedThisRound: true, spirits: [] });
		const state = makeState(player);
		enterBenefits(state);
		expect(player.pendingAwakenReward).toBeNull();
	});

	it('a face-down (un-awakened) Cursed Spirit does not count toward the claim', () => {
		const player = makePlayer({
			becameFallenThisRound: true,
			spirits: [spirit(1, { 'Cursed Spirit': 1 }, { faceDown: true })]
		});
		const state = makeState(player);
		enterBenefits(state);
		expect(player.pendingAwakenReward).toBeNull();
	});

	// No-silent-no-op guard: the reward is a visible CLAIM, and it must NOT also be
	// auto-applied by the awakeningPhase effect trigger (that would double-grant).
	it('the awakeningPhase effect trigger grants nothing (claim is the only channel)', () => {
		const player = makePlayer({
			maxTokens: 10,
			becameTaintedThisRound: true,
			becameCorruptThisRound: true,
			becameFallenThisRound: true,
			spirits: [spirit(1, { 'Cursed Spirit': 2 })]
		});
		applyTrigger(makeState(player), 'Red', 'awakeningPhase', []);
		expect(player.attackDice).toHaveLength(0);
		expect(player.relics).toBe(0);
		expect(player.spiritAugments).toBe(0);
		expect(player.maxTokens).toBe(10);
	});
});
