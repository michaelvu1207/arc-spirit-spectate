/**
 * Meta self-play battery — measures how the new mechanics (count-based potential, intrinsic
 * Cultivate rune yield, simultaneous-attack, the corruption build) reshape bot performance.
 *   1. SOLO reach-30: per profile, fraction of seeded solo games that reach 30 VP + win-rounds.
 *   2. ELO round-robin among the economy/strategy variants (no-search → fast).
 *
 * SHARD-FRIENDLY: honors SEED_BASE so N processes can each run a disjoint seed slice in
 * parallel (the engine is single-threaded, so multi-core = multiple processes). Emits RAW
 * counts (wins/games/winRoundSum) so shard JSONs aggregate exactly. See runMetaParallel.sh +
 * aggregateMeta.py. Writes META_OUT.json (+ a human table for a single unsharded run).
 *
 *   RUN_SIM=1 SOLO_SEEDS=80 ELO_GAMES=280 npx vitest run src/lib/play/sim/metaReport.test.ts
 */
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { runEloTournament, type Entrant } from './arena';
import { playOneGame } from './selfPlay';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v != null && v !== '' ? Number(v) : d);

describe.skipIf(!RUN_SIM)('meta report', () => {
	test('measure new-mechanic bot performance', async () => {
		const catalog = await loadPlayCatalog();
		const soloSeeds = num(process.env.SOLO_SEEDS, 40);
		const eloGames = num(process.env.ELO_GAMES, 120);
		const seats = num(process.env.ELO_SEATS, 4);
		const maxRounds = num(process.env.META_MAXROUNDS, 150);
		const seedBase = num(process.env.SEED_BASE, 1);
		const out = process.env.META_OUT ?? '/tmp/meta_report';

		// ── 1. SOLO reach-30 (raw counts for exact shard aggregation) ────────────────
		const parseList = (v: string | undefined) =>
			v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
		const soloNames = parseList(process.env.META_SOLO) ?? ['medium', 'hard', 'culrush', 'rushpatient', 'cullean', 'flexorigin', 'cultivator', 'corruption', 'fighter'];
		const solo: Record<string, { wins: number; games: number; winRoundSum: number; vpSum: number; stalls: number }> = {};
		for (const name of soloNames) {
			const profile = BOT_PROFILES[name];
			let wins = 0;
			let stalls = 0;
			let winRoundSum = 0;
			let vpSum = 0;
			for (let i = 0; i < soloSeeds; i += 1) {
				const r = playOneGame(catalog, { seed: seedBase + i, profiles: [profile], maxRounds });
				const vp = r.finalVP['Red'] ?? 0;
				vpSum += vp;
				if (vp >= 30) {
					wins += 1;
					winRoundSum += r.rounds;
				}
				if (r.stalled) stalls += 1;
			}
			solo[name] = { wins, games: soloSeeds, winRoundSum, vpSum, stalls };
		}

		// ── 2. ELO round-robin (4p) — raw wins/games per entrant aggregate cleanly ────
		const eloNames = parseList(process.env.META_ELO) ?? ['cultivator', 'rushpatient', 'hard', 'culrush', 'cullean', 'flexorigin', 'medium', 'corruption'];
		const entrants: Entrant[] = eloNames.map((name) => ({ name, profile: BOT_PROFILES[name] }));
		const elo = runEloTournament(catalog, entrants, { games: eloGames, seats, seed0: seedBase, maxRounds });

		writeFileSync(
			`${out}.json`,
			JSON.stringify({ seedBase, soloSeeds, eloGames, seats, maxRounds, soloNames, eloNames, solo, elo }, null, 2)
		);

		// Human table (rates) — meaningful for a single unsharded run; shards are aggregated separately.
		const lines: string[] = [];
		lines.push(`META REPORT (seedBase=${seedBase}, solo=${soloSeeds}/profile, elo=${eloGames} games ${seats}p)`);
		lines.push('SOLO reach-30:   profile      win%   avgWinRd  avgVP  stalls');
		for (const name of soloNames) {
			const s = solo[name];
			const wr = s.games ? s.wins / s.games : 0;
			const avgRd = s.wins ? s.winRoundSum / s.wins : NaN;
			lines.push(
				`  ${name.padEnd(11)} ${(100 * wr).toFixed(0).padStart(4)}%  ${(Number.isNaN(avgRd) ? '—' : avgRd.toFixed(1)).padStart(8)}  ${(s.vpSum / s.games).toFixed(1).padStart(5)}  ${String(s.stalls).padStart(6)}`
			);
		}
		lines.push(`ELO (decisive=${elo.decisiveGames}, noWinner=${elo.noWinnerGames}):  profile      win%   avgWinRd`);
		for (const name of [...eloNames].sort((a, b) => elo.winRate[b] - elo.winRate[a])) {
			lines.push(
				`  ${name.padEnd(11)} ${(100 * elo.winRate[name]).toFixed(0).padStart(4)}%  ${(Number.isNaN(elo.avgWinRound[name]) ? '—' : elo.avgWinRound[name].toFixed(1)).padStart(8)}`
			);
		}
		console.log('\n' + lines.join('\n') + '\n');
		writeFileSync(`${out}.txt`, lines.join('\n') + '\n');

		expect(entrants.length).toBeGreaterThan(0);
	}, 1_800_000);
});
