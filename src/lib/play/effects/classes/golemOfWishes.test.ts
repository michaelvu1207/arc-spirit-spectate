import { describe, it, expect } from 'vitest';
import { fire } from './testHelpers';

// Golem of Wishes — DB intent: "In combat, deflect 4 damage."
// Surfaces as a passive combat number (player.deflect) plus a log line.
describe('Golem of Wishes', () => {
	it('grants deflect 4 in combat', () => {
		const { player } = fire({ 'Golem of Wishes': 1 }, 'inCombat');
		expect(player.deflect).toBe(4);
	});

	it('surfaces to the player via a log line (no silent no-op)', () => {
		const { log } = fire({ 'Golem of Wishes': 1 }, 'inCombat');
		expect(log.join("\n")).toContain('Will deflect 4 damage.');
	});

	it('does not grant deflect outside combat', () => {
		const { player } = fire({ 'Golem of Wishes': 1 }, 'awakening');
		expect(player.deflect).toBe(0);
	});
});
