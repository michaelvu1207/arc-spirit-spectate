import { describe, expect, it } from 'vitest';
import { fire, spirit } from './testHelpers';

/**
 * Purifier — "When Awakened, you may place 2 of any Spirit Augment on each summoned
 * cursed spirit." Built-in (no manual prompt): the awakening handler grants 2
 * PLACEABLE Spirit Augments per Cursed Spirit into `unplacedAugments`, each restricted
 * to a Cursed Spirit host (`hostClass`) with a 2-per-host cap (`hostCapacity`). The
 * player places them with the same in-stage Augment UX as the Captain's augments
 * (pick icon → click spirit), choosing the class at placement.
 */
describe('Purifier (awakening → Cursed-Spirit-restricted augment grant)', () => {
	function withCursed(n: number) {
		return [
			spirit(1, { Purifier: 1 }, { name: 'Purifier' }),
			...Array.from({ length: n }, (_, i) =>
				spirit(2 + i, { 'Cursed Spirit': 1 }, { name: `Cursed ${i}` })
			)
		];
	}

	it('grants 2 placeable augments per Cursed Spirit, restricted to Cursed Spirit hosts', () => {
		const { player } = fire({ Purifier: 1 }, 'awakening', {
			player: { spirits: withCursed(2) },
			command: { slotIndex: 1 }
		});
		// No manual prompt, no decision card — just placeable augments in the pouch.
		expect(player.manualPrompts.filter((p) => p.source === 'class')).toHaveLength(0);
		expect(player.pendingDecisions).toHaveLength(0);
		// 2 augments × 2 Cursed Spirits = 4 to place.
		expect(player.unplacedAugments).toHaveLength(4);
		expect(player.unplacedAugments?.every((a) => a.hostClass === 'Cursed Spirit')).toBe(true);
		expect(player.unplacedAugments?.every((a) => a.hostCapacity === 2)).toBe(true);
		// Class is NOT pre-chosen — the player picks one of the six at placement time.
		expect(player.unplacedAugments?.every((a) => a.classId == null)).toBe(true);
	});

	it('grants nothing when no Cursed Spirit is held', () => {
		const { player } = fire({ Purifier: 1 }, 'awakening', {
			player: { spirits: [spirit(1, { Purifier: 1 }, { name: 'Purifier' })] },
			command: { slotIndex: 1 }
		});
		expect(player.unplacedAugments ?? []).toHaveLength(0);
	});

	it('does NOT fire when a non-Purifier spirit awakens', () => {
		const { player } = fire({ Purifier: 1 }, 'awakening', {
			player: { spirits: withCursed(1) },
			command: { slotIndex: 99 } // not the Purifier's slot
		});
		expect(player.unplacedAugments ?? []).toHaveLength(0);
	});
});
