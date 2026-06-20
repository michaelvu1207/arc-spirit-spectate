/**
 * Pure, in-memory bot-vs-bot self-play. Drives a full game from lobby → finished
 * using `createLobbyState` + `applyGameCommand` + the bot policy — no Supabase, no
 * HTTP, no browser. Deterministic for a given (seed, catalog, profiles).
 *
 * This is the optimization/validation engine for the Medium Bot: run thousands of
 * games fast and measure win rate / rounds-to-30.
 */

import { applyDeadlineAdvance, applyGameCommand, createLobbyState } from '../runtime';
import { createRng, nextInt, type RngState } from '../rng';
import {
	botActorFor,
	botSeatNeedsToAct,
	planBotPhaseActions,
	type BotProfile,
	type BotRandom
} from '../server/botPolicy';
import {
	SEAT_COLORS,
	type GameActor,
	type PlayCatalog,
	type PublicGameState,
	type SeatColor
} from '../types';
import { awakenedClassCounts } from '../effects/apply';

export interface SelfPlayResult {
	winnerSeat: SeatColor | null;
	finished: boolean;
	rounds: number;
	ticks: number;
	stalled: boolean;
	/** Final VP per seat. */
	finalVP: Record<string, number>;
	/** Final attack-dice count per seat (strategy telemetry). */
	finalDice: Record<string, number>;
	/** Profile kind per seat (e.g. 'medium' / 'random'). */
	seatProfiles: Record<string, string>;
	/** Final corruption status level per seat (0 Pure … 3 Fallen). */
	finalStatus: Record<string, number>;
	/** Final build per seat: dice by tier, awakened class counts, potential — build diagnostics. */
	finalBuild: Record<string, { dice: Record<string, number>; classes: Record<string, number>; potential: number }>;
	/** Total PvP (group-encounter) combats that occurred in the game. */
	pvpCombats: number;
	/** How many PvP combats each seat fought in on the Evil (aggressor) side. */
	pvpAttacksBySeat: Record<string, number>;
	/** Total location reward-row interactions resolved across the game (all seats). */
	locRowActions: number;
	/** Distinct (seat, round) location visits where ≥1 reward row was resolved.
	 *  locRowActions / locVisits = average actions taken per location visit. */
	locVisits: number;
	/** Per-seat: total reward-row interactions resolved (action density telemetry). */
	locActionsBySeat: Record<string, number>;
	/** Per-seat: distinct location visits with ≥1 row resolved. */
	locVisitsBySeat: Record<string, number>;
	/** Per-seat VP at the end of each round: `trajectory[seat][r-1]` = VP after round r.
	 *  Only present when `captureTrajectory` was set. Length = final round reached. */
	trajectory?: Record<string, number[]>;
}

export interface SelfPlayOptions {
	seed: number;
	/** One profile per seat; seat count = profiles.length (2–6). */
	profiles: BotProfile[];
	/** Safety cap on rounds (a finished game exits earlier). */
	maxRounds?: number;
	/** Capture each seat's VP at the end of every round (for the VP-over-rounds curves). */
	captureTrajectory?: boolean;
}

/** Deterministic BotRandom backed by the seeded engine RNG. */
function seededBotRandom(rng: RngState): BotRandom {
	return {
		int: (maxExclusive: number) => nextInt(rng, maxExclusive),
		chance: () => nextInt(rng, 2) === 0
	};
}

function expectOk(
	result: ReturnType<typeof applyGameCommand>,
	label: string
): PublicGameState {
	if (!result.ok) throw new Error(`${label}: ${result.error.code} ${result.error.message}`);
	return result.state;
}

