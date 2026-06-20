/**
 * Deterministic, resumable PRNG for the play-game engine.
 *
 * The runtime reducer must be a pure function of (state, command): given the
 * same persisted state and command it must produce the same next state on every
 * client and on reload. `Math.random()` breaks that — combat dice, instance ids,
 * etc. would diverge across SSE clients and could not be unit-tested.
 *
 * Instead we persist a tiny RNG cursor in game state (`{ seed, cursor }`) and
 * derive every random value by hashing `(seed, cursor)`. Each draw bumps the
 * cursor, so the stream is fully reconstructable from the two integers alone —
 * exactly what we need for a JSON-serialized, reloadable state.
 */

export interface RngState {
	seed: number;
	cursor: number;
}

/** FNV-1a string hash → uint32. Used to derive a stable seed from a room code. */
export function hashString(input: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function createRng(seed: number): RngState {
	return { seed: seed >>> 0, cursor: 0 };
}

/**
 * Advance the cursor and return a float in [0, 1). Deterministic in
 * `(seed, cursor)` via a mulberry32-style integer hash, so it survives
 * serialization: persist `{ seed, cursor }` and the next call resumes the stream.
 */
export function nextRandom(rng: RngState): number {
	rng.cursor = (rng.cursor + 1) >>> 0;
	let t = (Math.imul(rng.cursor, 0x6d2b79f5) + rng.seed) >>> 0;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, maxExclusive). Returns 0 for non-positive bounds. */
export function nextInt(rng: RngState, maxExclusive: number): number {
	if (maxExclusive <= 0) return 0;
	return Math.floor(nextRandom(rng) * maxExclusive);
}

/** A short, collision-resistant-enough id for transient game objects. */
export function nextId(rng: RngState, prefix: string): string {
	const a = nextInt(rng, 0xffffffff).toString(36);
	const b = nextInt(rng, 0xffffffff).toString(36);
	return `${prefix}_${a}${b}`;
}
