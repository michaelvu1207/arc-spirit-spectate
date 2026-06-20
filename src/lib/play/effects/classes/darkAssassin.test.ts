import { describe, it, expect } from 'vitest';
import { fire, spirit } from './testHelpers';

/**
 * Dark Assassin — "For every Cursed Spirit trait you have, gain 2 Attack Damage."
 *
 * Bespoke `inCombat` handler: counts `Cursed Spirit` trait values across the
 * player's face-up spirits and adds `2 * count` to `combatDamageBonus`. UX
 * channel: a passive combat number + a log line, never a silent no-op when
 * Cursed Spirit traits are present.
 */
describe('Dark Assassin (inCombat, handler — +2 combat damage per Cursed Spirit trait)', () => {
	it('adds +2 combat damage per Cursed Spirit trait (single spirit)', () => {
		// Dark Assassin spirit also carries 1 Cursed Spirit trait → +2.
		const { player } = fire({ 'Dark Assassin': 1, 'Cursed Spirit': 1 }, 'inCombat');
		expect(player.combatDamageBonus).toBe(2);
	});

	it('sums Cursed Spirit traits across all face-up spirits', () => {
		// Two spirits: one Dark Assassin w/ 2 Cursed Spirit, one w/ 1 Cursed Spirit → 3 traits → +6.
		const { player } = fire({ 'Dark Assassin': 1, 'Cursed Spirit': 2 }, 'inCombat', {
			player: {
				spirits: [
					spirit(1, { 'Dark Assassin': 1, 'Cursed Spirit': 2 }),
					spirit(2, { 'Cursed Spirit': 1 })
				]
			}
		});
		expect(player.combatDamageBonus).toBe(6);
	});

	it('ignores Cursed Spirit traits on face-down spirits', () => {
		const { player } = fire({ 'Dark Assassin': 1 }, 'inCombat', {
			player: {
				spirits: [
					spirit(1, { 'Dark Assassin': 1 }),
					spirit(2, { 'Cursed Spirit': 3 }, { faceDown: true })
				]
			}
		});
		expect(player.combatDamageBonus).toBe(0);
	});

	it('surfaces a combat log line when Cursed Spirit traits are present (no silent no-op)', () => {
		const { log } = fire({ 'Dark Assassin': 1, 'Cursed Spirit': 1 }, 'inCombat');
		expect(log.some((l) => /dark assassin/i.test(l) && /cursed spirit/i.test(l) && /\+2/.test(l))).toBe(
			true
		);
	});

	it('adds nothing and logs nothing with zero Cursed Spirit traits', () => {
		const { player, log } = fire({ 'Dark Assassin': 1 }, 'inCombat');
		expect(player.combatDamageBonus).toBe(0);
		expect(log.some((l) => /dark assassin/i.test(l))).toBe(false);
	});
});
