/**
 * Arena — measure bot strength by MULTIPLAYER self-play. Two modes:
 *   • ELO round-robin: rotate entrants across seats over many games, derive ELO from
 *     who reaches 30 VP first (free-for-all → pairwise winner-beats-loser updates).
 *   • vs-baseline: one entrant vs N copies of a baseline → absolute win rate.
 *
 * Pure given (catalog, entrants, seeds). The winner of a game is the seat that actually
 * reached the 30-VP target (NOT the `allPlayersFallen` consolation), so ratings reflect
 * real wins. Used by arena.test.ts (env-driven, so a Workflow can fan out sweeps).
 */

import { playOneGame } from './selfPlay';
import { SEAT_COLORS, type PlayCatalog } from '../types';
import type { BotProfile } from '../server/botPolicy';

export interface Entrant {
	name: string;
	profile: BotProfile;
}

export interface EloResult {
	ratings: Record<string, number>;
	games: Record<string, number>;
	wins: Record<string, number>;
	winRate: Record<string, number>;
	avgWinRound: Record<string, number>;
	decisiveGames: number;
	noWinnerGames: number;
}

/** The seat that truly won (reached 30 VP), or null if the game timed out short of it. */
function realWinnerSeat(finalVP: Record<string, number>): string | null {
	let best: string | null = null;
	let bestVp = 29; // must be ≥ 30 to count
	for (const [seat, vp] of Object.entries(finalVP)) {
		if (vp >= 30 && vp > bestVp) {
			bestVp = vp;
			best = seat;
		}
	}
	return best;
}

/** Standard pairwise ELO expectation. */
function expected(a: number, b: number): number {
	return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * ELO round-robin. Each game seats `seats` entrants chosen by rotating offsets so every
 * entrant faces a varied field; the winner gets a pairwise ELO win over each opponent in
 * that game. Returns ratings + win rates + average rounds-to-win per entrant.
 */
export function runEloTournament(
	catalog: PlayCatalog,
	entrants: Entrant[],
	opts: { games: number; seats?: number; seed0?: number; maxRounds?: number; k?: number }
): EloResult {
	const seats = Math.min(opts.seats ?? 4, SEAT_COLORS.length, catalog.guardians.length);
	const seed0 = opts.seed0 ?? 1;
	const maxRounds = opts.maxRounds ?? 200;
	const k = opts.k ?? 24;
	const E = entrants.length;

	const ratings: Record<string, number> = {};
	const games: Record<string, number> = {};
	const wins: Record<string, number> = {};
	const winRounds: Record<string, number[]> = {};
	for (const e of entrants) {
		ratings[e.name] = 1500;
		games[e.name] = 0;
		wins[e.name] = 0;
		winRounds[e.name] = [];
	}

	let decisive = 0;
	let noWinner = 0;

	for (let g = 0; g < opts.games; g++) {
		// Rotating assignment: seat i gets entrant (g*seats + i) mod E, so pairings vary and
		// no entrant is pinned to one seat across games.
		const lineup: Entrant[] = [];
		for (let i = 0; i < seats; i++) lineup.push(entrants[(g * seats + i) % E]);
		for (const e of lineup) games[e.name] += 1;

		const r = playOneGame(catalog, {
			seed: seed0 + g,
			profiles: lineup.map((e) => e.profile),
			maxRounds
		});
		const winnerSeatKey = realWinnerSeat(r.finalVP);
		if (!winnerSeatKey) {
			noWinner += 1;
			continue;
		}
		decisive += 1;
		const winnerIdx = SEAT_COLORS.indexOf(winnerSeatKey as (typeof SEAT_COLORS)[number]);
		const winner = lineup[winnerIdx];
		wins[winner.name] += 1;
		winRounds[winner.name].push(r.rounds);

		// Pairwise ELO: winner beats each other seat in this game.
		for (let i = 0; i < lineup.length; i++) {
			if (i === winnerIdx) continue;
			const loser = lineup[i];
			const ew = expected(ratings[winner.name], ratings[loser.name]);
			ratings[winner.name] += k * (1 - ew);
			ratings[loser.name] += k * (0 - (1 - ew));
		}
	}

	const winRate: Record<string, number> = {};
	const avgWinRound: Record<string, number> = {};
	for (const e of entrants) {
		winRate[e.name] = games[e.name] ? wins[e.name] / games[e.name] : 0;
		const wr = winRounds[e.name];
		avgWinRound[e.name] = wr.length ? wr.reduce((a, b) => a + b, 0) / wr.length : NaN;
	}

	return { ratings, games, wins, winRate, avgWinRound, decisiveGames: decisive, noWinnerGames: noWinner };
}

export interface VsBaselineResult {
	entrant: string;
	baseline: string;
	games: number;
	wins: number;
	winRate: number;
	avgWinRound: number;
	noWinnerGames: number;
}

/**
 * One entrant in seat 0 vs `seats-1` copies of `baseline`. Absolute win rate + speed —
 * the "expected win rate vs the field" measure. Rotates the entrant's seat across games
 * to remove seat bias.
 */
export function runVsBaseline(
	catalog: PlayCatalog,
	entrant: Entrant,
	baseline: Entrant,
	opts: { games: number; seats?: number; seed0?: number; maxRounds?: number }
): VsBaselineResult {
	const seats = Math.min(opts.seats ?? 4, SEAT_COLORS.length, catalog.guardians.length);
	const seed0 = opts.seed0 ?? 1;
	const maxRounds = opts.maxRounds ?? 200;
	let wins = 0;
	let noWinner = 0;
	const winRounds: number[] = [];

	for (let g = 0; g < opts.games; g++) {
		const heroSeat = g % seats; // rotate the entrant's seat
		const lineup: Entrant[] = [];
		for (let i = 0; i < seats; i++) lineup.push(i === heroSeat ? entrant : baseline);
		const r = playOneGame(catalog, {
			seed: seed0 + g,
			profiles: lineup.map((e) => e.profile),
			maxRounds
		});
		const winnerSeatKey = realWinnerSeat(r.finalVP);
		if (!winnerSeatKey) {
			noWinner += 1;
			continue;
		}
		const winnerIdx = SEAT_COLORS.indexOf(winnerSeatKey as (typeof SEAT_COLORS)[number]);
		if (winnerIdx === heroSeat) {
			wins += 1;
			winRounds.push(r.rounds);
		}
	}

	return {
		entrant: entrant.name,
		baseline: baseline.name,
		games: opts.games,
		wins,
		winRate: wins / opts.games,
		avgWinRound: winRounds.length ? winRounds.reduce((a, b) => a + b, 0) / winRounds.length : NaN,
		noWinnerGames: noWinner
	};
}
