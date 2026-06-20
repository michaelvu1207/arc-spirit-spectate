import { describe, it, expect } from 'vitest';
import { fire } from './testHelpers';

/**
 * Blood Hunter — "In Combat, deal 1 damage per Arcane Blood (max 4)."
 *
 * Arcane Blood is the corrupted side of the potential pool: `maxTokens - barrier`.
 * The ability is a declarative `inCombat` breakpoint that adds a live-pool combat
 * bonus (`combatDamageBonus`), capped at 4. UX channel: a passive combat number
 * plus a log line, so it is never a silent no-op when blood is present.
 */
describe('Blood Hunter (inCombat, declarative — combat bonus from Arcane Blood)', () => {
	it('adds +1 combat damage per Arcane Blood', () => {
		// maxTokens 4, barrier 2 → 2 Arcane Blood → +2 combat damage.
		const { player } = fire({ 'Blood Hunter': 1 }, 'inCombat', {
			player: { maxTokens: 4, barrier: 2 }
		});
		expect(player.combatDamageBonus).toBe(2);
	});

	it('caps the bonus at 4 even with more Arcane Blood', () => {
		// maxTokens 10, barrier 0 → 10 Arcane Blood → capped at +4.
		const { player } = fire({ 'Blood Hunter': 1 }, 'inCombat', {
			player: { maxTokens: 10, barrier: 0 }
		});
		expect(player.combatDamageBonus).toBe(4);
	});

	it('surfaces a combat log line when Arcane Blood is present (no silent no-op)', () => {
		const { log } = fire({ 'Blood Hunter': 1 }, 'inCombat', {
			player: { maxTokens: 4, barrier: 1 }
		});
		expect(log.some((l) => /arcane blood/i.test(l) && /combat damage/i.test(l))).toBe(true);
	});

	it('adds nothing and logs nothing when at full barrier (zero Arcane Blood)', () => {
		// maxTokens 4, barrier 4 → 0 Arcane Blood → no bonus, no log.
		const { player, log } = fire({ 'Blood Hunter': 1 }, 'inCombat', {
			player: { maxTokens: 4, barrier: 4 }
		});
		expect(player.combatDamageBonus).toBe(0);
		expect(log.some((l) => /arcane blood/i.test(l))).toBe(false);
	});
});