/** Play one full game and return its outcome. Pure given (seed, catalog, profiles). */
export function playOneGame(catalog: PlayCatalog, opts: SelfPlayOptions): SelfPlayResult {
	const profiles = opts.profiles;
	const maxRounds = opts.maxRounds ?? 300;
	const n = Math.min(profiles.length, SEAT_COLORS.length, catalog.guardians.length);
	const seats = SEAT_COLORS.slice(0, n) as SeatColor[];
	const guardianNames = catalog.guardians.slice(0, n).map((g) => g.name);

	let state = createLobbyState({ roomCode: 'SIM', guardianNames });
	const host: GameActor = { memberId: 'host', displayName: 'host', role: 'host', seatColor: null };
	const profileBySeat: Record<string, BotProfile> = {};

	seats.forEach((seat, i) => {
		profileBySeat[seat] = profiles[i];
		const memberId = `bot-${seat}`;
		state = expectOk(
			applyGameCommand(
				state,
				{ memberId, displayName: `🤖 ${seat}`, role: 'player', seatColor: null },
				{ type: 'claimSeat', seatColor: seat },
				catalog
			),
			`claimSeat ${seat}`
		);
		state = expectOk(
			applyGameCommand(
				state,
				{ memberId, displayName: `🤖 ${seat}`, role: 'player', seatColor: seat },
				{ type: 'selectGuardian', guardianName: guardianNames[i] },
				catalog
			),
			`selectGuardian ${seat}`
		);
	});

	state = expectOk(applyGameCommand(state, host, { type: 'startGame', seed: opts.seed }, catalog), 'startGame');

	const botRng = seededBotRandom(createRng(opts.seed));
	const MAX_TICKS = 50_000;
	let ticks = 0;
	let stalled = false;

	// PvP telemetry accumulates DURING the game — `state.combats` is cleared every round
	// (beginNavigation), so we count unique combat ids as they appear, not at game end.
	const pvpAttacksBySeat: Record<string, number> = Object.fromEntries(seats.map((s) => [s, 0]));
	const seenPvpIds = new Set<string>();
	let pvpCombats = 0;
	const recordPvp = (): void => {
		for (const combat of state.combats) {
			if (combat.kind !== 'pvp' || seenPvpIds.has(combat.id)) continue;
			seenPvpIds.add(combat.id);
			pvpCombats += 1;
			for (const side of combat.sides) {
				if (side.side === 'evil' && side.seat in pvpAttacksBySeat) pvpAttacksBySeat[side.seat] += 1;
			}
		}
	};

	// VP-over-rounds trajectory: last write per round wins ⇒ records each seat's end-of-round VP.
	const trajectory: Record<string, number[]> = Object.fromEntries(seats.map((s) => [s, []]));
	const recordTrajectory = (): void => {
		if (!opts.captureTrajectory) return;
		for (const seat of seats) trajectory[seat][state.round - 1] = state.players[seat]?.victoryPoints ?? 0;
	};

	// Action-density telemetry: count reward-row resolutions and the distinct (seat, round) visits
	// they land in → locRowActions / locVisits = average actions taken per location visit.
	let locRowActions = 0;
	const locVisitKeys = new Set<string>();
	const locActionsBySeat: Record<string, number> = Object.fromEntries(seats.map((s) => [s, 0]));
	const locVisitsBySeat: Record<string, number> = Object.fromEntries(seats.map((s) => [s, 0]));
	const seenVisitBySeat: Record<string, Set<string>> = Object.fromEntries(seats.map((s) => [s, new Set<string>()]));

	while (state.status === 'active' && state.round <= maxRounds) {
		ticks += 1;
		if (ticks > MAX_TICKS) {
			stalled = true;
			break;
		}
		let progressed = false;
		for (const seat of state.activeSeats) {
			if (!botSeatNeedsToAct(state, seat)) continue;
			const commands = planBotPhaseActions(state, seat, catalog, botRng, profileBySeat[seat]);
			for (const command of commands) {
				const result = applyGameCommand(state, botActorFor(state, seat), command, catalog);
				if (!result.ok) break; // legality-threaded; a reject just ends this seat's turn
				state = result.state;
				progressed = true;
				if (command.type === 'resolveLocationInteraction') {
					locRowActions += 1;
					locActionsBySeat[seat] += 1;
					const key = `${seat}:${state.round}`;
					locVisitKeys.add(key);
					if (!seenVisitBySeat[seat].has(key)) {
						seenVisitBySeat[seat].add(key);
						locVisitsBySeat[seat] += 1;
					}
				}
				if (state.status !== 'active') break;
			}
			if (state.status !== 'active') break;
		}
		recordPvp(); // capture this round's group encounters before the next round clears them
		recordTrajectory();

		if (!progressed && state.status === 'active') {
			// Every active seat is ready but the phase machine hasn't advanced (e.g. all
			// navigation locked). The server advances here via the deadline-enforcement
			// poll; in-memory we drive the same forced advance ourselves. If even that
			// changes nothing, the game is genuinely stuck.
			const before = `${state.phase}:${state.round}`;
			applyDeadlineAdvance(state, catalog);
			if (`${state.phase}:${state.round}` === before && state.status === 'active') {
				stalled = true;
				break;
			}
		}
	}

	recordPvp(); // final sweep in case the last round ended on a group encounter
	recordTrajectory();
	const finalVP: Record<string, number> = {};
	const finalDice: Record<string, number> = {};
	const finalStatus: Record<string, number> = {};
	const finalBuild: Record<string, { dice: Record<string, number>; classes: Record<string, number>; potential: number }> = {};
	for (const seat of seats) {
		const p = state.players[seat];
		finalVP[seat] = p?.victoryPoints ?? 0;
		finalDice[seat] = p?.attackDice.length ?? 0;
		finalStatus[seat] = p?.statusLevel ?? 0;
		const dice: Record<string, number> = {};
		for (const d of p?.attackDice ?? []) dice[d.tier] = (dice[d.tier] ?? 0) + 1;
		finalBuild[seat] = { dice, classes: p ? awakenedClassCounts(p) : {}, potential: p?.maxTokens ?? 0 };
	}

	return {
		winnerSeat: state.winnerSeat ?? null,
		finished: state.status === 'finished',
		rounds: state.round,
		ticks,
		stalled,
		finalVP,
		finalDice,
		seatProfiles: Object.fromEntries(seats.map((s) => [s, profileBySeat[s].kind])),
		finalStatus,
		finalBuild,
		pvpCombats,
		pvpAttacksBySeat,
		locRowActions,
		locVisits: locVisitKeys.size,
		locActionsBySeat,
		locVisitsBySeat,
		trajectory: opts.captureTrajectory ? trajectory : undefined
	};
}
