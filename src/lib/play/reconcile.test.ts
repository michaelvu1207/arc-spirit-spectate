import { describe, it, expect } from 'vitest';
import { reconcile } from './reconcile';

describe('reconcile', () => {
	it('returns primitives directly', () => {
		expect(reconcile(1, 2)).toBe(2);
		expect(reconcile('a', 'b')).toBe('b');
		expect(reconcile(null, 5)).toBe(5);
		expect(reconcile({}, null)).toBe(null);
	});

	it('mutates the target object in place and preserves its identity', () => {
		const target = { a: 1, b: 2 };
		const result = reconcile(target, { a: 1, b: 3 });
		expect(result).toBe(target); // same reference
		expect(target).toEqual({ a: 1, b: 3 });
	});

	it('preserves identity of unchanged nested subtrees', () => {
		const target = { phase: 'navigation', players: { red: { vp: 1 } } };
		const players = target.players;
		const red = target.players.red;
		// Only the top-level phase changes.
		reconcile(target, { phase: 'awakening', players: { red: { vp: 1 } } });
		expect(target.phase).toBe('awakening');
		// Untouched subtree keeps its reference → Svelte would not invalidate its readers.
		expect(target.players).toBe(players);
		expect(target.players.red).toBe(red);
	});

	it('only rewrites the leaves that actually changed', () => {
		const target = { players: { red: { vp: 1 }, blue: { vp: 2 } } };
		const red = target.players.red;
		const blue = target.players.blue;
		reconcile(target, { players: { red: { vp: 5 }, blue: { vp: 2 } } });
		expect(target.players.red).toBe(red); // mutated in place
		expect(target.players.red.vp).toBe(5);
		expect(target.players.blue).toBe(blue);
		expect(target.players.blue.vp).toBe(2);
	});

	it('adds new keys and removes dropped keys', () => {
		const target: Record<string, unknown> = { a: 1, gone: true };
		reconcile(target, { a: 1, added: 9 });
		expect(target).toEqual({ a: 1, added: 9 });
		expect('gone' in target).toBe(false);
	});

	it('reconciles arrays in place, preserving the array reference', () => {
		const target = { list: [{ id: 1 }, { id: 2 }] };
		const list = target.list;
		const first = target.list[0];
		reconcile(target, { list: [{ id: 1 }, { id: 99 }] });
		expect(target.list).toBe(list);
		expect(target.list[0]).toBe(first); // unchanged element keeps identity
		expect(target.list[1].id).toBe(99);
	});

	it('grows and shrinks arrays', () => {
		const grow = { list: [1, 2] };
		reconcile(grow, { list: [1, 2, 3] });
		expect(grow.list).toEqual([1, 2, 3]);

		const shrink = { list: [1, 2, 3] };
		reconcile(shrink, { list: [1] });
		expect(shrink.list).toEqual([1]);
	});

	it('replaces wholesale on a shape change (object ↔ array ↔ primitive)', () => {
		expect(reconcile({ a: 1 }, [1, 2])).toEqual([1, 2]);
		expect(reconcile([1, 2], { a: 1 })).toEqual({ a: 1 });
		expect(reconcile({ a: 1 }, 5)).toBe(5);
	});

	it('handles a realistic projection-style update with minimal churn', () => {
		const room = {
			roomCode: 'ABCD',
			revision: 4,
			phase: 'navigation',
			players: {
				red: { vp: 3, pendingDestination: null },
				blue: { vp: 1, pendingDestination: null }
			},
			navigation: { red: { locked: false }, blue: { locked: false } }
		};
		const blue = room.players.blue;
		const next = JSON.parse(JSON.stringify(room));
		next.revision = 5;
		next.players.red.pendingDestination = 'forest';
		next.navigation.red.locked = true;

		reconcile(room, next);

		expect(room.revision).toBe(5);
		expect(room.players.red.pendingDestination).toBe('forest');
		expect(room.navigation.red.locked).toBe(true);
		// Blue was untouched → identity preserved.
		expect(room.players.blue).toBe(blue);
	});
});
