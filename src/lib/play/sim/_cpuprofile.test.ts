/**
 * CPU profiler — where does full-game simulation time actually go? Runs the production data-gen
 * driver path under V8's sampling profiler (node:inspector) and aggregates SELF-time by function,
 * so we can see the real bottleneck (engine handlers vs bot policy vs clone vs legalActions).
 * CPUPROF=1 to run.  CPUPROF_GAMES=8 CPUPROF_PATH=gen|selfplay
 */
import { describe, it } from 'vitest';
import inspector from 'node:inspector';
import { profileFor } from '../server/botPolicy';
import { SEAT_COLORS, type SeatColor } from '../types';
import { playRecordingGame } from '../ml/driver';
import { playOneGame } from './selfPlay';
import { loadOrSnapshotCatalog } from '../ml/nodeIo';

const RUN = process.env.CPUPROF === '1';

describe('cpu profile', () => {
	(RUN ? it : it.skip)(
		'self-time breakdown of full-game simulation',
		async () => {
			const catalog = await loadOrSnapshotCatalog();
			const games = parseInt(process.env.CPUPROF_GAMES ?? '8', 10);
			const which = process.env.CPUPROF_PATH ?? 'gen';
			const seats = SEAT_COLORS.slice(0, 4) as SeatColor[];
			const FIELD = ['pvphunter', 'aggressive', 'cultivator', 'survivor', 'fighter', 'hard'];

			const session = new inspector.Session();
			session.connect();
			const post = (method: string, params?: object): Promise<any> =>
				new Promise((res, rej) => session.post(method, params as never, (err, result) => (err ? rej(err) : res(result))));

			await post('Profiler.enable');
			await post('Profiler.setSamplingInterval', { interval: 120 }); // µs
			await post('Profiler.start');

			const t0 = performance.now();
			for (let g = 0; g < games; g++) {
				const profiles = seats.map((_, i) => profileFor(FIELD[(g + i) % FIELD.length]));
				if (which === 'selfplay') {
					playOneGame(catalog, { seed: 1000 + g, profiles, maxRounds: 90 });
				} else {
					const recordSeats = seats.filter((_, i) => FIELD[(g + i) % FIELD.length] === 'pvphunter');
					playRecordingGame(catalog, { seed: 1000 + g, profiles, maxRounds: 90, recordSeats });
				}
			}
			const dt = performance.now() - t0;
			const { profile } = await post('Profiler.stop');
			session.disconnect();

			// Aggregate SELF-time (hitCount) by function identity.
			const byFn = new Map<string, number>();
			const byFile = new Map<string, number>();
			let total = 0;
			for (const node of profile.nodes) {
				const hc = node.hitCount ?? 0;
				if (!hc) continue;
				total += hc;
				const cf = node.callFrame;
				const file = (cf.url || '').split('/').pop() || cf.url || '(native)';
				const name = `${cf.functionName || '(anonymous)'} — ${file}:${cf.lineNumber + 1}`;
				byFn.set(name, (byFn.get(name) ?? 0) + hc);
				byFile.set(file || '(native)', (byFile.get(file || '(native)') ?? 0) + hc);
			}
			const pct = (h: number) => `${((100 * h) / total).toFixed(1).padStart(5)}%`;

			// eslint-disable-next-line no-console
			console.log(`\n[cpuprof] path=${which} ${games} games in ${(dt / 1000).toFixed(1)}s · ${(games / (dt / 1000)).toFixed(2)} games/s · ${total} samples\n`);
			// eslint-disable-next-line no-console
			console.log('[cpuprof] ===== TOP 30 FUNCTIONS BY SELF-TIME =====');
			[...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([n, h]) => {
				// eslint-disable-next-line no-console
				console.log(`[cpuprof] ${pct(h)}  ${n}`);
			});
			// eslint-disable-next-line no-console
			console.log('\n[cpuprof] ===== SELF-TIME BY FILE =====');
			[...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([n, h]) => {
				// eslint-disable-next-line no-console
				console.log(`[cpuprof] ${pct(h)}  ${n}`);
			});
		},
		300000
	);
});
