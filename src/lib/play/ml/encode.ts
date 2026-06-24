/**
 * Feature encoders for the ML bot. Two pure functions turn engine state into the
 * fixed-length float vectors the candidate-scoring net consumes:
 *
 *   • encodeObs(state, seat)        → OBS_DIM floats  (the situation, from `seat`'s POV)
 *   • encodeAction(state, seat, cmd) → ACT_DIM floats (one candidate move)
 *
 * The net scores each legal candidate as score(concat(obs, actionFeat)); a softmax over
 * candidates is the policy. Keeping BOTH encoders here (and versioned by OBS_DIM/ACT_DIM)
 * guarantees the TypeScript forward pass and the Python trainer see identical features.
 *
 * Design rules:
 *   - Pure & deterministic: no RNG, no clock, no catalog lookups that vary by run.
 *   - Everything roughly normalized into [0,1] / small ranges so the net trains stably.
 *   - Append-only: add new features at the END and bump OBS_DIM/ACT_DIM, never reorder
 *     (old exported weights would silently misalign otherwise).
 */

import {
	GAME_PHASES,
	SEAT_COLORS,
	VP_TO_WIN,
	ALL_DESTINATIONS,
	isEvilAlignment,
	type GameCommand,
	type PrivatePlayerState,
	type PublicGameState,
	type SeatColor
} from '../types';

/** Rough horizon used to normalize the round counter. */
const ROUND_NORM = 36;
/** Generic divisor for "pool" counts (dice, mats, barrier) → keeps features ~[0,1]. */
const POOL_NORM = 10;
const BARRIER_NORM = 20;

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

function diceCountByTier(p: PrivatePlayerState): Record<string, number> {
	const out: Record<string, number> = { basic: 0, enchanted: 0, exalted: 0, arcane: 0 };
	for (const d of p.attackDice ?? []) out[d.tier] = (out[d.tier] ?? 0) + 1;
	return out;
}

function faceDownCount(p: PrivatePlayerState): number {
	return (p.spirits ?? []).filter((s) => s.isFaceDown).length;
}

/** 1 = leading, 0 = last. Placement of `seat` among active seats by VP (ties → better). */
function placementFraction(state: PublicGameState, seat: SeatColor): number {
	const me = state.players[seat]?.victoryPoints ?? 0;
	const others = state.activeSeats.filter((s) => s !== seat);
	if (others.length === 0) return 1;
	const ahead = others.filter((s) => (state.players[s]?.victoryPoints ?? 0) > me).length;
	return 1 - ahead / others.length;
}

/**
 * State features from `seat`'s point of view: global tempo, my resources, the field
 * (best opponent), and relative standing. ORDER IS PART OF THE CONTRACT — see header.
 */
