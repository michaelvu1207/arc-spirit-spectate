/**
 * Compare bot strategy variants by self-play. Each profile in BOT_PROFILES is run
 * solo (can it reach 30 VP, how fast?) and the strategic ones play a round-robin
 * vs. random. This is the harness for "play with different strategies / variables".
 */

import { describe, expect, test } from 'vitest';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES, RANDOM_PROFILE } from '../server/botPolicy';
import { playOneGame } from './selfPlay';
import type { PlayCatalog } from '../types';

// These hit live Supabase (real catalog) and run thousands of games, so they are
// OPT-IN — they stay out of the default `npm test`. Run them with:
//   RUN_SIM=1 npx vitest run src/lib/play/sim/compare.test.ts --disable-console-intercept
const RUN_SIM = !!process.env.RUN_SIM;

function median(xs: number[]): number {
	if (!xs.length) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

describe.skipIf(!RUN_SIM)('strategy comparison (real catalog)', () => {
	test('solo finish-rate per variant', async () => {
		const catalog: PlayCatalog = await loadPlayCatalog();
		const SEEDS = 10;
		const rows: string[] = [];
		for (const [name, profile] of Object.entries(BOT_PROFILES)) {
			if (name === 'random') continue;
			const finishes: number[] = [];
			const finalVP: number[] = [];
			const finalDice: number[] = [];
			for (let seed = 1; seed <= SEEDS; seed += 1) {
				const r = playOneGame(catalog, { seed, profiles: [profile], maxRounds: 400 });
				if (r.finished) finishes.push(r.rounds);
				finalVP.push(r.finalVP['Red']);
				finalDice.push(r.finalDice['Red']);
			}
			rows.push(
				`${name.padEnd(12)} solo: finished=${finishes.length}/${SEEDS}  medianRounds=${median(finishes)}  medianVP=${median(finalVP)}  medianDice=${median(finalDice)}`
			);
		}
		console.log('\n' + rows.join('\n'));
		expect(rows.length).toBeGreaterThan(0);
	}, 300_000);

	test('each variant vs 3×random win-rate', async () => {
		const catalog: PlayCatalog = await loadPlayCatalog();
		const SEEDS = 12;
		const rows: string[] = [];
		for (const [name, profile] of Object.entries(BOT_PROFILES)) {
			if (name === 'random') continue;
			let wins = 0;
			for (let seed = 1; seed <= SEEDS; seed += 1) {
				const r = playOneGame(catalog, {
					seed,
					profiles: [profile, RANDOM_PROFILE, RANDOM_PROFILE, RANDOM_PROFILE],
					maxRounds: 400
				});
				if (r.winnerSeat === 'Red') wins += 1;
			}
			rows.push(`${name.padEnd(12)} vs 3×random: ${wins}/${SEEDS} (${Math.round((100 * wins) / SEEDS)}%)`);
		}
		console.log('\n' + rows.join('\n'));
		expect(rows.length).toBeGreaterThan(0);
	}, 360_000);
});
