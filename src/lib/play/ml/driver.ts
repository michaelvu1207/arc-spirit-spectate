/**
 * Recording self-play driver for the ML pipeline.
 *
 * One function plays a full game (lobby → finished/capped) and emits training samples.
 * Seats are driven either by the existing heuristic (`planBotPhaseActions`) or by a
 * NeuralPolicy choosing among `legalActions`. Every meaningful decision (a covered
 * candidate set with >1 option) is recorded as {obs, cands, chosen}; terminal
 * placement returns are stamped on afterward.
 *
 *   - Heuristic seats  → BC data: we record which legal candidate the heuristic's plan
 *     matched. This is the cold-start dataset (imitate the winners of heuristic games).
 *   - Neural seats     → on-policy data: we record what the net chose (optionally sampled
 *     for exploration). This is the AWR/iteration dataset.
 *
 * Mirrors sim/selfPlay.ts for setup + the no-progress deadline-advance, so it stays
 * faithful to how real games actually run.
 */

import { applyDeadlineAdvance, applyGameCommand, createLobbyState } from '../runtime';
import { createRng, nextInt, type RngState } from '../rng';
import {
	botActorFor,
	botSeatNeedsToAct,
	planBotPhaseActions,
	MEDIUM_DEFAULTS,
	type BotProfile,
	type BotRandom
} from '../server/botPolicy';
import { SEAT_COLORS, type GameActor, type GameCommand, type PlayCatalog, type PublicGameState, type SeatColor } from '../types';
import { encodeAction, encodeObs } from './encode';
import { legalActions, legalActionsWithNext, commandMatches } from './actions';
import { valueGuidedIndex, hybridIndex } from './neuralBot';
import { buildPotential, vpOf, vpReturnsToGo, BALANCED_SHAPING, type ShapingWeights } from './shaping';
import type { NeuralPolicy } from './net';

/** One recorded decision. `vp`/`phi` (VP and build-potential at decision time) are used to
 *  compute `ret` (VP-maximizing return-to-go) once the game's VP trajectory is known. */
export interface Sample {
	obs: number[];
	cands: number[][];
	chosen: number;
	ret: number;
	seat: SeatColor;
	vp: number;
	phi: number;
}

export interface RecordGameOptions {
	seed: number;
	/** One profile per seat; seat count = profiles.length. Used for heuristic seats and as
	 *  the unstick fallback for neural seats. */
	profiles: BotProfile[];
	maxRounds?: number;
	/** If set, these seats are driven by `policy`; the rest stay heuristic. Default: all
	 *  seats are neural when a policy is supplied, else all heuristic. */
	policy?: NeuralPolicy;
	neuralSeats?: SeatColor[];
	/** Sample from the softmax (exploration) instead of greedy argmax. */
	sample?: boolean;
	temperature?: number;
	/** How neural seats choose actions: 'hybrid' (default) = learned policy for positioning +
	 *  always grab immediate VP; 'policy' = imitation head only; 'value' = 1-ply value-lookahead. */
	selection?: 'hybrid' | 'value' | 'policy';
	/** Which seats to record decisions for. Default: neural seats (or all, heuristic mode). */
	recordSeats?: SeatColor[];
	/**
	 * Custom decision function. When supplied, the "neural" seats are driven by this instead of
	 * `policy.pick` — given the legal candidates, return the index to take. Lets you drop in a
	 * hand-written or alternative bot without changing the engine.
	 */
	chooser?: (obs: number[], candFeatures: number[][], cands: GameCommand[], seat: SeatColor, state: PublicGameState) => number;
	/**
	 * League play: per-seat opponent policies. A seat listed here is driven by ITS OWN policy
	 * (a sampled past checkpoint / exploiter), instead of `opts.policy` or a heuristic — so the
	 * learner trains against a diverse, strong, self-generated field rather than one weak bot.
	 * Opponent seats always play greedily (no recording). The learner seat(s) still use
	 * `opts.policy` + `recordSeats`.
	 */
	opponentPolicies?: Partial<Record<SeatColor, NeuralPolicy>>;
	/** Reward-shaping weights for the progress potential Φ (default BALANCED). Drives the
	 *  per-decision return-to-go; vary across a population for diverse playstyles. */
	shaping?: ShapingWeights;
	/** Discount for return-to-go (default 0.99). */
	gamma?: number;
}

export interface RecordGameResult {
	winnerSeat: SeatColor | null;
	finished: boolean;
	rounds: number;
	stalled: boolean;
	finalVP: Record<string, number>;
	samples: Sample[];
}

