/**
 * VP-over-rounds curve data for the /bot-stats/curves graph. For each player count and each
 * strategy, plays many mixed (rotating-lineup) self-play games, captures each seat's VP at the
 * end of every round, and AVERAGES the trajectory across all games the strategy played. A game
 * that ends early carries its final VP forward (so the curve shows "this strategy reaches ~N VP
 * by round R on average", plateauing after a win). Output: the average VP-by-round curve per
 * strategy per player count.
 *
 * SHARD-FRIENDLY: honors SEED_BASE; emits raw {vpSum[], n[]} per round so shards sum exactly.
 * See runCurvesParallel (the generic driver) + aggregateCurves.py. Writes a shard JSON.
 *
 *   RUN_SIM=1 CURVE_GAMES=60 npx vitest run src/lib/play/sim/vpCurvesData.test.ts
 */
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { playOneGame } from './selfPlay';
import { SEAT_COLORS } from '../types';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v != null && v !== '' ? Number(v) : d);
const list = (v: string | undefined, d: string[]) =>
	v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d;

describe.skipIf(!RUN_SIM)('vp curves data', () => {
	test('average VP-by-round per strategy per player count', async () => {
		const catalog = await loadPlayCatalog();
		const seedBase = num(process.env.SEED_BASE, 1);
		const games = num(process.env.CURVE_GAMES, 60); // per player count, per shard
		const maxRound = num(process.env.CURVE_MAXROUND, 80);
		const maxRoundsCap = num(process.env.CURVE_MAXROUNDS, 300);
		const seatCounts = list(process.env.CURVE_SEATS, ['2', '3', '4', '6']).map(Number);
		const out = process.env.CURVE_OUT ?? '/tmp/curves_shard';
		const entrants = list(process.env.CURVE_ENTRANTS, [
			'pvphunter', 'cursed', 'corruption', 'sim6', 'hard', 'rushpatient',
			'culrush', 'cullean', 'cultivator', 'flexorigin', 'survivor', 'aggressive', 'fighter'
		]);
		const E = entrants.length;

		// curves[`${k}p`][strat] = { vpSum: number[maxRound], n: number[maxRound] }
		const curves: Record<string, Record<string, { vpSum: number[]; n: number[] }>> = {};

		for (const k of seatCounts) {
			const seats = Math.min(k, SEAT_COLORS.length, catalog.guardians.length);
			const byStrat: Record<string, { vpSum: number[]; n: number[] }> = {};
			for (const e of entrants) byStrat[e] = { vpSum: Array(maxRound).fill(0), n: Array(maxRound).fill(0) };

			for (let g = 0; g < games; g++) {
				const lineup: string[] = [];
				for (let i = 0; i < seats; i++) lineup.push(entrants[(g * seats + i) % E]);
				const r = playOneGame(catalog, {
					seed: seedBase + k * 100_000 + g,
					profiles: lineup.map((n) => BOT_PROFILES[n]),
					maxRounds: maxRoundsCap,
					captureTrajectory: true
				});
				lineup.forEach((name, i) => {
					const traj = r.trajectory?.[SEAT_COLORS[i]] ?? [];
					if (traj.length === 0) return;
					const last = traj[traj.length - 1];
					const agg = byStrat[name];
					for (let rd = 0; rd < maxRound; rd++) {
						agg.vpSum[rd] += rd < traj.length ? traj[rd] : last; // carry final VP forward
						agg.n[rd] += 1;
					}
				});
			}
			curves[`${k}p`] = byStrat;
		}

		writeFileSync(
			`${out}.json`,
			JSON.stringify({ seedBase, games, maxRound, seatCounts, entrants, curves }, null, 2)
		);
		expect(entrants.length).toBeGreaterThan(0);
	}, 3_600_000);
});
