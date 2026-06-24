/**
 * Parity harness — the safety gate for the in-place (`mutate:true`) fast path. Drives full
 * games and records a state hash after EVERY applied command, in both clone-mode and
 * mutate-mode, then asserts the hash sequences are byte-identical. If the in-place reducer ever
 * diverges from the canonical cloning reducer (e.g. a handler that mutates-then-fails), this
 * fails. Runs in normal `npm test` (no env gate) so it's a permanent regression guard.
 */
import { describe, it, expect } from 'vitest';
import { applyGameCommand, applyDeadlineAdvance, createLobbyState } from '../runtime';
import { createRng, nextInt, type RngState } from '../rng';
import { botActorFor, botSeatNeedsToAct, planBotPhaseActions, profileFor, type BotRandom } from '../server/botPolicy';
import { SEAT_COLORS, type GameActor, type PublicGameState, type SeatColor } from '../types';
import { hasCatalog, loadPlayCatalogSync } from './_catalogSync';

function botRandom(rng: RngState): BotRandom {
	return { int: (m: number) => nextInt(rng, m), chance: () => nextInt(rng, 2) === 0 };
}

// Non-deterministic / wall-clock fields unrelated to game logic — excluded from the parity
// comparison (they differ between two separately-timestamped runs, not between clone vs mutate).
const IGNORED_KEYS = new Set(['gameId', 'phaseDeadline', 'navigationDeadline', 'navigationFullDeadline']);

/** Canonical, key-order-independent serialization — so we compare LOGICAL state, not the key
 *  insertion order (a JSON-cloned object reorders keys vs a live mutated one; both are equal). */
function stableStringify(v: unknown): string {
	if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
	if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj)
		.filter((k) => obj[k] !== undefined && !IGNORED_KEYS.has(k))
		.sort();
	return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** Drive a full game, hashing state after each applied command. `mutate` toggles the fast path. */
function playAndHash(
	catalog: Parameters<typeof applyGameCommand>[3],
	seed: number,
	nSeats: number,
	maxRounds: number,
	mutate: boolean,
	// Per-seat bot profile kinds (cycled if shorter than nSeats). Defaults to all-`medium`.
	// The data-gen FIELD profiles drive different planMediumPhaseActions branches (PvP initiation,
	// abyss-fishing, arcane trades, corruption-discard loops) than medium alone, so passing them
	// here permanently guards the in-place fast path on exactly the command surface data-gen emits.
	profileKinds: string[] = ['medium']
): { hashes: string[]; finalVP: Record<string, number>; rounds: number } {
	const seats = SEAT_COLORS.slice(0, nSeats) as SeatColor[];
	const guardianNames = catalog.guardians.slice(0, nSeats).map((g) => g.name);
	let state = createLobbyState({ roomCode: 'PAR', guardianNames });
	const host: GameActor = { memberId: 'host', displayName: 'host', role: 'host', seatColor: null };
	const ok = (r: ReturnType<typeof applyGameCommand>): PublicGameState => {
		if (!r.ok) throw new Error(r.error.code);
		return r.state;
	};
	// Setup always uses the cloning path (not the hot loop).
	seats.forEach((seat, i) => {
		const id = `bot-${seat}`;
		state = ok(applyGameCommand(state, { memberId: id, displayName: seat, role: 'player', seatColor: null }, { type: 'claimSeat', seatColor: seat }, catalog));
		state = ok(applyGameCommand(state, { memberId: id, displayName: seat, role: 'player', seatColor: seat }, { type: 'selectGuardian', guardianName: guardianNames[i] }, catalog));
	});
	state = ok(applyGameCommand(state, host, { type: 'startGame', seed }, catalog));

	const rng = botRandom(createRng(seed));
	const profiles = Object.fromEntries(seats.map((s, i) => [s, profileFor(profileKinds[i % profileKinds.length])]));
	const opts = mutate ? { mutate: true } : undefined;
	const hashes: string[] = [];
	let ticks = 0;
	while (state.status === 'active' && state.round <= maxRounds && ticks < 20000) {
		ticks++;
		let progressed = false;
		for (const seat of state.activeSeats) {
			if (!botSeatNeedsToAct(state, seat)) continue;
			for (const cmd of planBotPhaseActions(state, seat, catalog, rng, profiles[seat])) {
				const r = applyGameCommand(state, botActorFor(state, seat), cmd, catalog, opts);
				if (!r.ok) {
					hashes.push(`REJ:${r.error.code}`);
					break;
				}
				state = r.state;
				progressed = true;
				if (state.status !== 'active') break;
			}
			if (state.status !== 'active') break;
		}
		if (!progressed && state.status === 'active') applyDeadlineAdvance(state, catalog);
		hashes.push(stableStringify(state)); // one canonical hash per tick (fast + catches divergence)
	}
	hashes.push(stableStringify(state)); // final state
	const finalVP: Record<string, number> = {};
	for (const s of seats) finalVP[s] = state.players[s]?.victoryPoints ?? 0;
	return { hashes, finalVP, rounds: state.round };
}

