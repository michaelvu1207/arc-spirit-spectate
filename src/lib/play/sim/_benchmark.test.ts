/**
 * BOT SPEED BENCHMARK — how fast can each bot beat the game (reach 30 VP)?
 * Solo by default (purest speed test); set BENCH_SEATS for mirror matches. Reports win%,
 * avg/median winning round, %<30, %<40, avg corruption status, per profile.
 *
 *   RUN_SIM=1 BENCH_PROFILES=cullean,mcts BENCH_SEEDS=24 \
 *     npx vitest run src/lib/play/sim/_benchmark.test.ts --disable-console-intercept
 */
import { describe, expect, test } from 'vitest';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { playOneGame } from './selfPlay';

const RUN_SIM = !!process.env.RUN_SIM;
const list = (v: string | undefined, d: string[]) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : d);
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

describe.skipIf(!RUN_SIM)('bot speed benchmark', () => {
	test('rounds-to-30 per profile', async () => {
		const catalog = await loadPlayCatalog();
		const profiles = list(process.env.BENCH_PROFILES, ['cullean', 'culrush', 'rushpatient', 'hard', 'paragon', 'mcts']);
		const seeds = num(process.env.BENCH_SEEDS, 24);
		const seats = num(process.env.BENCH_SEATS, 1);
		const maxRounds = num(process.env.BENCH_MAXROUNDS, 120);
		const seedBase = num(process.env.SEED_BASE, 1);

		const out: string[] = [
			`profile        seats=${seats} seeds=${seeds}`,
			'profile'.padEnd(16) + 'WIN%  avgR  medR  p10  p90  <30%  <40%  statusAvg'
		];
		for (const name of profiles) {
			const profile = BOT_PROFILES[name];
			if (!profile) {
				out.push(`${name.padEnd(16)} (unknown profile)`);
				continue;
			}
			let won = 0;
			let u30 = 0;
			let u40 = 0;
			let statusSum = 0;
			const winRounds: number[] = [];
			for (let i = 0; i < seeds; i++) {
				const r = playOneGame(catalog, { seed: seedBase + i, profiles: Array(seats).fill(profile), maxRounds });
				const maxVp = Math.max(...Object.values(r.finalVP));
				statusSum += r.finalStatus['Red'] ?? 0;
				if (maxVp >= 30) {
					won += 1;
					winRounds.push(r.rounds);
					if (r.rounds < 30) u30 += 1;
					if (r.rounds < 40) u40 += 1;
				}
			}
			winRounds.sort((a, b) => a - b);
			const q = (p: number) => (winRounds.length ? winRounds[Math.min(winRounds.length - 1, Math.floor(p * winRounds.length))] : NaN);
			const avg = winRounds.length ? (winRounds.reduce((a, b) => a + b, 0) / winRounds.length) : NaN;
			out.push(
				`${name.padEnd(16)}${String(Math.round((100 * won) / seeds)).padStart(4)}%${(avg).toFixed(0).padStart(6)}${String(q(0.5)).padStart(6)}${String(q(0.1)).padStart(5)}${String(q(0.9)).padStart(5)}${String(Math.round((100 * u30) / seeds)).padStart(5)}%${String(Math.round((100 * u40) / seeds)).padStart(5)}%${(statusSum / seeds).toFixed(1).padStart(8)}`
			);
		}
		console.log('\n' + out.join('\n') + '\n');
		expect((catalog.monsters ?? []).length).toBeGreaterThan(0);
	}, 3_600_000);
});
