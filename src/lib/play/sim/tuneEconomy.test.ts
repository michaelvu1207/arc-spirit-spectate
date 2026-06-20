/**
 * Economy-speed tuning sweep. The specialized-location model (one build action per round) made
 * the economy slow (~45–50 rounds to win); we want the TOP-TWO well-designed economy engines
 * (`hard`, `rushpatient`) to win at ~36 rounds while the aggressive PvP line stays at ~24.
 *
 * This overrides the monster ladder (the game-balance knobs) in the loaded catalog and measures:
 *   • ECON game length: an all-economy field (hard + rushpatient) — avg round SOMEONE reaches 30.
 *   • PvP win-round: pvphunter vs an economy field — its avg winning round + win rate.
 *
 * Knobs (env): HP_SCALE (×monster HP), CHOOSE_BONUS (+tokens claimed/kill), VP_BONUS (prepend N
 * 2-VP tokens to each rung AND let them be claimed). Pick the config that lands ECON≈36, PvP≈24.
 *
 *   RUN_SIM=1 HP_SCALE=0.85 VP_BONUS=1 TUNE_GAMES=80 npx vitest run src/lib/play/sim/tuneEconomy.test.ts
 */
import { describe, expect, test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { playOneGame } from './selfPlay';
import { SEAT_COLORS, type PlayCatalog } from '../types';

const RUN_SIM = !!process.env.RUN_SIM;
const num = (v: string | undefined, d: number) => (v != null && v !== '' ? Number(v) : d);
const VP_TWO = '22e7f408-fa65-417e-a555-56ad87ecb428'; // 2-Victory-Point reward token

/** Clone the catalog with a tweaked monster ladder (the balance knobs). */
function tweakCatalog(
	cat: PlayCatalog,
	opts: { hpScale: number; chooseBonus: number; vpBonus: number }
): PlayCatalog {
	return {
		...cat,
		monsters: (cat.monsters ?? []).map((m) => ({
			...m,
			barrier: Math.max(1, Math.round(m.barrier * opts.hpScale)),
			// vpBonus prepends N 2-VP tokens AND raises chooseAmount so they're actually claimed.
			rewardTrack: opts.vpBonus > 0 ? [...Array(opts.vpBonus).fill(VP_TWO), ...m.rewardTrack] : m.rewardTrack,
			chooseAmount: m.chooseAmount + opts.chooseBonus + opts.vpBonus
		}))
	};
}

function realWinnerSeat(finalVP: Record<string, number>): string | null {
	let best: string | null = null;
	let bestVp = 29;
	for (const [seat, vp] of Object.entries(finalVP)) {
		if (vp >= 30 && vp > bestVp) {
			bestVp = vp;
			best = seat;
		}
	}
	return best;
}

describe.skipIf(!RUN_SIM)('economy tuning sweep', () => {
	test('measure econ game length + pvp win-round under a monster-ladder tweak', async () => {
		const base = await loadPlayCatalog();
		const games = num(process.env.TUNE_GAMES, 80);
		const seedBase = num(process.env.SEED_BASE, 1);
		const maxRounds = num(process.env.TUNE_MAXROUNDS, 300);
		const hpScale = num(process.env.HP_SCALE, 1);
		const chooseBonus = num(process.env.CHOOSE_BONUS, 0);
		const vpBonus = num(process.env.VP_BONUS, 0);
		const out = process.env.TUNE_OUT ?? '/tmp/tune';
		const catalog = tweakCatalog(base, { hpScale, chooseBonus, vpBonus });

		// ── ECON game: all-economy field (top two engines, mirrored to 4 seats) ──────
		const econNames = ['hard', 'rushpatient', 'hard', 'rushpatient'];
		const econProfiles = econNames.map((n) => BOT_PROFILES[n]);
		let econWins = 0;
		let econRoundSum = 0;
		let econVpSum = 0;
		const perEngine: Record<string, { wins: number; roundSum: number }> = {
			hard: { wins: 0, roundSum: 0 },
			rushpatient: { wins: 0, roundSum: 0 }
		};
		for (let g = 0; g < games; g++) {
			const r = playOneGame(catalog, { seed: seedBase + g, profiles: econProfiles, maxRounds });
			const w = realWinnerSeat(r.finalVP);
			econVpSum += Math.max(...Object.values(r.finalVP));
			if (w) {
				econWins += 1;
				econRoundSum += r.rounds;
				const idx = SEAT_COLORS.indexOf(w as (typeof SEAT_COLORS)[number]);
				perEngine[econNames[idx]].wins += 1;
				perEngine[econNames[idx]].roundSum += r.rounds;
			}
		}

		// ── PvP game: pvphunter vs an economy field (its natural prey) ───────────────
		const pvpNames = ['pvphunter', 'hard', 'rushpatient', 'cullean'];
		const pvpProfiles = pvpNames.map((n) => BOT_PROFILES[n]);
		let pvpWins = 0;
		let pvpRoundSum = 0;
		for (let g = 0; g < games; g++) {
			const r = playOneGame(catalog, { seed: seedBase + 500_000 + g, profiles: pvpProfiles, maxRounds });
			const w = realWinnerSeat(r.finalVP);
			if (w === SEAT_COLORS[0]) {
				pvpWins += 1;
				pvpRoundSum += r.rounds;
			}
		}

		writeFileSync(
			`${out}.json`,
			JSON.stringify(
				{
					config: { hpScale, chooseBonus, vpBonus },
					games,
					econ: {
						decisive: econWins,
						gameLen: econWins ? econRoundSum / econWins : null,
						avgTopVp: econVpSum / games,
						hard: perEngine.hard.wins ? perEngine.hard.roundSum / perEngine.hard.wins : null,
						hardWins: perEngine.hard.wins,
						rushpatient: perEngine.rushpatient.wins ? perEngine.rushpatient.roundSum / perEngine.rushpatient.wins : null,
						rushWins: perEngine.rushpatient.wins
					},
					pvp: { winRate: pvpWins / games, winRound: pvpWins ? pvpRoundSum / pvpWins : null }
				},
				null,
				2
			)
		);
		expect(games).toBeGreaterThan(0);
	}, 1_800_000);
});
