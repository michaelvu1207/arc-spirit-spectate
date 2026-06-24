/**
 * Engine throughput benchmark — how many full games/sec the pure simulator runs.
 * Measures sim/selfPlay.playOneGame (createLobbyState + applyGameCommand loop, NO recording,
 * NO net inference — the raw rules-engine speed). BENCH=1 to run.
 *
 *   BENCH=1 BENCH_GAMES=400 npx vitest run src/lib/play/sim/_bench.test.ts --disable-console-intercept
 */
import { describe, it } from 'vitest';
import os from 'node:os';
import { playOneGame } from './selfPlay';
import { profileFor } from '../server/botPolicy';
import { loadOrSnapshotCatalog } from '../ml/nodeIo';

const RUN = process.env.BENCH === '1';

describe('engine benchmark', () => {
	(RUN ? it : it.skip)(
		'self-play throughput',
		async () => {
			const seats = parseInt(process.env.BENCH_SEATS ?? '4', 10);
			const games = parseInt(process.env.BENCH_GAMES ?? '300', 10);
			const maxRounds = parseInt(process.env.BENCH_MAXROUNDS ?? '200', 10);
			const profilesList = (process.env.BENCH_PROFILES ?? 'random,medium').split(',');
			const catalog = await loadOrSnapshotCatalog();
			// eslint-disable-next-line no-console
			console.log(`[bench] host: ${os.cpus().length} logical cores, ${seats}-player games, maxRounds=${maxRounds}`);

			for (const prof of profilesList) {
				const profiles = Array.from({ length: seats }, () => profileFor(prof));
				playOneGame(catalog, { seed: 1, profiles, maxRounds }); // warmup / JIT

				const t0 = performance.now();
				let rounds = 0;
				let ticks = 0;
				let finished = 0;
				for (let g = 0; g < games; g++) {
					const r = playOneGame(catalog, { seed: 1000 + g, profiles, maxRounds });
					rounds += r.rounds;
					ticks += r.ticks;
					if (r.finished) finished += 1;
				}
				const dt = (performance.now() - t0) / 1000;
				// eslint-disable-next-line no-console
				console.log(
					`[bench] ${prof.padEnd(8)} → ${(games / dt).toFixed(1)} games/s · ${(rounds / dt).toFixed(0)} rounds/s · ` +
						`${(ticks / dt).toFixed(0)} cmd-batches/s · ${((1000 * dt) / games).toFixed(2)} ms/game · ` +
						`avgRounds=${(rounds / games).toFixed(1)} · finished=${((100 * finished) / games).toFixed(0)}% · (${dt.toFixed(2)}s total)`
				);
			}
		},
		600000
	);
});
