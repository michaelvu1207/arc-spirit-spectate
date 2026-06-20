/**
 * Generic rune-cost matcher used by the awakening gate.
 *
 * Given a spirit's normalized {@link AwakenRuneRequirement}s and a player's held
 * rune slots, decide whether the cost can be paid and — if so — exactly which
 * rune slots to consume. This is pure, per-spirit-agnostic code: requirements are
 * matched by `runeId` (falling back to display `name`), wildcard requirements
 * accept any spendable rune OF THE KIND THEY STAND FOR, and counts are honoured
 * without double-counting a single held rune.
 *
 * Kept deliberately small and dependency-light so both {@link checkAwakenCondition}
 * and {@link payAwakenCondition} (and bots) share one source of truth.
 */

import type { RuneSlotSnapshot } from '$lib/types';
import type { AwakenRuneRequirement, MatItemKind } from '../types';
import { WILDCARD_RUNE_IDS } from '../awakenConditions';

/** A held rune the player could spend (a slot with `hasRune === true`). */
export interface SpendableRune {
	/** Index into the player's `runes` array (the slot we'd flip to hasRune:false). */
	arrayIndex: number;
	/** Stable per-instance identifier, when present (snapshot `guid`). */
	instanceId: string | undefined;
	/** The rune's catalog id, when known. */
	id: string | undefined;
	/** The rune's display name, when known. */
	name: string | undefined;
	/**
	 * The held item's kind, derived from its FK columns with the same rule as the
	 * catalog (`classId` ⇒ 'augment', else `originId` ⇒ 'rune', else 'relic').
	 * `undefined` only when the slot is too sparse to classify. Used so a WILDCARD
	 * requirement consumes only items of the kind it accepts.
	 */
	kind: MatItemKind | undefined;
}

/** Outcome of a match attempt: satisfiable + the chosen slots (array indices). */
export interface RuneMatchResult {
	ok: boolean;
	/** Array indices (into the player's `runes`) chosen to pay the cost, in order. */
	consumedIndices: number[];
}

/** A rune slot is spendable iff it actually holds a rune. */
export function spendableRunes(runes: RuneSlotSnapshot[]): SpendableRune[] {
	const out: SpendableRune[] = [];
	for (let arrayIndex = 0; arrayIndex < runes.length; arrayIndex += 1) {
		const slot = runes[arrayIndex];
		if (!slot?.hasRune) continue;
		// Derive kind from the slot's FK columns, mirroring the catalog `runeKind`
		// rule (server/catalog.ts): class ⇒ augment, else origin ⇒ rune, else relic.
		const kind: MatItemKind = slot.classId ? 'augment' : slot.originId ? 'rune' : 'relic';
		out.push({
			arrayIndex,
			instanceId: slot.guid,
			id: slot.id,
			name: slot.name,
			kind
		});
	}
	return out;
}

/** Does a held rune satisfy a NAMED (non-wildcard) requirement? */
function namedMatch(req: AwakenRuneRequirement, rune: SpendableRune): boolean {
	if (rune.id && rune.id === req.runeId) return true;
	// Fall back to display name when the held rune carries no catalog id.
	return !rune.id && rune.name != null && rune.name === req.name;
}

/**
 * Does a held rune satisfy a WILDCARD requirement? A wildcard is KIND-STRICT and
 * accepts ONLY items of the kind it stands for: "Any Rune" ⇒ origin runes;
 * "Any Relic" ⇒ relics. A rune never pays a relic cost and a relic never pays a
 * rune cost. An unrecognized wildcard id matches NOTHING (returns false).
 */
function wildcardMatch(req: AwakenRuneRequirement, rune: SpendableRune): boolean {
	if (req.runeId === WILDCARD_RUNE_IDS.anyRune) return rune.kind === 'rune';
	if (req.runeId === WILDCARD_RUNE_IDS.anyRelic) return rune.kind === 'relic';
	return false;
}

/**
 * Try to satisfy every requirement from `available`, preferring an explicit
 * `preferIds` ordering (instance ids the caller asked to spend first). Returns
 * the chosen array indices, or `ok:false` if the cost cannot be met.
 *
 * Strategy: assign NAMED requirements first (so exact-name matches are consumed
 * before being eaten by a wildcard), then assign wildcard requirements from
 * whatever remains. No held rune is ever assigned to two requirements.
 */
export function matchRuneCost(
	requirements: AwakenRuneRequirement[],
	available: SpendableRune[],
	preferIds?: string[]
): RuneMatchResult {
	const used = new Set<number>(); // array indices already consumed
	const consumedIndices: number[] = [];

	// Caller-preferred instance ids first, then the natural slot order.
	const preference = new Set(preferIds ?? []);
	const ordered = [...available].sort((a, b) => {
		const ap = a.instanceId && preference.has(a.instanceId) ? 0 : 1;
		const bp = b.instanceId && preference.has(b.instanceId) ? 0 : 1;
		if (ap !== bp) return ap - bp;
		return a.arrayIndex - b.arrayIndex;
	});

	const take = (predicate: (rune: SpendableRune) => boolean): boolean => {
		for (const rune of ordered) {
			if (used.has(rune.arrayIndex)) continue;
			if (!predicate(rune)) continue;
			used.add(rune.arrayIndex);
			consumedIndices.push(rune.arrayIndex);
			return true;
		}
		return false;
	};

	// Pass 1: every NAMED requirement (count copies each).
	for (const req of requirements) {
		if (req.wildcard) continue;
		for (let n = 0; n < req.count; n += 1) {
			if (!take((rune) => namedMatch(req, rune))) {
				return { ok: false, consumedIndices: [] };
			}
		}
	}

	// Pass 2: every WILDCARD requirement consumes any remaining spendable rune
	// OF THE KIND IT ACCEPTS ("Any Relic" only consumes relics, "Any Rune" only
	// consumes origin runes) — never an item of the wrong kind.
	for (const req of requirements) {
		if (!req.wildcard) continue;
		for (let n = 0; n < req.count; n += 1) {
			if (!take((rune) => wildcardMatch(req, rune))) {
				return { ok: false, consumedIndices: [] };
			}
		}
	}

	return { ok: true, consumedIndices };
}
