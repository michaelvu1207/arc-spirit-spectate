import { describe, it, expect } from 'vitest';
import { fire, makePlayer, ctxFor, spirit } from './testHelpers';
import { decisions } from './arcMage';
import type { AttackDie } from '../../types';

// Arc Mage — DB intent (CHANGED): "When you cultivate, you may discard 4 attack
// dice to gain 1 Arcane Attack Dice, repeatable."
// Gate: ≥4 dice on cultivate → opt-in Yes/No card (`arcMageTrade`).
// On Yes: discard 4 → gain 1 arcane, then RE-OFFER while still holding ≥4 dice.
// UX channel: a decision card (pendingDecisions) on cultivate; resolver mutates dice + logs.

function basicDice(n: number): AttackDie[] {
	return Array.from({ length: n }, (_, i) => ({ instanceId: `d${i}`, tier: 'basic' as const }));
}

describe('Arc Mage', () => {
	it('offers the opt-in trade card on cultivate when holding ≥4 attack dice', () => {
		const { player, log } = fire({ 'Arc Mage': 1 }, 'onCultivate', {
			player: { attackDice: basicDice(4) }
		});
		expect(player.pendingDecisions).toHaveLength(1);
		const dec = player.pendingDecisions[0];
		expect(dec.kind).toBe('arcMageTrade');
		expect(dec.options.map((o) => o.id)).toEqual(['yes', 'no']);
		// No silent no-op: the decision is surfaced via the log too.
		expect(log.some((l) => l.includes('discard 4 attack dice'))).toBe(true);
	});

	it('does NOT offer the trade with only 3 dice (gate raised 3 → 4)', () => {
		const { player } = fire({ 'Arc Mage': 1 }, 'onCultivate', {
			player: { attackDice: basicDice(3) }
		});
		expect(player.pendingDecisions).toHaveLength(0);
	});

	it('does not offer the trade on a non-cultivate trigger', () => {
		const { player } = fire({ 'Arc Mage': 1 }, 'awakening', {
			player: { attackDice: basicDice(8) }
		});
		expect(player.pendingDecisions).toHaveLength(0);
	});

	it('Yes discards 4 dice and gains 1 arcane die', () => {
		const player = makePlayer({
			spirits: [spirit(1, { 'Arc Mage': 1 })],
			attackDice: basicDice(4)
		});
		const ctx = ctxFor(player);
		decisions.arcMageTrade(ctx, 'yes');
		// 4 basics discarded, 1 arcane gained.
		expect(player.attackDice).toHaveLength(1);
		expect(player.attackDice[0].tier).toBe('arcane');
		expect(ctx.log).toContain('Discarded 4 attack dice.');
		expect(ctx.log).toContain('Gained 1 arcane attack dice.');
	});

	it('No does nothing (opt-out)', () => {
		const player = makePlayer({
			spirits: [spirit(1, { 'Arc Mage': 1 })],
			attackDice: basicDice(4)
		});
		const before = player.attackDice.length;
		const ctx = ctxFor(player);
		decisions.arcMageTrade(ctx, 'no');
		expect(player.attackDice).toHaveLength(before);
		expect(player.attackDice.every((d) => d.tier === 'basic')).toBe(true);
	});

	it('is REPEATABLE: re-offers the trade while ≥4 dice remain after a Yes', () => {
		// 9 dice → after one trade (discard 4, +1 arcane) → 6 dice remain (≥4) → re-offer.
		const player = makePlayer({
			spirits: [spirit(1, { 'Arc Mage': 1 })],
			attackDice: basicDice(9)
		});
		const ctx = ctxFor(player);
		decisions.arcMageTrade(ctx, 'yes');
		expect(player.attackDice).toHaveLength(6); // 9 - 4 + 1
		// A fresh trade card is enqueued because ≥4 dice remain.
		expect(player.pendingDecisions).toHaveLength(1);
		expect(player.pendingDecisions[0].kind).toBe('arcMageTrade');
	});

	it('is REPEATABLE: stops re-offering once fewer than 4 dice remain', () => {
		// 4 dice → after one trade → 1 die remains (<4) → no re-offer.
		const player = makePlayer({
			spirits: [spirit(1, { 'Arc Mage': 1 })],
			attackDice: basicDice(4)
		});
		const ctx = ctxFor(player);
		decisions.arcMageTrade(ctx, 'yes');
		expect(player.attackDice).toHaveLength(1);
		expect(player.pendingDecisions).toHaveLength(0);
	});
});