export function encodeObs(state: PublicGameState, seat: SeatColor): number[] {
	const f: number[] = [];
	const me = state.players[seat];

	// ── Global / tempo ───────────────────────────────────────────────
	f.push(clamp01(state.round / ROUND_NORM));
	for (const ph of GAME_PHASES) f.push(state.phase === ph ? 1 : 0); // 6 phase one-hot
	f.push(clamp01(state.activeSeats.length / SEAT_COLORS.length));
	f.push(state.revealedDestinations ? 1 : 0);

	// Monster (Arcane Abyss) presence + threat.
	const mon = state.monster;
	f.push(mon ? 1 : 0);
	f.push(mon ? clamp01(mon.hp / Math.max(1, mon.maxHp)) : 0);
	f.push(mon ? clamp01(mon.livesRemaining / Math.max(1, mon.livesTotal)) : 0);
	f.push(mon ? clamp01(mon.ladderIndex / Math.max(1, mon.ladderMax)) : 0);
	f.push(mon ? clamp01(mon.damage / BARRIER_NORM) : 0);

	// ── Me ───────────────────────────────────────────────────────────
	if (me) {
		f.push(clamp01(me.victoryPoints / VP_TO_WIN));
		f.push(clamp01((VP_TO_WIN - me.victoryPoints) / VP_TO_WIN)); // distance to win
		f.push(clamp01(me.barrier / BARRIER_NORM));
		f.push(clamp01(me.maxBarrier / BARRIER_NORM));
		f.push(clamp01(me.brokenBarrier / BARRIER_NORM));
		f.push(clamp01(me.statusLevel / 3));
		f.push(clamp01((me.corruptionCount ?? 0) / 5));
		f.push(isEvilAlignment(me.statusLevel) ? 1 : 0);
		const dice = diceCountByTier(me);
		f.push(clamp01((me.attackDice?.length ?? 0) / POOL_NORM));
		f.push(clamp01(dice.basic / POOL_NORM));
		f.push(clamp01(dice.enchanted / POOL_NORM));
		f.push(clamp01(dice.exalted / POOL_NORM));
		f.push(clamp01(dice.arcane / POOL_NORM));
		f.push(clamp01((me.spirits?.length ?? 0) / 7));
		f.push(clamp01(faceDownCount(me) / 7));
		f.push(clamp01((me.mats?.length ?? 0) / POOL_NORM));
		f.push(clamp01((me.relics ?? 0) / POOL_NORM));
		f.push(clamp01((me.spiritAugments ?? 0) / POOL_NORM));
		f.push(clamp01((me.unplacedAugments?.length ?? 0) / POOL_NORM));
		f.push(me.pendingDraw ? 1 : 0);
		f.push(me.pendingDraw ? clamp01((me.pendingDraw.summonLimit - me.pendingDraw.summonedCount) / 5) : 0);
		f.push((me.handDraws?.length ?? 0) > 0 ? 1 : 0);
		f.push(me.pendingReward ? 1 : 0);
		f.push((me.pendingCorruptionDiscard?.count ?? 0) > 0 ? 1 : 0);
		f.push(clamp01((me.awakenOffers?.length ?? 0) / 7));
		f.push(me.phaseReady ? 1 : 0);
	} else {
		for (let i = 0; i < 26; i++) f.push(0); // must match the `me` block length above
	}

	// ── Field (best opponent) + relative standing ────────────────────
	const opps = state.activeSeats.filter((s) => s !== seat).map((s) => state.players[s]).filter(Boolean) as PrivatePlayerState[];
	const myVp = me?.victoryPoints ?? 0;
	let maxOppVp = 0;
	let sumOppVp = 0;
	let maxOppDice = 0;
	let maxOppBarrier = 0;
	let fallenOpps = 0;
	for (const o of opps) {
		maxOppVp = Math.max(maxOppVp, o.victoryPoints);
		sumOppVp += o.victoryPoints;
		maxOppDice = Math.max(maxOppDice, o.attackDice?.length ?? 0);
		maxOppBarrier = Math.max(maxOppBarrier, o.maxBarrier);
		if (isEvilAlignment(o.statusLevel)) fallenOpps += 1;
	}
	const meanOppVp = opps.length ? sumOppVp / opps.length : 0;
	f.push(clamp01(maxOppVp / VP_TO_WIN));
	f.push(clamp01(meanOppVp / VP_TO_WIN));
	f.push(clamp01(maxOppDice / POOL_NORM));
	f.push(clamp01(maxOppBarrier / BARRIER_NORM));
	f.push(clamp01(fallenOpps / SEAT_COLORS.length));
	f.push(placementFraction(state, seat));
	f.push(clamp01(0.5 + (myVp - maxOppVp) / (2 * VP_TO_WIN))); // VP lead over best, centered at 0.5

	// Co-location: how many opponents share my revealed destination (PvP exposure).
	let coLocated = 0;
	if (state.revealedDestinations && me) {
		const myDest = me.navigationDestination;
		for (const o of opps) if (myDest && o.navigationDestination === myDest) coLocated += 1;
	}
	f.push(clamp01(coLocated / SEAT_COLORS.length));

	return f;
}

/** Number of features encodeObs emits. Asserted in tests; also written to meta.json. */
export const OBS_DIM = 48;

