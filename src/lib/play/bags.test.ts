import { describe, expect, test } from 'vitest';
import { applyGameCommand, createLobbyState } from './runtime';
import { createRng } from './rng';
import {
	bagForSpiritCost,
	deckCopiesForCost,
	shuffleBag,
	SPIRIT_WORLD_BAG,
	ARCANE_ABYSS_BAG
} from './bags';
import type { GameActor, PlayCatalog, PublicGameState, SeatColor } from './types';

const HOST: GameActor = {
	memberId: 'member-host',
	displayName: 'Host Player',
	role: 'host',
	seatColor: null
};
const GUEST: GameActor = {
	memberId: 'member-guest',
	displayName: 'Guest Player',
	role: 'player',
	seatColor: null
};

// A catalog spanning every relevant cost boundary:
//   cost 1–5 → Spirit World Bag
//   cost 7–9 → Arcane Abyss Bag
//   cost 6   → NEITHER (boundary; absent from the DB but tested here)
//   cost 15  → NEITHER (the six excluded spirits in the live DB)
// Enough cost 1–5 spirits to deal 4×2 opening hands + a 6-slot market + leftovers.
const CATALOG: PlayCatalog = {
	guardians: [
		{ id: 'g-a', name: 'Myrtle', originId: 'o1' },
		{ id: 'g-b', name: 'Nyra', originId: 'o2' }
	],
	runes: [],
	classes: [],
	dice: [],
	spirits: [
		// 16 Spirit World spirits (cost 1–5), intentionally NOT in id-sorted cost order.
		{ id: 'w-01', name: 'Alpha', cost: 1, classes: {}, origins: {} },
		{ id: 'w-02', name: 'Bravo', cost: 2, classes: {}, origins: {} },
		{ id: 'w-03', name: 'Charlie', cost: 3, classes: {}, origins: {} },
		{ id: 'w-04', name: 'Delta', cost: 4, classes: {}, origins: {} },
		{ id: 'w-05', name: 'Echo', cost: 5, classes: {}, origins: {} },
		{ id: 'w-06', name: 'Foxtrot', cost: 1, classes: {}, origins: {} },
		{ id: 'w-07', name: 'Golf', cost: 2, classes: {}, origins: {} },
		{ id: 'w-08', name: 'Hotel', cost: 3, classes: {}, origins: {} },
		{ id: 'w-09', name: 'India', cost: 4, classes: {}, origins: {} },
		{ id: 'w-10', name: 'Juliet', cost: 5, classes: {}, origins: {} },
		{ id: 'w-11', name: 'Kilo', cost: 1, classes: {}, origins: {} },
		{ id: 'w-12', name: 'Lima', cost: 2, classes: {}, origins: {} },
		{ id: 'w-13', name: 'Mike', cost: 3, classes: {}, origins: {} },
		{ id: 'w-14', name: 'November', cost: 4, classes: {}, origins: {} },
		{ id: 'w-15', name: 'Oscar', cost: 5, classes: {}, origins: {} },
		{ id: 'w-16', name: 'Papa', cost: 1, classes: {}, origins: {} },
		// Arcane Abyss spirits (cost 7–9).
		{ id: 'a-01', name: 'Quebec', cost: 7, classes: {}, origins: {} },
		{ id: 'a-02', name: 'Romeo', cost: 8, classes: {}, origins: {} },
		{ id: 'a-03', name: 'Sierra', cost: 9, classes: {}, origins: {} },
		{ id: 'a-04', name: 'Tango', cost: 7, classes: {}, origins: {} },
		// Boundary / excluded spirits — must be in NEITHER bag.
		{ id: 'x-06a', name: 'Uniform', cost: 6, classes: {}, origins: {} },
		{ id: 'x-06b', name: 'Victor', cost: 6, classes: {}, origins: {} },
		{ id: 'x-15a', name: 'Whiskey', cost: 15, classes: {}, origins: {} },
		{ id: 'x-15b', name: 'Xray', cost: 15, classes: {}, origins: {} },
		{ id: 'x-15c', name: 'Yankee', cost: 15, classes: {}, origins: {} }
	]
};

const WORLD_IDS = CATALOG.spirits.filter((s) => s.cost >= 1 && s.cost <= 5).map((s) => s.id);
const ABYSS_IDS = CATALOG.spirits.filter((s) => s.cost >= 7 && s.cost <= 9).map((s) => s.id);
const EXCLUDED_IDS = CATALOG.spirits
	.filter((s) => s.cost === 6 || s.cost === 15)
	.map((s) => s.id);

