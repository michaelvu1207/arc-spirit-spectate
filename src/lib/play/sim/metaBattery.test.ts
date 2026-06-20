/**
 * COMPREHENSIVE META BATTERY — every strategy faces every other, PvP enabled.
 *
 *   A. FREE-FOR-ALL by player count (2/3/4/6p): rotate the full entrant set through mixed
 *      tables so each strategy meets a varied field; report win%, avg final VP, Fallen%, and
 *      PvP attacks/game per strategy. This is the "which strategy wins the real game" table.
 *   B. MATCHUP MATRIX: each aggressor (pvphunter, cursed) vs a pure field of each economy
 *      baseline (hero in a rotating seat, rest = baseline copies) → head-to-head win rate.
 *      Answers "does the aggressive Evil line beat each individual strategy?".
 *
 * SHARD-FRIENDLY: honors SEED_BASE so N processes each run a disjoint seed slice (engine is
 * single-threaded ⇒ multi-core = multiple processes). Emits RAW counts so shard JSONs sum
 * exactly. See runBatteryParallel.sh + aggregateBattery.py. Writes BATTERY_OUT.json.
 *
 *   RUN_SIM=1 FFA_GAMES=400 MU_GAMES=120 npx vitest run src/lib/play/sim/metaBattery.test.ts
 */
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { playOneGame } from './selfPlay';
import { SEAT_COLORS, type PlayCatalog } from '../types';
import type { BotProfile } from '../server/botPolicy';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v != null && v !== '' ? Number(v) : d);
const list = (v: string | undefined, d: string[]) =>
	v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d;

/** Seat that actually reached 30 VP (the true winner), or null on a timeout. */
function realWinner(finalVP: Record<string, number>): string | null {
	let best: string | null = null;
	let bestVp = 29;
	for (const [seat, vp] of Object.entries(finalVP)) {
		if (vp >= 30 && vp > bestVp) {
			bestVp = vp;
			best = seat;
		}
	}
	return best;
}

interface ProfileAgg {
	games: number;
	wins: number;
	winRoundSum: number;
	vpSum: number;
	fallen: number; // games this profile ended Fallen
	pvpAttacks: number; // total group attacks launched
	pvpGames: number; // games where it launched ≥1 attack
}
const emptyAgg = (): ProfileAgg => ({
	games: 0,
	wins: 0,
	winRoundSum: 0,
	vpSum: 0,
	fallen: 0,
	pvpAttacks: 0,
	pvpGames: 0
});

describe.skipIf(!RUN_SIM)('meta battery', () => {
	test('every strategy vs every strategy, PvP on', async () => {
		const catalog: PlayCatalog = await loadPlayCatalog();
		const seedBase = num(process.env.SEED_BASE, 1);
		const ffaGames = num(process.env.FFA_GAMES, 400);
		const muGames = num(process.env.MU_GAMES, 120);
		const maxRounds = num(process.env.BATTERY_MAXROUNDS, 150);
		const seatCounts = list(process.env.FFA_SEATS, ['2', '3', '4', '6']).map(Number);
		const out = process.env.BATTERY_OUT ?? '/tmp/meta_battery';

		const entrants = list(process.env.FFA_ENTRANTS, [
			// aggressive / corruption / PvP
			'pvphunter', 'cursed', 'corruption', 'sim5', 'sim6',
			// economy safe-scaler family
			'hard', 'rushpatient', 'culrush', 'cullean', 'cultivator', 'flexorigin', 'survivor', 'aggressive', 'fighter'
		]);
		const baselines = list(process.env.MU_BASELINES, [
			'hard', 'rushpatient', 'culrush', 'cullean', 'cultivator', 'flexorigin', 'aggressive', 'fighter'
		]);
		const aggressors = list(process.env.MU_AGGRESSORS, ['pvphunter', 'cursed']);
		const prof = (n: string): BotProfile => BOT_PROFILES[n];

		// ── A. FREE-FOR-ALL by player count ───────────────────────────────────────────
		const ffa: Record<string, Record<string, ProfileAgg>> = {};
		for (const k of seatCounts) {
			const seats = Math.min(k, SEAT_COLORS.length, catalog.guardians.length);
			const byProfile: Record<string, ProfileAgg> = {};
			for (const e of entrants) byProfile[e] = emptyAgg();
			const E = entrants.length;
			for (let g = 0; g < ffaGames; g++) {
				const lineupNames: string[] = [];
				for (let i = 0; i < seats; i++) lineupNames.push(entrants[(g * seats + i) % E]);
				const r = playOneGame(catalog, {
					seed: seedBase + k * 100_000 + g,
					profiles: lineupNames.map(prof),
					maxRounds
				});
				const winnerSeat = realWinner(r.finalVP);
				const winnerName = winnerSeat
					? lineupNames[SEAT_COLORS.indexOf(winnerSeat as (typeof SEAT_COLORS)[number])]
					: null;
				lineupNames.forEach((name, i) => {
					const seat = SEAT_COLORS[i];
					const a = byProfile[name];
					a.games += 1;
					a.vpSum += r.finalVP[seat] ?? 0;
					if ((r.finalStatus[seat] ?? 0) >= 3) a.fallen += 1;
					const atks = r.pvpAttacksBySeat[seat] ?? 0;
					a.pvpAttacks += atks;
					if (atks > 0) a.pvpGames += 1;
				});
				// Credit the win to the FIRST seat holding the winning profile (a profile can be
				// seated more than once when E < seats·something; winnerSeat already pins the seat).
				if (winnerName && winnerSeat) {
					const a = byProfile[winnerName];
					a.wins += 1;
					a.winRoundSum += r.rounds;
				}
			}
			ffa[`${k}p`] = byProfile;
		}

		// ── B. MATCHUP MATRIX: aggressor vs a pure baseline field (4p) ─────────────────
		const matchup: Record<string, Record<string, ProfileAgg>> = {};
		const muSeats = Math.min(4, SEAT_COLORS.length, catalog.guardians.length);
		for (const hero of aggressors) {
			matchup[hero] = {};
			for (const base of baselines) {
				const a = emptyAgg();
				for (let g = 0; g < muGames; g++) {
					const heroSeat = g % muSeats;
					const names: string[] = [];
					for (let i = 0; i < muSeats; i++) names.push(i === heroSeat ? hero : base);
					const r = playOneGame(catalog, {
						seed: seedBase + 900_000 + g,
						profiles: names.map(prof),
						maxRounds
					});
					a.games += 1;
					const seat = SEAT_COLORS[heroSeat];
					a.vpSum += r.finalVP[seat] ?? 0;
					if ((r.finalStatus[seat] ?? 0) >= 3) a.fallen += 1;
					const atks = r.pvpAttacksBySeat[seat] ?? 0;
					a.pvpAttacks += atks;
					if (atks > 0) a.pvpGames += 1;
					const winnerSeat = realWinner(r.finalVP);
					if (winnerSeat === seat) {
						a.wins += 1;
						a.winRoundSum += r.rounds;
					}
				}
				matchup[hero][base] = a;
			}
		}

		writeFileSync(
			`${out}.json`,
			JSON.stringify(
				{ seedBase, ffaGames, muGames, maxRounds, seatCounts, entrants, baselines, aggressors, ffa, matchup },
				null,
				2
			)
		);
		expect(entrants.length).toBeGreaterThan(0);
	}, 3_600_000);
});