function seededBotRandom(rng: RngState): BotRandom {
	return {
		int: (maxExclusive: number) => nextInt(rng, maxExclusive),
		chance: () => nextInt(rng, 2) === 0
	};
}

/** Per (seat,round,phase) action cap so a mis-trained greedy net can't loop forever. */
const MAX_ACTIONS_PER_PHASE = 30;
const MAX_TICKS = 50_000;

/**
 * Command types that represent a genuine STRATEGIC choice worth recording as a training
 * decision. Recording calls `legalActions` (≈expensive — it dry-runs many candidates,
 * each deep-cloning state), so we only do it for these high-leverage commands, not for
 * the many mechanical/forced commands a heuristic plan also emits. The net thus learns
 * the decisions that matter; everything else stays heuristic-driven during cold start.
 */
const RECORDABLE_TYPES = new Set<GameCommand['type']>([
	'lockNavigation',
	'selectNavigationDestination',
	'resolveLocationInteraction',
	'spawnHandSpirit',
	'takeSpirit',
	'replaceSpirit',
	'absorbSpirit',
	'initiatePvp',
	'passEncounter',
	'startCombat',
	'resolveMonsterReward',
	'awakenSpirit',
	'resolveDecision',
	'placeAugmentOnSpirit',
	'resolveAwakenReward',
	'discardSpirit'
]);