// Command-type vocabulary for the action one-hot. Append-only; index is the contract.
const COMMAND_VOCAB: GameCommand['type'][] = [
	'lockNavigation',
	'selectNavigationDestination',
	'resolveLocationInteraction',
	'endLocationActions',
	'spawnHandSpirit',
	'discardHandDraws',
	'redrawHandDraws',
	'startCombat',
	'resolveMonsterReward',
	'initiatePvp',
	'passEncounter',
	'takeSpirit',
	'replaceSpirit',
	'absorbSpirit',
	'refillMarket',
	'awakenSpirit',
	'manualAwaken',
	'resolveDecision',
	'placeAugmentOnSpirit',
	'resolveAwakenReward',
	'discardSpirit',
	'discardRune',
	'commitBenefits',
	'commitAwakening',
	'commitCleanup',
	'commitRound',
	'flipSpirit',
	'forceAdvancePhase'
];
const VOCAB_INDEX: Partial<Record<GameCommand['type'], number>> = {};
COMMAND_VOCAB.forEach((t, i) => (VOCAB_INDEX[t] = i));

/** Number of generic numeric slots appended after the command one-hot. */
const ACTION_PARAM_SLOTS = 12;

/**
 * Action features for one candidate command: a command-type one-hot followed by
 * ACTION_PARAM_SLOTS generic numeric slots whose meaning is per-command (the net
 * learns to read them in the context of the one-hot). ORDER IS PART OF THE CONTRACT.
 */
export function encodeAction(state: PublicGameState, seat: SeatColor, cmd: GameCommand): number[] {
	const f: number[] = new Array(COMMAND_VOCAB.length + ACTION_PARAM_SLOTS).fill(0);
	const idx = VOCAB_INDEX[cmd.type];
	if (idx !== undefined) f[idx] = 1;
	const p = COMMAND_VOCAB.length; // base offset of the param slots
	const me = state.players[seat];

	switch (cmd.type) {
		case 'lockNavigation': {
			// Destination one-hot across the 5 destinations (slots p..p+4) + threat/colocation.
			const di = ALL_DESTINATIONS.indexOf(cmd.destination as (typeof ALL_DESTINATIONS)[number]);
			if (di >= 0 && di < 5) f[p + di] = 1;
			const isAbyss = cmd.destination === 'Arcane Abyss';
			f[p + 5] = isAbyss ? 1 : 0;
			f[p + 6] = isAbyss && state.monster ? clamp01(state.monster.damage / BARRIER_NORM) : 0;
			// How crowded the destination already is (other seats whose secret choice we can't
			// see pre-reveal → 0; post-reveal occupancy if available).
			const occ = state.locationOccupancy?.[cmd.destination as (typeof ALL_DESTINATIONS)[number]] ?? [];
			f[p + 7] = clamp01(occ.length / SEAT_COLORS.length);
			break;
		}
		case 'resolveLocationInteraction': {
			f[p] = clamp01(cmd.rowIndex / 8);
			f[p + 1] = cmd.choices && cmd.choices.length ? clamp01((cmd.choices[0] ?? 0) / 3) : 0;
			break;
		}
		case 'spawnHandSpirit': {
			// Featurize the drawn spirit being summoned (cost / face-down nature).
			const draw = me?.handDraws?.find((h) => h.guid === cmd.guid);
			if (draw) {
				f[p] = clamp01((draw.cost ?? 0) / 8);
				f[p + 1] = 1; // marker: a known draw
			}
			break;
		}
		case 'takeSpirit':
		case 'replaceSpirit': {
			const mi = (cmd as { marketIndex: number }).marketIndex;
			const slot = state.market?.[mi];
			f[p] = clamp01(mi / 8);
			f[p + 1] = slot?.spiritId ? 1 : 0;
			break;
		}
		case 'awakenSpirit':
		case 'flipSpirit':
		case 'discardSpirit': {
			const si = (cmd as { slotIndex: number }).slotIndex;
			f[p] = clamp01(si / 7);
			const sp = me?.spirits?.[si];
			f[p + 1] = sp?.isFaceDown ? 1 : 0;
			f[p + 2] = sp ? clamp01((sp.cost ?? 0) / 8) : 0;
			break;
		}
		case 'resolveMonsterReward': {
			f[p] = clamp01((cmd.picks?.length ?? 0) / 4);
			break;
		}
		case 'initiatePvp': {
			f[p] = me ? clamp01((me.attackDice?.length ?? 0) / POOL_NORM) : 0;
			break;
		}
		default:
			break;
	}
	return f;
}

/** Number of features encodeAction emits. */
export const ACT_DIM = COMMAND_VOCAB.length + ACTION_PARAM_SLOTS;