describe('in-place reducer parity', () => {
	it.skipIf(!hasCatalog())('mutate-mode produces byte-identical state to clone-mode across seeds', () => {
		// (timeout raised below; per-tick canonical hashing across 8 full games)
		const catalog = loadPlayCatalogSync();
		for (const seed of [1, 7, 42, 99, 123, 256, 1000, 2024]) {
			const a = playAndHash(catalog, seed, 4, 60, false);
			const b = playAndHash(catalog, seed, 4, 60, true);
			const firstDiff = a.hashes.findIndex((h, i) => h !== b.hashes[i]);
			if (firstDiff >= 0) {
				const x = a.hashes[firstDiff];
				const y = b.hashes[firstDiff];
				let i = 0;
				while (i < x.length && x[i] === y[i]) i++;
				// eslint-disable-next-line no-console
				console.log(`[parity] seed ${seed} diverge @step ${firstDiff}/${a.hashes.length} char ${i}\n  clone: …${x.slice(Math.max(0, i - 40), i + 80)}…\n  mutate:…${y.slice(Math.max(0, i - 40), i + 80)}…`);
			}
			expect(b.hashes.length, `seed ${seed}: step count`).toBe(a.hashes.length);
			expect(firstDiff, `seed ${seed}: first divergent step (state hash)`).toBe(-1);
			expect(b.finalVP, `seed ${seed}: final VP`).toEqual(a.finalVP);
		}
	}, 120000);

	it.skipIf(!hasCatalog())('mutate-mode matches clone-mode across the data-gen FIELD profiles', () => {
		// The medium-only run above does not exercise the strategy branches the ML data-gen FIELD
		// uses (ml/_gen.test.ts): PvP initiation, abyss-fishing, arcane trades, corruption-discard.
		// This run permanently guards the in-place fast path — and the driver's mutate:true commit
		// (ml/driver.ts) — on the exact command surface training data is generated from, rather than
		// relying on a one-time manual SHA-256 of the generated JSONL.
		const catalog = loadPlayCatalogSync();
		const FIELD = ['pvphunter', 'aggressive', 'cultivator', 'survivor', 'fighter', 'hard'];
		for (const seed of [3, 17, 88, 404, 2025]) {
			const a = playAndHash(catalog, seed, 4, 60, false, FIELD);
			const b = playAndHash(catalog, seed, 4, 60, true, FIELD);
			const firstDiff = a.hashes.findIndex((h, i) => h !== b.hashes[i]);
			if (firstDiff >= 0) {
				const x = a.hashes[firstDiff];
				const y = b.hashes[firstDiff];
				let i = 0;
				while (i < x.length && x[i] === y[i]) i++;
				// eslint-disable-next-line no-console
				console.log(`[parity:FIELD] seed ${seed} diverge @step ${firstDiff}/${a.hashes.length} char ${i}\n  clone: …${x.slice(Math.max(0, i - 40), i + 80)}…\n  mutate:…${y.slice(Math.max(0, i - 40), i + 80)}…`);
			}
			expect(b.hashes.length, `seed ${seed}: step count (FIELD)`).toBe(a.hashes.length);
			expect(firstDiff, `seed ${seed}: first divergent step (FIELD profiles)`).toBe(-1);
			expect(b.finalVP, `seed ${seed}: final VP (FIELD)`).toEqual(a.finalVP);
		}
	}, 120000);
});