export function playRecordingGame(catalog: PlayCatalog, opts: RecordGameOptions): RecordGameResult {
	const profiles = opts.profiles;
	const maxRounds = opts.maxRounds ?? 300;
	const n = Math.min(profiles.length, SEAT_COLORS.length, catalog.guardians.length);
	const seats = SEAT_COLORS.slice(0, n) as SeatColor[];
	const guardianNames = catalog.guardians.slice(0, n).map((g) => g.name);

	const hasController = !!(opts.policy || opts.chooser);
	const neuralSet = new Set<SeatColor>(
		hasController ? (opts.neuralSeats ?? seats) : []
	);
	const recordSet = new Set<SeatColor>(
		opts.recordSeats ?? (opts.policy ? Array.from(neuralSet) : seats)
	);
	const shaping = opts.shaping ?? BALANCED_SHAPING;
	const gamma = opts.gamma ?? 0.99;

	let state = createLobbyState({ roomCode: 'MLSIM', guardianNames });
	const host: GameActor = { memberId: 'host', displayName: 'host', role: 'host', seatColor: null };
	const profileBySeat: Record<string, BotProfile> = {};

	const expectOk = (r: ReturnType<typeof applyGameCommand>, label: string): void => {
		if (!r.ok) throw new Error(`${label}: ${r.error.code} ${r.error.message}`);
		state = r.state;
	};

	seats.forEach((seat, i) => {
		profileBySeat[seat] = profiles[i] ?? MEDIUM_DEFAULTS;
		const memberId = `bot-${seat}`;
		expectOk(
			applyGameCommand(state, { memberId, displayName: seat, role: 'player', seatColor: null }, { type: 'claimSeat', seatColor: seat }, catalog),
			`claimSeat ${seat}`
		);
		expectOk(
			applyGameCommand(state, { memberId, displayName: seat, role: 'player', seatColor: seat }, { type: 'selectGuardian', guardianName: guardianNames[i] }, catalog),
			`selectGuardian ${seat}`
		);
	});
	expectOk(applyGameCommand(state, host, { type: 'startGame', seed: opts.seed }, catalog), 'startGame');

	const botRng = seededBotRandom(createRng(opts.seed));
	const pickRng = createRng(opts.seed ^ 0x9e3779b9);
	const rand = (): number => nextInt(pickRng, 1_000_000) / 1_000_000;

	const samples: Sample[] = [];
	const actionCounter = new Map<string, number>();
	let ticks = 0;
	let stalled = false;

	const applyHeuristic = (seat: SeatColor): boolean => {
		let progressed = false;
		const plan = planBotPhaseActions(state, seat, catalog, botRng, profileBySeat[seat]);
		for (const cmd of plan) {
			// Record covered heuristic decisions (BC label) BEFORE applying — but only for
			// strategic command types, since recording dry-runs many candidates (expensive).
			if (recordSet.has(seat) && !neuralSet.has(seat) && RECORDABLE_TYPES.has(cmd.type)) {
				const cands = legalActions(state, seat, catalog);
				if (cands.length > 1) {
					const mi = cands.findIndex((c) => commandMatches(c, cmd));
					if (mi >= 0) {
						const obs = encodeObs(state, seat);
						samples.push({
							obs,
							cands: cands.map((c) => encodeAction(state, seat, c)),
							chosen: mi,
							ret: 0,
							seat,
							vp: vpOf(state.players[seat]),
							phi: buildPotential(state.players[seat], shaping)
						});
					}
				}
			}
			// Commit the chosen heuristic command in place — the prior `state` is discarded each
			// step (reassigned just below), exactly like sim/selfPlay, so the defensive deep clone
			// is pure overhead here. Parity-tested fast path (sim/_parity.test.ts); the recording
			// dry-runs above (legalActions) still clone, which is what preserves the candidate states.
			const res = applyGameCommand(state, botActorFor(state, seat), cmd, catalog, { mutate: true });
			if (!res.ok) break;
			state = res.state;
			progressed = true;
			if (state.status !== 'active') break;
		}
		return progressed;
	};

	const stepNeural = (seat: SeatColor): boolean => {
		const key = `${seat}:${state.round}:${state.phase}`;
		const used = actionCounter.get(key) ?? 0;
		if (used >= MAX_ACTIONS_PER_PHASE) return applyHeuristic(seat); // unstick → forces a yield
		const withNext = legalActionsWithNext(state, seat, catalog);
		if (withNext.length === 0) return applyHeuristic(seat); // uncovered phase → heuristic
		const cands = withNext.map((x) => x.cmd);
		const obs = encodeObs(state, seat);
		const feats = cands.map((c) => encodeAction(state, seat, c));
		// League opponents play their own checkpoint greedily (no exploration, no recording);
		// the learner seat uses the configured selection + exploration and is recorded.
		const oppPolicy = opts.opponentPolicies?.[seat];
		const seatPolicy = oppPolicy ?? opts.policy!;
		const sample = oppPolicy ? false : opts.sample;
		const idx =
			cands.length === 1
				? 0
				: opts.chooser && !oppPolicy
					? opts.chooser(obs, feats, cands, seat, state)
					: opts.selection === 'policy'
						? seatPolicy.pick(obs, feats, { sample, temperature: opts.temperature, rand })
						: opts.selection === 'value'
							? valueGuidedIndex(seatPolicy, state, seat, withNext, { sample, temperature: opts.temperature, rand })
							: hybridIndex(seatPolicy, state, seat, withNext, { sample, temperature: opts.temperature, rand });
		if (cands.length > 1 && recordSet.has(seat) && !oppPolicy) {
			samples.push({
				obs,
				cands: feats,
				chosen: idx,
				ret: 0,
				seat,
				vp: vpOf(state.players[seat]),
				phi: buildPotential(state.players[seat], shaping)
			});
		}
		state = withNext[idx].next;
		actionCounter.set(key, used + 1);
		return true;
	};

	while (state.status === 'active' && state.round <= maxRounds) {
		ticks += 1;
		if (ticks > MAX_TICKS) {
			stalled = true;
			break;
		}
		let progressed = false;
		for (const seat of state.activeSeats) {
			if (!botSeatNeedsToAct(state, seat)) continue;
			const did = neuralSet.has(seat) ? stepNeural(seat) : applyHeuristic(seat);
			progressed = progressed || did;
			if (state.status !== 'active') break;
		}
		if (state.status !== 'active') break;
		if (!progressed) {
			const before = `${state.phase}:${state.round}`;
			applyDeadlineAdvance(state, catalog);
			if (`${state.phase}:${state.round}` === before) {
				stalled = true;
				break;
			}
		}
	}

	const finalVP: Record<string, number> = {};
	for (const seat of seats) finalVP[seat] = state.players[seat]?.victoryPoints ?? 0;

	// VP-maximizing return-to-go: per seat, credit each decision with its discounted future VP
	// (plus potential-based build shaping). γ<1 trades total-VP vs VP/turn — a harness knob.
	for (const seat of seats) {
		const seatSamples = samples.filter((s) => s.seat === seat); // already in play order
		if (seatSamples.length === 0) continue;
		const finalBuild = buildPotential(state.players[seat], shaping);
		const g = vpReturnsToGo(
			seatSamples.map((s) => s.vp),
			seatSamples.map((s) => s.phi),
			finalVP[seat],
			finalBuild,
			gamma
		);
		seatSamples.forEach((s, i) => (s.ret = g[i]));
	}

	return {
		winnerSeat: state.winnerSeat ?? null,
		finished: state.status === 'finished',
		rounds: state.round,
		stalled,
		finalVP,
		samples
	};
}
