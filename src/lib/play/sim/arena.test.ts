/**
 * Env-driven arena runner — lets a Workflow (or a shell) fan out tournaments/sweeps.
 * Loads the real catalog (Supabase), so it is OPT-IN via RUN_SIM and stays out of `npm test`.
 *
 *   RUN_SIM=1 ARENA_MODE=elo ARENA_ENTRANTS=medium,hard,extrahard,insane,godly \
 *     ARENA_GAMES=120 npx vitest run src/lib/play/sim/arena.test.ts --disable-console-intercept
 *
 *   RUN_SIM=1 ARENA_MODE=vsbaseline ARENA_ENTRANTS=hard ARENA_BASELINE=medium \
 *     ARENA_GAMES=80 npx vitest run src/lib/play/sim/arena.test.ts --disable-console-intercept
 *
 * Custom configs (for sweeps): ARENA_ENTRANTS may be a JSON array of {name, profile}.
 * Results print as a single line `ARENA_RESULT <json>` for easy parsing.
 */

import { describe, expect, test } from 'vitest';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES, type BotProfile } from '../server/botPolicy';
import { runEloTournament, runVsBaseline, type Entrant } from './arena';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v != null && v !== '' ? Number(v) : d);

/** Resolve ARENA_ENTRANTS: a JSON array of {name,profile}, or comma-separated profile names. */
function resolveEntrants(spec: string | undefined): Entrant[] {
	if (!spec) return Object.keys(BOT_PROFILES).filter((n) => n !== 'random').map((n) => ({ name: n, profile: BOT_PROFILES[n] }));
	const trimmed = spec.trim();
	if (trimmed.startsWith('[')) {
		const parsed = JSON.parse(trimmed) as { name: string; profile: BotProfile }[];
		return parsed.map((e) => ({ name: e.name, profile: e.profile }));
	}
	return trimmed
		.split(',')
		.map((n) => n.trim())
		.filter(Boolean)
		.map((n) => {
			const profile = BOT_PROFILES[n];
			if (!profile) throw new Error(`unknown profile: ${n}`);
			return { name: n, profile };
		});
}

describe.skipIf(!RUN_SIM)('arena', () => {
	test('run configured tournament', async () => {
		const catalog = await loadPlayCatalog();
		const mode = (process.env.ARENA_MODE ?? 'elo').toLowerCase();
		const entrants = resolveEntrants(process.env.ARENA_ENTRANTS);
		const games = num(process.env.ARENA_GAMES, 120);
		const seats = num(process.env.ARENA_SEATS, 4);
		const seed0 = num(process.env.ARENA_SEED0, 1);
		const maxRounds = num(process.env.ARENA_MAXROUNDS, 200);

		if (mode === 'vsbaseline') {
			const baselineName = process.env.ARENA_BASELINE ?? 'medium';
			const baseline: Entrant = { name: baselineName, profile: BOT_PROFILES[baselineName] };
			const out = entrants.map((e) => runVsBaseline(catalog, e, baseline, { games, seats, seed0, maxRounds }));
			console.log('ARENA_RESULT ' + JSON.stringify({ mode, baseline: baselineName, seats, games, results: out }));
			for (const r of out) {
				console.log(`${r.entrant.padEnd(12)} vs ${seats - 1}×${r.baseline}: win ${r.wins}/${r.games} (${Math.round(100 * r.winRate)}%)  avgWinRound=${r.avgWinRound.toFixed(1)}  noWinner=${r.noWinnerGames}`);
			}
		} else {
			const res = runEloTournament(catalog, entrants, { games, seats, seed0, maxRounds });
			console.log('ARENA_RESULT ' + JSON.stringify({ mode, seats, ...res }));
			const ranked = [...entrants].sort((a, b) => res.ratings[b.name] - res.ratings[a.name]);
			console.log(`\nELO (${games} games, ${seats}p, decisive=${res.decisiveGames}, noWinner=${res.noWinnerGames}):`);
			for (const e of ranked) {
				console.log(`${e.name.padEnd(12)} ELO ${Math.round(res.ratings[e.name])}  win ${res.wins[e.name]}/${res.games[e.name]} (${Math.round(100 * res.winRate[e.name])}%)  avgWinRound=${Number.isNaN(res.avgWinRound[e.name]) ? '—' : res.avgWinRound[e.name].toFixed(1)}`);
			}
		}
		expect(entrants.length).toBeGreaterThan(0);
	}, 600_000);
});
