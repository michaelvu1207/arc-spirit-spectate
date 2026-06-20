import { describe, it, expect } from 'vitest';
import { createRng, nextRandom, nextInt, nextId, hashString } from './rng';

describe('rng', () => {
	it('is deterministic for a given seed', () => {
		const a = createRng(123);
		const b = createRng(123);
		const seqA = Array.from({ length: 10 }, () => nextRandom(a));
		const seqB = Array.from({ length: 10 }, () => nextRandom(b));
		expect(seqA).toEqual(seqB);
	});

	it('produces different streams for different seeds', () => {
		const a = createRng(1);
		const b = createRng(2);
		const seqA = Array.from({ length: 5 }, () => nextRandom(a));
		const seqB = Array.from({ length: 5 }, () => nextRandom(b));
		expect(seqA).not.toEqual(seqB);
	});

	it('is resumable from a serialized cursor', () => {
		const live = createRng(777);
		Array.from({ length: 4 }, () => nextRandom(live));
		// Persist + restore the two integers, then continue.
		const restored = JSON.parse(JSON.stringify(live));
		const fresh = createRng(777);
		Array.from({ length: 4 }, () => nextRandom(fresh));
		expect(nextRandom(restored)).toBe(nextRandom(fresh));
	});

	it('nextRandom stays within [0, 1)', () => {
		const r = createRng(42);
		for (let i = 0; i < 1000; i += 1) {
			const v = nextRandom(r);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('nextInt stays within bounds and handles non-positive', () => {
		const r = createRng(9);
		for (let i = 0; i < 200; i += 1) {
			const v = nextInt(r, 6);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(6);
			expect(Number.isInteger(v)).toBe(true);
		}
		expect(nextInt(r, 0)).toBe(0);
		expect(nextInt(r, -3)).toBe(0);
	});

	it('nextId is prefixed and deterministic', () => {
		const a = createRng(5);
		const b = createRng(5);
		expect(nextId(a, 'die')).toBe(nextId(b, 'die'));
		expect(nextId(a, 'die').startsWith('die_')).toBe(true);
	});

	it('hashString is stable', () => {
		expect(hashString('ROOM42')).toBe(hashString('ROOM42'));
		expect(hashString('ROOM42')).not.toBe(hashString('ROOM43'));
	});
});