const GUARDIAN_NAMES = CATALOG.guardians.map((g) => g.name);

/** Seat Red + Blue, pick guardians, and start with an explicit seed. */
function startGame(seed?: number): PublicGameState {
	let state = createLobbyState({ roomCode: 'BAGSIM', guardianNames: GUARDIAN_NAMES });
	const seats: SeatColor[] = ['Red', 'Blue'];
	const actors = [HOST, GUEST];
	seats.forEach((seat, i) => {
		const claim = applyGameCommand(state, actors[i]!, { type: 'claimSeat', seatColor: seat }, CATALOG);
		if (!claim.ok) throw new Error(claim.error.message);
		state = claim.state;
		const guardian = applyGameCommand(
			state,
			{ ...actors[i]!, seatColor: seat },
			{ type: 'selectGuardian', guardianName: GUARDIAN_NAMES[i]! },
			CATALOG
		);
		if (!guardian.ok) throw new Error(guardian.error.message);
		state = guardian.state;
	});
	const started = applyGameCommand(state, { ...HOST, seatColor: 'Red' }, { type: 'startGame', seed }, CATALOG);
	if (!started.ok) throw new Error(started.error.message);
	return started.state;
}

/** Every spirit id currently living in the Spirit World bag (market + bag + opening hands). */
function allWorldDealt(state: PublicGameState): string[] {
	const ids: string[] = [];
	for (const seat of state.activeSeats) {
		for (const s of state.players[seat]?.spirits ?? []) ids.push(s.id);
	}
	for (const slot of state.market) if (slot.spiritId) ids.push(slot.spiritId);
	for (const e of state.bags.hexSpirits.contents) if (e.id) ids.push(e.id);
	return ids;
}

describe('bagForSpiritCost partition (mirrors filterSpiritsByCost ranges)', () => {
	test('cost 1–5 → Spirit World Bag', () => {
		for (const cost of [1, 2, 3, 4, 5]) {
			expect(bagForSpiritCost(cost)).toBe(SPIRIT_WORLD_BAG);
		}
	});

	test('cost 7–9 → Arcane Abyss Bag', () => {
		for (const cost of [7, 8, 9]) {
			expect(bagForSpiritCost(cost)).toBe(ARCANE_ABYSS_BAG);
		}
	});

	test('cost 6 (boundary) and cost 15 (excluded) → NEITHER bag', () => {
		expect(bagForSpiritCost(6)).toBeNull();
		expect(bagForSpiritCost(15)).toBeNull();
		expect(bagForSpiritCost(0)).toBeNull();
		expect(bagForSpiritCost(10)).toBeNull();
	});

	test('deckCopiesForCost reads the per-cost deck multiplier (Complete edition default)', () => {
		expect(deckCopiesForCost(1)).toBe(2);
		expect(deckCopiesForCost(3)).toBe(3);
		expect(deckCopiesForCost(4)).toBe(2);
		expect(deckCopiesForCost(5)).toBe(2);
		for (const cost of [7, 9, 11, 13, 15, 17]) expect(deckCopiesForCost(cost)).toBe(1);
		// Costs absent from the table seed a single copy.
		for (const cost of [2, 6, 8]) expect(deckCopiesForCost(cost)).toBe(1);
		// An explicit edition override wins over the default; missing keys → 1.
		expect(deckCopiesForCost(3, { '3': 5 })).toBe(5);
		expect(deckCopiesForCost(9, { '3': 5 })).toBe(1);
	});
});

describe('shuffleBag (deterministic Fisher–Yates)', () => {
	test('same seed → same order; preserves membership (no loss/duplication)', () => {
		const a = Array.from({ length: 20 }, (_, i) => i);
		const b = [...a];
		const orderA = shuffleBag([...a], createRng(42));
		const orderB = shuffleBag([...b], createRng(42));
		expect(orderA).toEqual(orderB);
		expect([...orderA].sort((x, y) => x - y)).toEqual(a);
	});

	test('different seeds → different orders (overwhelmingly likely for n=20)', () => {
		const base = Array.from({ length: 20 }, (_, i) => i);
		const o1 = shuffleBag([...base], createRng(1));
		const o2 = shuffleBag([...base], createRng(2));
		expect(o1).not.toEqual(o2);
	});

	test('returns the same array reference (in-place) and advances the rng cursor', () => {
		const arr = [1, 2, 3, 4, 5];
		const rng = createRng(7);
		expect(shuffleBag(arr, rng)).toBe(arr);
		expect(rng.cursor).toBeGreaterThan(0);
	});
});

