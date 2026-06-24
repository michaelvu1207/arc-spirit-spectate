/**
 * Engine/heuristic health probe — does base self-play (NO ML, the existing
 * sim/selfPlay.playOneGame) actually produce winners under the CURRENT rules?
 * Isolates "the heuristics/rules don't finish games" from "my ML driver stalls".
 *
 *   HEALTH=1 npx vitest run src/lib/play/ml/_health.test.ts
 */
import { describe, it } from 'vitest';
import { playOneGame } from '../sim/selfPlay';
import { profileFor } from '../server/botPolicy';
import { loadOrSnapshotCatalog } from './nodeIo';

const RUN = process.env.HEALTH === '1';

describe('engine health', () => {
	(RUN ? it : it.skip)(
		'base self-play finish rate',
		async () => {
			const games = parseInt(process.env.HEALTH_GAMES ?? '30', 10);
			const seats = parseInt(process.env.HEALTH_SEATS ?? '4', 10);
			const maxRounds = parseInt(process.env.HEALTH_MAXROUNDS ?? '120', 10);
			const field = (process.env.HEALTH_PROFILES ?? 'godly,mythic,insane,hard').split(',');
			const catalog = await loadOrSnapshotCatalog();

			let finished = 0;
			let stalled = 0;
			let sumRounds = 0;
			let sumMaxVp = 0;
			const t0 = Date.now();
			for (let g = 0; g < games; g++) {
				const profiles = Array.from({ length: seats }, (_, i) => profileFor(field[(g + i) % field.length]));
				const r = playOneGame(catalog, { seed: 1 + g, profiles, maxRounds });
				if (r.finished) finished += 1;
				if (r.stalled) stalled += 1;
				sumRounds += r.rounds;
				sumMaxVp += Math.max(...Object.values(r.finalVP));
			}
			const dt = ((Date.now() - t0) / 1000).toFixed(1);
			// eslint-disable-next-line no-console
			console.log(
				`[health] games=${games} finished=${((100 * finished) / games).toFixed(0)}% stalled=${((100 * stalled) / games).toFixed(0)}% ` +
					`avgRounds=${(sumRounds / games).toFixed(1)} avgMaxVP=${(sumMaxVp / games).toFixed(1)} (target ${30}) ms/game=${((Date.now() - t0) / games).toFixed(0)} total=${dt}s`
			);
		},
		30 * 60 * 1000
	);
});
