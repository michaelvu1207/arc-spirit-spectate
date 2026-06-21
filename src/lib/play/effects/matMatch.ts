/**
 * Generic mat-cost matcher used by the awakening gate.
 *
 * Given a spirit's normalized {@link AwakenMatRequirement}s and a player's held
 * mat slots (runes + relics), decide whether the cost can be paid and — if so —
 * exactly which mat slots to consume. This is pure, per-spirit-agnostic code:
 * requirements are matched by `runeId` (falling back to display `name`), wildcard
 * requirements accept any spendable mat OF THE KIND THEY STAND FOR, and counts are
 * honoured without double-counting a single held mat.
 *
 * Kept deliberately small and dependency-light so both {@link checkAwakenCondition}
 * and {@link payAwakenCondition} (and bots) share one source of truth.
 */

import type { MatSlotSnapshot } from '$lib/types';
import type { AwakenMatRequirement, MatItemKind } from '../types';
import { WILDCARD_MAT_IDS } from '../awakenConditions';

/** A held mat the player could spend (a slot with `hasRune === true`). */
export interface SpendableMat {
	/** Index into the player's `mats` array (the slot we'd flip to hasRune:false). */
	arrayIndex: number;
	/** Stable per-instance identifier, when present (snapshot `guid`). */
	instanceId: string | undefined;
	/** The mat's catalog id, when known. */
	id: string | undefined;
	/** The mat's display name, when known. */
	name: string | undefined;
	/**
	 * The held item's kind, derived from its FK columns with the same rule as the
	 * catalog (`originId` ⇒ 'rune', else 'relic'). `undefined` only when the slot is
	 * too sparse to classify. Used so a WILDCARD requirement consumes only items of
	 * the kind it accepts.
	 */
	kind: MatItemKind | undefined;
}

/** Outcome of a match attempt: satisfiable + the chosen slots (array indices). */
export interface MatMatchResult {
	ok: boolean;
	/** Array indices (into the player's `mats`) chosen to pay the cost, in order. */
	consumedIndices: number[];
}

/** A mat slot is spendable iff it actually holds a mat. */
export function spendableMats(mats: MatSlotSnapshot[]): SpendableMat[] {
	const out: SpendableMat[] = [];
	for (let arrayIndex = 0; arrayIndex < mats.length; arrayIndex += 1) {
		const slot = mats[arrayIndex];
		if (!slot?.hasRune) continue;
		// Derive kind from the slot's FK columns, mirroring the catalog `matKind`
		// rule (server/catalog.ts): origin ⇒ rune, else relic.
		const kind: MatItemKind = slot.originId ? 'rune' : 'relic';
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

/** Does a held mat satisfy a NAMED (non-wildcard) requirement? */
function namedMatch(req: AwakenMatRequirement, mat: SpendableMat): boolean {
	if (mat.id && mat.id === req.runeId) return true;
	// Fall back to display name when the held mat carries no catalog id.
	return !mat.id && mat.name != null && mat.name === req.name;
}

/**
 * Does a held mat satisfy a WILDCARD requirement? A wildcard is KIND-STRICT and
 * accepts ONLY items of the kind it stands for: "Any Rune" ⇒ origin runes;
 * "Any Relic" ⇒ relics. A rune never pays a relic cost and a relic never pays a
 * rune cost. An unrecognized wildcard id matches NOTHING (returns false).
 */
function wildcardMatch(req: AwakenMatRequirement, mat: SpendableMat): boolean {
	if (req.runeId === WILDCARD_MAT_IDS.anyRune) return mat.kind === 'rune';
	if (req.runeId === WILDCARD_MAT_IDS.anyRelic) return mat.kind === 'relic';
	return false;
}

/**
 * Try to satisfy every requirement from `available`, preferring an explicit
 * `preferIds` ordering (instance ids the caller asked to spend first). Returns
 * the chosen array indices, or `ok:false` if the cost cannot be met.
 *
 * Strategy: assign NAMED requirements first (so exact-name matches are consumed
 * before being eaten by a wildcard), then assign wildcard requirements from
 * whatever remains. No held mat is ever assigned to two requirements.
 */
export function matchMatCost(
	requirements: AwakenMatRequirement[],
	available: SpendableMat[],
	preferIds?: string[]
): MatMatchResult {
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

	const take = (predicate: (mat: SpendableMat) => boolean): boolean => {
		for (const mat of ordered) {
			if (used.has(mat.arrayIndex)) continue;
			if (!predicate(mat)) continue;
			used.add(mat.arrayIndex);
			consumedIndices.push(mat.arrayIndex);
			return true;
		}
		return false;
	};

	// Pass 1: every NAMED requirement (count copies each).
	for (const req of requirements) {
		if (req.wildcard) continue;
		for (let n = 0; n < req.count; n += 1) {
			if (!take((mat) => namedMatch(req, mat))) {
				return { ok: false, consumedIndices: [] };
			}
		}
	}

	// Pass 2: every WILDCARD requirement consumes any remaining spendable mat
	// OF THE KIND IT ACCEPTS ("Any Relic" only consumes relics, "Any Rune" only
	// consumes origin runes) — never an item of the wrong kind.
	for (const req of requirements) {
		if (!req.wildcard) continue;
		for (let n = 0; n < req.count; n += 1) {
			if (!take((mat) => wildcardMatch(req, mat))) {
				return { ok: false, consumedIndices: [] };
			}
		}
	}

	return { ok: true, consumedIndices };
}
