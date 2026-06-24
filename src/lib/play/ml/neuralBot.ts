/**
 * Production neural bot — the trained candidate-scoring policy, packaged to drop into the
 * live server bot driver (`server/botSim.ts`) exactly like the heuristic planner.
 *
 *   planNeuralPhaseActions(state, seat, catalog) → GameCommand[]
 *
 * Same shape/contract as `planBotPhaseActions`: returns the batch of commands the bot wants
 * to issue for the CURRENT phase. We greedily pick one legal action at a time (scored by the
 * net), simulating locally on the pure reducer to build the list, until the seat no longer
 * needs to act (a navigation lock / encounter resolve / commit ends its turn) or a safety
 * cap is hit. botSim then issues the returned commands for real via the CAS path.
 *
 * Weights are loaded once from the bundled export (ml/train.py → policy-weights.json). If no
 * trained weights are present the loader returns null and the caller falls back to heuristics,
 * so this never breaks a build or a live game.
 */

import { botSeatNeedsToAct } from '../server/botPolicy';
import { VP_TO_WIN, type GameCommand, type PlayCatalog, type PublicGameState, type SeatColor } from '../types';
import { encodeAction, encodeObs } from './encode';
import { legalActionsWithNext, type LegalAction } from './actions';
import { loadPolicyWeights, type NeuralPolicy } from './net';

/** Safety cap on actions per phase so a degenerate policy can never loop forever. */
const MAX_ACTIONS_PER_PHASE = 40;

/**
 * Weight on the immediate VP gained by an action, on top of the value head's estimate of
 * the resulting position. VP is the win condition, so rewarding it directly makes the bot
 * actually fight monsters / launch the +3-VP PvP attack instead of idling — the policy head
 * alone (trained by imitation) collapses to frequent filler actions.
 */
const VP_SHAPE = 1.0;
/** Reward for an action that immediately wins the game (reaches the VP target). */
const WIN_SCORE = 1e6;
/**
 * Reward for descending the corruption ladder toward Fallen. Under current rules the ONLY
 * winning line at 4+ players is the Fallen group-attack (+3 VP/round) — so deliberately
 * corrupting to Fallen is correct, the opposite of normal play. This shaping makes the
 * value-lookahead actively seek the setup the sparse VP signal can't reach on its own.
 */
const STATUS_SHAPE = 0.25;
/**
 * Penalty for an action that leaves the player's material situation unchanged within the same
 * phase (e.g. `refillMarket` with no purchase). The value head is smooth, so without this the
 * lookahead ties and collapses onto such no-ops, spamming them until the safety cap. Penalizing
 * them forces the bot toward actions that actually change its position or advance the phase.
 */
const NOOP_PENALTY = 0.5;

/** Cheap signature of a player's material state; ignores cosmetic churn (market refills, dice
 *  positions) so only meaningful changes count as "progress". */
function materialSig(state: PublicGameState, seat: SeatColor): string {
	const p = state.players[seat];
	if (!p) return `${state.phase}:${state.round}`;
	return [
		state.phase,
		state.round,
		p.victoryPoints,
		p.statusLevel,
		p.barrier,
		p.maxBarrier,
		p.spirits?.length ?? 0,
		p.attackDice?.length ?? 0,
		p.mats?.length ?? 0,
		p.handDraws?.length ?? 0,
		p.pendingDraw ? 1 : 0
	].join('|');
}

/**
 * Score each legal candidate by 1-ply lookahead over the REAL engine: the value head's
 * estimate of the resulting position for `seat`, plus the immediate VP it gains. Uses the
 * next-states the legality dry-run already produced — no extra simulation cost.
 */
export function scoreByValue(
	policy: NeuralPolicy,
	state: PublicGameState,
	seat: SeatColor,
	withNext: LegalAction[]
): number[] {
	const curVP = state.players[seat]?.victoryPoints ?? 0;
	const curStatus = state.players[seat]?.statusLevel ?? 0;
	const curSig = materialSig(state, seat);
	// Only chase corruption while there are enough players for the PvP line to pay off.
	const pvpMeta = state.activeSeats.length >= 3;
	return withNext.map(({ next }) => {
		if (next.winnerSeat === seat) return WIN_SCORE;
		const v = policy.value(encodeObs(next, seat));
		const dVP = ((next.players[seat]?.victoryPoints ?? 0) - curVP) / VP_TO_WIN;
		const dStatus = pvpMeta ? ((next.players[seat]?.statusLevel ?? 0) - curStatus) / 3 : 0;
		const noop = materialSig(next, seat) === curSig ? NOOP_PENALTY : 0;
		return v + VP_SHAPE * dVP + STATUS_SHAPE * dStatus - noop;
	});
}

/**
 * HYBRID selection — the production policy. Combines the imitation policy (which learned the
 * champion's strategic POSITIONING: camp the Rest chokepoint, fight to corrupt → Fallen) with
 * a hard "never pass up VP" rule via 1-ply lookahead. The decisive winning action — the
 * Fallen group-attack `initiatePvp` (+3 VP) — is RARE in the data, so behaviour-cloning skips
 * it; but it gives immediate VP, so the lookahead always grabs it. This fixes the "sets up the
 * hunt but never pulls the trigger" failure that left BC-only at ~0 VP.
 */
