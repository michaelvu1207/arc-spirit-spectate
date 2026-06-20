/**
 * PvP-wiring probe — proves the Evil-hunter line actually executes in self-play:
 * the hunter descends to Fallen, co-locates with Good economy bots, and launches
 * the +3-VP group attack. Emits raw telemetry so we can see how OFTEN PvP fires and
 * how the hunter places, before trusting the big battery.
 *
 *   RUN_SIM=1 PROBE_GAMES=60 npx vitest run src/lib/play/sim/pvpProbe.test.ts
 */
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { playOneGame } from './selfPlay';
import { SEAT_COLORS } from '../types';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v != null && v !== '' ? Number(v) : d);

describe.skipIf(!RUN_SIM)('pvp probe', () => {
	test('hunter descends, co-locates, and lands group attacks', async () => {
		const catalog = await loadPlayCatalog();
		const games = num(process.env.PROBE_GAMES, 60);
		const maxRounds = num(process.env.PROBE_MAXROUNDS, 150);
		// Seat 0 = the hunter; the rest are Good economy bots it can prey on.
		const lineup = ['pvphunter', 'hard', 'rushpatient', 'cullean'];
		const profiles = lineup.map((n) => BOT_PROFILES[n]);

		let gamesWithPvp = 0;
		let totalPvp = 0;
		let hunterAttacks = 0;
		let hunterReachedFallen = 0;
		let hunterWins = 0;
		let hunterVpSum = 0;
		let decisive = 0;
		const placeHist: number[] = [];

		for (let i = 0; i < games; i++) {
			const r = playOneGame(catalog, { seed: 1 + i, profiles, maxRounds });
			const hunterSeat = SEAT_COLORS[0]; // seat 0 holds pvphunter
			totalPvp += r.pvpCombats;
			if (r.pvpCombats > 0) gamesWithPvp += 1;
			hunterAttacks += r.pvpAttacksBySeat[hunterSeat] ?? 0;
			if ((r.finalStatus[hunterSeat] ?? 0) >= 3) hunterReachedFallen += 1;
			hunterVpSum += r.finalVP[hunterSeat] ?? 0;
			// placement of the hunter by final VP (1 = best)
			const ranked = SEAT_COLORS.slice(0, profiles.length)
				.map((s) => ({ s, vp: r.finalVP[s] ?? 0 }))
				.sort((a, b) => b.vp - a.vp);
			placeHist.push(ranked.findIndex((x) => x.s === hunterSeat) + 1);
			const winnerVp = ranked[0].vp;
			if (winnerVp >= 30) {
				decisive += 1;
				if (ranked[0].s === hunterSeat) hunterWins += 1;
			}
		}

		const avgPlace = placeHist.reduce((a, b) => a + b, 0) / placeHist.length;
		const lines = [
			`PVP PROBE — ${lineup.join(' vs ')}  (${games} games, ${profiles.length}p, maxRounds=${maxRounds})`,
			`  games with ≥1 PvP combat : ${gamesWithPvp}/${games} (${((100 * gamesWithPvp) / games).toFixed(0)}%)`,
			`  total PvP combats        : ${totalPvp}  (avg ${(totalPvp / games).toFixed(1)}/game)`,
			`  hunter attacks launched  : ${hunterAttacks}  (avg ${(hunterAttacks / games).toFixed(1)}/game)`,
			`  hunter reached Fallen    : ${hunterReachedFallen}/${games} (${((100 * hunterReachedFallen) / games).toFixed(0)}%)`,
			`  hunter avg final VP      : ${(hunterVpSum / games).toFixed(1)}`,
			`  hunter avg placement     : ${avgPlace.toFixed(2)} of ${profiles.length}`,
			`  hunter win rate          : ${hunterWins}/${games} (${((100 * hunterWins) / games).toFixed(0)}%)  [decisive games: ${decisive}]`
		];
		console.log('\n' + lines.join('\n') + '\n');
		writeFileSync('/tmp/pvp_probe.txt', lines.join('\n') + '\n');

		expect(games).toBeGreaterThan(0);
	}, 600_000);
});
