/**
 * Spirit draw-bag construction + shuffling.
 *
 * Faithful port of the Tabletop Simulator implementation:
 *   - AssetLoaderLib.ttslua BAG_CONFIGS partitions the regular spirits into two
 *     draw bags by `cost` via `filterSpiritsByCost(regular, min, max)`:
 *       • "Spirit World Bag"  → cost 1–5 (inclusive)
 *       • "Arcane Abyss Bag"  → cost 7–9 (inclusive)
 *     Spirits whose cost falls OUTSIDE both ranges (e.g. the cost-15 spirits) are
 *     in NEITHER regular draw bag.
 *   - Both bags carry `shuffle = true`, and MarketLib re-shuffles on refill, so a
 *     fresh game does NOT deal spirits in catalog/alphabetical order.
 *
 * The reducer is a pure function of (state, command); all randomness here flows
 * through the deterministic `RngState` so the same seed always reproduces the
 * same bag order (mirrors TTS shuffle, but replayable + unit-testable).
 */

import type { RngState } from './rng';
import { nextInt } from './rng';
import type { SpiritSourceBag } from './types';

export const SPIRIT_WORLD_BAG: SpiritSourceBag = 'Spirit World Bag';
export const ARCANE_ABYSS_BAG: SpiritSourceBag = 'Arcane Abyss Bag';

/** Spirit World Bag cost range (inclusive), mirroring filterSpiritsByCost(regular, 1, 5). */
export const SPIRIT_WORLD_COST_MIN = 1;
export const SPIRIT_WORLD_COST_MAX = 5;
/** Arcane Abyss Bag cost range (inclusive), mirroring filterSpiritsByCost(regular, 7, 9). */
export const ARCANE_ABYSS_COST_MIN = 7;
export const ARCANE_ABYSS_COST_MAX = 9;

/**
 * Copies of a spirit seeded into the draw bag, by cost — the per-cost "deck
 * multiplier". The live values come from the editions table (the Complete
 * edition's `cost_duplicates`), threaded through the catalog. This constant
 * mirrors that edition as the offline/test default; a cost absent from the table
 * seeds 1 copy. (e.g. cost 1 → 2 copies, cost 3 → 3, cost 7/9 → 1.)
 */
export const DEFAULT_COST_DUPLICATES: Record<string, number> = {
	'1': 2,
	'3': 3,
	'4': 2,
	'5': 2,
	'7': 1,
	'9': 1,
	'11': 1,
	'13': 1,
	'15': 1,
	'17': 1
};

export function deckCopiesForCost(cost: number, duplicates?: Record<string, number> | null): number {
	const table = duplicates ?? DEFAULT_COST_DUPLICATES;
	return table[String(cost)] ?? 1;
}

/**
 * Which regular draw bag a spirit belongs to, purely by its `cost`, or `null`
 * when the cost falls outside BOTH inclusive ranges (so the spirit is in no
 * regular draw bag — e.g. the cost-6 boundary and the cost-15 spirits). This is
 * the range-based equivalent of TTS's two `filterSpiritsByCost` calls.
 */
export function bagForSpiritCost(cost: number): SpiritSourceBag | null {
	if (cost >= SPIRIT_WORLD_COST_MIN && cost <= SPIRIT_WORLD_COST_MAX) {
		return SPIRIT_WORLD_BAG;
	}
	if (cost >= ARCANE_ABYSS_COST_MIN && cost <= ARCANE_ABYSS_COST_MAX) {
		return ARCANE_ABYSS_BAG;
	}
	return null;
}

/**
 * Deterministic in-place Fisher–Yates shuffle driven by `nextInt(rng, …)`.
 *
 * Mirrors TTS `shuffle = true`: the same `RngState` (same seed + cursor)
 * produces the same order, and advancing the shared cursor keeps the whole
 * game's RNG stream replayable. Returns the same array reference for chaining.
 */
export function shuffleBag<T>(contents: T[], rng: RngState): T[] {
	for (let i = contents.length - 1; i > 0; i -= 1) {
		const j = nextInt(rng, i + 1);
		const tmp = contents[i]!;
		contents[i] = contents[j]!;
		contents[j] = tmp;
	}
	return contents;
}