export function hybridIndex(
	policy: NeuralPolicy,
	state: PublicGameState,
	seat: SeatColor,
	withNext: LegalAction[],
	opts?: { sample?: boolean; temperature?: number; rand?: () => number }
): number {
	if (withNext.length <= 1) return 0;
	const curVP = state.players[seat]?.victoryPoints ?? 0;
	// 1) Take an outright win immediately; otherwise the largest immediate VP gain (if any).
	let bestVpIdx = -1;
	let bestVpGain = 0;
	for (let i = 0; i < withNext.length; i++) {
		const n = withNext[i].next;
		if (n.winnerSeat === seat) return i;
		const gain = (n.players[seat]?.victoryPoints ?? 0) - curVP;
		if (gain > bestVpGain) {
			bestVpGain = gain;
			bestVpIdx = i;
		}
	}
	if (bestVpIdx >= 0 && bestVpGain > 0) return bestVpIdx;
	// 1b) Always launch the Fallen group attack when it's available. `initiatePvp` is ONLY
	// legal when this seat is Fallen and co-located with Good players — i.e. exactly the
	// winning condition — but its +3 VP is applied at encounter RESOLUTION (next phase), so
	// the immediate-VP check above can't see it and behaviour-cloning skips the rare action.
	const pvp = withNext.findIndex((x) => x.cmd.type === 'initiatePvp');
	if (pvp >= 0) return pvp;
	// 2) No immediate VP → the learned POLICY head positions (distilled by AWR self-play from
	// the agent's OWN winning trajectories). Tactical VP/PvP grabs above are deterministic; the
	// policy handles the strategic positioning (go to the Abyss, corrupt, camp the chokepoint).
	const cands = withNext.map((x) => x.cmd);
	return policy.pick(encodeObs(state, seat), cands.map((c) => encodeAction(state, seat, c)), {
		sample: opts?.sample,
		temperature: opts?.temperature,
		rand: opts?.rand
	});
}

/** Pick a candidate index by value-lookahead. Greedy by default; softmax-sample for
 *  exploration during self-play data generation. */
export function valueGuidedIndex(
	policy: NeuralPolicy,
	state: PublicGameState,
	seat: SeatColor,
	withNext: LegalAction[],
	opts?: { sample?: boolean; temperature?: number; rand?: () => number }
): number {
	const scores = scoreByValue(policy, state, seat, withNext);
	if (scores.length <= 1) return 0;
	if (!opts?.sample) {
		let best = 0;
		for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
		return best;
	}
	const t = Math.max(1e-3, opts.temperature ?? 0.1);
	let max = -Infinity;
	for (const s of scores) if (s > max) max = s;
	const exps = scores.map((s) => Math.exp((s - max) / t));
	const sum = exps.reduce((a, b) => a + b, 0) || 1;
	const r = (opts.rand ?? Math.random)();
	let acc = 0;
	for (let i = 0; i < exps.length; i++) {
		acc += exps[i] / sum;
		if (r <= acc) return i;
	}
	return exps.length - 1;
}

let cached: NeuralPolicy | null | undefined;

/**
 * Load the bundled trained weights once. Returns null (and caches it) if they're absent or
 * malformed, so callers transparently fall back to the heuristic. Uses a dynamic import so a
 * missing weights file is a caught runtime no-op, not a build failure.
 */
export async function getNeuralPolicy(): Promise<NeuralPolicy | null> {
	if (cached !== undefined) return cached;
	try {
		const mod = await import('./policy-weights.json');
		const json = (mod as { default?: unknown }).default ?? mod;
		if (!json || (json as { format?: string }).format !== 'arc-cand-scorer-v1') {
			cached = null;
		} else {
			cached = loadPolicyWeights(json);
		}
	} catch {
		cached = null;
	}
	return cached;
}

/** Synchronous variant when the caller already holds a policy (e.g. self-play / eval).
 *  Returns the batch of commands for the current phase, chosen by value-lookahead. */
export function planNeuralPhaseActions(
	state: PublicGameState,
	seat: SeatColor,
	catalog: PlayCatalog,
	policy: NeuralPolicy
): GameCommand[] {
	const out: GameCommand[] = [];
	let s = state;
	let guard = 0;
	while (botSeatNeedsToAct(s, seat) && guard < MAX_ACTIONS_PER_PHASE) {
		guard += 1;
		const withNext = legalActionsWithNext(s, seat, catalog);
		if (withNext.length === 0) break;
		// Production baseline = champion-imitation POLICY head (hunter-style positioning),
		// plus the hard "always fire the Fallen group attack when legal" rule (rare in data,
		// but the win condition). NOTE: this is a BASELINE — it positions like the hunter but
		// does not reliably execute the deliberate corruption→Fallen setup; beating the
		// heuristics needs the RL scale-up (see ml/README.md "Status").
		const cands = withNext.map((x) => x.cmd);
		const pvp = cands.findIndex((c) => c.type === 'initiatePvp');
		const idx =
			pvp >= 0
				? pvp
				: cands.length === 1
					? 0
					: policy.pick(encodeObs(s, seat), cands.map((c) => encodeAction(s, seat, c)), { sample: false });
		out.push(withNext[idx].cmd);
		s = withNext[idx].next;
	}
	return out;
}
