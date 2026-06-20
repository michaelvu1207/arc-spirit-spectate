import { describe, expect, test } from 'vitest';
import { isStaleRoomUpdate } from './roomView';

describe('isStaleRoomUpdate', () => {
	test('no current room → never stale (first load applies)', () => {
		expect(isStaleRoomUpdate(null, { roomCode: 'AAA', revision: 0 })).toBe(false);
		expect(isStaleRoomUpdate(undefined, { roomCode: 'AAA', revision: 7 })).toBe(false);
	});

	test('same room, lower revision → stale (a late command response)', () => {
		expect(isStaleRoomUpdate({ roomCode: 'AAA', revision: 5 }, { roomCode: 'AAA', revision: 3 })).toBe(true);
	});

	test('same room, equal or higher revision → apply', () => {
		expect(isStaleRoomUpdate({ roomCode: 'AAA', revision: 5 }, { roomCode: 'AAA', revision: 5 })).toBe(false);
		expect(isStaleRoomUpdate({ roomCode: 'AAA', revision: 5 }, { roomCode: 'AAA', revision: 6 })).toBe(false);
	});

	test('different room → always apply, even at a lower revision (create/join/switch)', () => {
		// Regression: exiting a long game (high revision) and creating a fresh room
		// (revision 1) must NOT be rejected as stale — otherwise the player is taken
		// back to their previous game.
		expect(isStaleRoomUpdate({ roomCode: 'OLD', revision: 99 }, { roomCode: 'NEW', revision: 1 })).toBe(false);
	});
});
