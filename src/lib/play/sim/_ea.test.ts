/**
 * EVOLUTIONARY TUNER — (μ+λ) evolution strategy over the economy bot's numeric knobs, scored by
 * solo self-play (how fast it beats the game). Fitness = mean over a fixed seed set of
 * (won ? winning-round : PENALTY), minimized — so it jointly rewards a high win rate AND few rounds.
 * Escapes hand-tuning local optima and answers "how fast CAN this heuristic beat the game".
 *
 *   RUN_SIM=1 EA_GENS=8 EA_SEEDS=24 EA_BASE=cullean \
 *     npx vitest run src/lib/play/sim/_ea.test.ts --disable-console-intercept
 */
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES, type BotProfile } from '../server/botPolicy';
import { playOneGame } from './selfPlay';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

// Deterministic RNG for reproducible EA runs (test file — no workflow Math.random ban).
function mkRng(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (s + 0x9e3779b9) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Gene {
	killThreshold: number;
	builtOutThreshold: number;
	potentialTarget: number;
	cultivatorTarget: number;
	elementalistTarget: number;
	climbReadyFactor: number;
	bossDamageFactor: number;
	pursueArcane: number; // 0/1 gate
}
const BOUNDS: Record<keyof Gene, [number, number, boolean]> = {
	// [min, max, isInteger]
	killThreshold: [0.4, 0.9, false],
	builtOutThreshold: [0.15, 0.6, false],
	potentialTarget: [5, 10, true],
	cultivatorTarget: [2, 4, true],
	elementalistTarget: [2, 5, true],
	climbReadyFactor: [0.45, 1.05, false],
	bossDamageFactor: [0.6, 1.25, false],
	pursueArcane: [0, 1, true]
};
const KEYS = Object.keys(BOUNDS) as (keyof Gene)[];

function clampGene(g: Gene): Gene {
	const out = { ...g };
	for (const k of KEYS) {
		const [lo, hi, isInt] = BOUNDS[k];
		let v = Math.max(lo, Math.min(hi, out[k]));
		if (isInt) v = Math.round(v);
		out[k] = v;
	}
	return out;
}
function toProfile(base: BotProfile, g: Gene): BotProfile {
	return {
		...base,
		killThreshold: g.killThreshold,
		builtOutThreshold: g.builtOutThreshold,
		potentialTarget: g.potentialTarget,
		cultivatorTarget: g.cultivatorTarget,
		elementalistTarget: g.elementalistTarget,
		climbReadyFactor: g.climbReadyFactor,
		bossDamageFactor: g.bossDamageFactor,
		pursueArcane: g.pursueArcane >= 0.5,
		ismctsIterations: 0,
		searchRollouts: 0
	};
}
function geneFromProfile(base: BotProfile): Gene {
	return clampGene({
		killThreshold: base.killThreshold,
		builtOutThreshold: base.builtOutThreshold,
		potentialTarget: base.potentialTarget,
		cultivatorTarget: base.cultivatorTarget ?? 3,
		elementalistTarget: base.elementalistTarget ?? 3,
		climbReadyFactor: base.climbReadyFactor ?? 0.9,
		bossDamageFactor: base.bossDamageFactor ?? 0.95,
		pursueArcane: base.pursueArcane ? 1 : 0
	});
}
function mutate(g: Gene, rng: () => number, scale: number): Gene {
	const out = { ...g };
	for (const k of KEYS) {
		const [lo, hi] = BOUNDS[k];
		// gaussian-ish noise scaled to each param's range
		const noise = (rng() + rng() + rng() - 1.5) * (hi - lo) * scale;
		out[k] = g[k] + noise;
	}
	return clampGene(out);
}

describe.skipIf(!RUN_SIM)('evolutionary tuner', () => {
	test('tune economy knobs for fastest solo win', async () => {
		const catalog = await loadPlayCatalog();
		const base = BOT_PROFILES[process.env.EA_BASE ?? 'cullean'];
		const SEEDS = num(process.env.EA_SEEDS, 24);
		const GENS = num(process.env.EA_GENS, 8);
		const MU = num(process.env.EA_MU, 4);
		const LAMBDA = num(process.env.EA_LAMBDA, 8);
		const PENALTY = num(process.env.EA_PENALTY, 90); // a non-win counts as this many "rounds"
		const seats = num(process.env.EA_SEATS, 1);
		const maxRounds = num(process.env.EA_MAXROUNDS, 90);
		const rng = mkRng(num(process.env.EA_SEED, 12345));

		const evaluate = (g: Gene): { score: number; win: number; avgWin: number } => {
			const profile = toProfile(base, g);
			let won = 0;
			let sum = 0;
			const wr: number[] = [];
			for (let i = 0; i < SEEDS; i++) {
				const r = playOneGame(catalog, { seed: 1000 + i, profiles: Array(seats).fill(profile), maxRounds });
				const maxVp = Math.max(...Object.values(r.finalVP));
				if (maxVp >= 30) {
					won += 1;
					wr.push(r.rounds);
					sum += r.rounds;
				} else sum += PENALTY;
			}
			return { score: sum / SEEDS, win: won / SEEDS, avgWin: wr.length ? wr.reduce((a, b) => a + b, 0) / wr.length : NaN };
		};

		// Seed the population: the base + mutations.
		let pop: { g: Gene; score: number; win: number; avgWin: number }[] = [];
		const seed0 = geneFromProfile(base);
		pop.push({ g: seed0, ...evaluate(seed0) });
		for (let i = 0; i < MU + LAMBDA - 1; i++) {
			const g = mutate(seed0, rng, 0.25);
			pop.push({ g, ...evaluate(g) });
		}
		pop.sort((a, b) => a.score - b.score);

		const log: string[] = [];
		for (let gen = 0; gen < GENS; gen++) {
			const elites = pop.slice(0, MU);
			const scale = 0.2 * (1 - gen / GENS) + 0.05; // anneal mutation
			const children: typeof pop = [];
			for (let i = 0; i < LAMBDA; i++) {
				const parent = elites[i % elites.length].g;
				const g = mutate(parent, rng, scale);
				children.push({ g, ...evaluate(g) });
			}
			pop = [...elites, ...children].sort((a, b) => a.score - b.score);
			const best = pop[0];
			log.push(
				`gen ${gen}: best score=${best.score.toFixed(1)} win=${Math.round(100 * best.win)}% avgWin=${best.avgWin.toFixed(1)} | ${JSON.stringify(best.g)}`
			);
			console.log(log[log.length - 1]);
		}

		const best = pop[0];
		const result = {
			base: process.env.EA_BASE ?? 'cullean',
			seeds: SEEDS,
			seats,
			best: best.g,
			score: best.score,
			winRate: best.win,
			avgWinRound: best.avgWin,
			log
		};
		writeFileSync('/tmp/ea_result.json', JSON.stringify(result, null, 2));
		console.log('\n=== EA BEST ===\n' + JSON.stringify(result.best, null, 2));
		console.log(`score=${best.score.toFixed(1)} win=${Math.round(100 * best.win)}% avgWinRound=${best.avgWin.toFixed(1)}\n`);
		expect((catalog.monsters ?? []).length).toBeGreaterThan(0);
	}, 3_600_000);
});