describe('startGame bag seeding (partition + deck multiplier + shuffle)', () => {
	test('Spirit World Bag holds EXACTLY the cost 1–5 spirits, Arcane Abyss EXACTLY cost 7–9', () => {
		const state = startGame(123);
		// Arcane Abyss bag is the abyssFallen runtime bag — it is never dealt at start,
		// so its full contents are exactly the cost 7–9 spirits.
		const abyssBagIds = state.bags.abyssFallen.contents.map((e) => e.id);
		expect(new Set(abyssBagIds)).toEqual(new Set(ABYSS_IDS));
		expect(abyssBagIds).toHaveLength(ABYSS_IDS.length);

		// The Spirit World pool is split across opening hands + market + the bag, so
		// reconstruct it and assert it equals exactly the cost 1–5 ids.
		const worldDealt = allWorldDealt(state);
		expect(new Set(worldDealt)).toEqual(new Set(WORLD_IDS));
	});

	test('cost-6 and cost-15 spirits are in NEITHER bag and are never dealt', () => {
		const state = startGame(123);
		const everywhere = [...allWorldDealt(state), ...state.bags.abyssFallen.contents.map((e) => e.id)];
		for (const excluded of EXCLUDED_IDS) {
			expect(everywhere).not.toContain(excluded);
		}
		// Sanity: 2 cost-6 + 3 cost-15 = 5 excluded spirits.
		expect(EXCLUDED_IDS).toHaveLength(5);
	});

	test('seeds the per-cost deck multiplier for Spirit World, one copy of each Arcane Abyss', () => {
		const state = startGame(123);
		// Count copies of each Spirit World spirit across opening hands + market + bag.
		const worldDealt = allWorldDealt(state);
		const counts = new Map<string, number>();
		for (const id of worldDealt) counts.set(id, (counts.get(id) ?? 0) + 1);
		for (const spirit of CATALOG.spirits) {
			if (spirit.cost < 1 || spirit.cost > 5) continue;
			expect(counts.get(spirit.id) ?? 0).toBe(deckCopiesForCost(spirit.cost));
		}
		// Arcane Abyss spirits seed exactly one copy each.
		const abyssIds = state.bags.abyssFallen.contents.map((e) => e.id);
		expect(new Set(abyssIds).size).toBe(abyssIds.length);
		expect(abyssIds).toHaveLength(ABYSS_IDS.length);
	});

	test('seeded order is NOT the catalog/alphabetical order (proves the shuffle)', () => {
		// The Spirit World bag, in catalog order, would deal w-01..w-16 sequentially:
		// opening hands w-01..w-08, market w-09..w-14, bag w-15,w-16. With shuffle on,
		// neither the opening hands nor the market should match that catalog order.
		const state = startGame(123);
		const red = state.players.Red!.spirits.map((s) => s.id);
		const marketOrder = state.market.map((slot) => slot.spiritId);
		expect(red).not.toEqual(['w-01', 'w-02', 'w-03', 'w-04']);
		expect(marketOrder).not.toEqual(['w-09', 'w-10', 'w-11', 'w-12', 'w-13', 'w-14']);
	});

	test('deterministic for a fixed seed — two starts with the same seed match exactly', () => {
		const a = startGame(2026);
		const b = startGame(2026);
		expect(a.market.map((s) => s.spiritId)).toEqual(b.market.map((s) => s.spiritId));
		expect(a.players.Red!.spirits.map((s) => s.id)).toEqual(b.players.Red!.spirits.map((s) => s.id));
		expect(a.bags.hexSpirits.contents.map((e) => e.id)).toEqual(b.bags.hexSpirits.contents.map((e) => e.id));
		expect(a.bags.abyssFallen.contents.map((e) => e.id)).toEqual(b.bags.abyssFallen.contents.map((e) => e.id));
	});

	test('two different seeds produce different orders / opening hands', () => {
		const a = startGame(1);
		const b = startGame(2);
		const handA = a.players.Red!.spirits.map((s) => s.id);
		const handB = b.players.Red!.spirits.map((s) => s.id);
		const marketA = a.market.map((s) => s.spiritId);
		const marketB = b.market.map((s) => s.spiritId);
		// At least one of the opening hand / market differs between the two seeds.
		expect(handA.join() !== handB.join() || marketA.join() !== marketB.join()).toBe(true);
	});
});
