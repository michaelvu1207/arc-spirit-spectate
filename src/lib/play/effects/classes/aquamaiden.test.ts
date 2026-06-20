import { describe, it, expect } from 'vitest';
import { fire } from './testHelpers';

// Aquamaiden — DB intent: "When you Take Damage, take 3 less damage."
// Surfaces as a passive combat number (player.damageReduction) plus a log line.
describe('Aquamaiden', () => {
	it('reduces incoming damage by 3 on Take Damage', () => {
		const { player } = fire({ Aquamaiden: 1 }, 'onTakeDamage');
		expect(player.damageReduction).toBe(3);
	});

	it('surfaces to the player via a log line (no silent no-op)', () => {
		const { log } = fire({ Aquamaiden: 1 }, 'onTakeDamage');
		expect(log.join("\n")).toContain('Reduced incoming damage by 3.');
	});

	it('does not stack on a non-damage trigger', () => {
		const { player } = fire({ Aquamaiden: 1 }, 'awakening');
		expect(player.damageReduction).toBe(0);
	});
});
