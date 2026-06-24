/**
 * Profiler: where does the per-command clone cost go? Builds a realistic late-game 4p state,
 * then times the current JSON clone vs variants that drop heavy substructures, to decide the
 * safest high-impact Tier-1 fix. PROFILE=1 to run.
 */
import { describe, it } from 'vitest';
import { applyGameCommand, applyDeadlineAdvance, createLobbyState } from '../runtime';
import { createRng, nextInt, type RngState } from '../rng';
import { botActorFor, botSeatNeedsToAct, planBotPhaseActions, profileFor, type BotRandom } from '../server/botPolicy';
import { SEAT_COLORS, type GameActor, type PublicGameState, type SeatColor } from '../types';
import { loadOrSnapshotCatalog } from '../ml/nodeIo';

const RUN = process.env.PROFILE === '1';

function botRandom(rng: RngState): BotRandom {
	return { int: (m: number) => nextInt(rng, m), chance: () => nextInt(rng, 2) === 0 };
}

function bytes(o: unknown): number {
	return JSON.stringify(o).length;
}

function timeIt(label: string, n: number, fn: () => void): void {
	fn(); // warmup
	const t0 = performance.now();
	for (let i = 0; i < n; i++) fn();
	const dt = performance.now() - t0;
	// eslint-disable-next-line no-console
	console.log(`[profile] ${label.padEnd(34)} ${((dt / n) * 1000).toFixed(2)} µs/clone   (${(n / (dt / 1000)).toFixed(0)}/s)`);
}

describe('clone profiler', () => {
	(RUN ? it : it.skip)(
		'state size + clone cost breakdown',
		async () => {
			const catalog = await loadOrSnapshotCatalog();
			const seats = SEAT_COLORS.slice(0, 4) as SeatColor[];
			const guardianNames = catalog.guardians.slice(0, 4).map((g) => g.name);
			let state = createLobbyState({ roomCode: 'PROF', guardianNames });
			const host: GameActor = { memberId: 'host', displayName: 'host', role: 'host', seatColor: null };
			seats.forEach((seat, i) => {
				const id = `bot-${seat}`;
				state = (applyGameCommand(state, { memberId: id, displayName: seat, role: 'player', seatColor: null }, { type: 'claimSeat', seatColor: seat }, catalog) as { state: PublicGameState }).state;
				state = (applyGameCommand(state, { memberId: id, displayName: seat, role: 'player', seatColor: seat }, { type: 'selectGuardian', guardianName: guardianNames[i] }, catalog) as { state: PublicGameState }).state;
			});
			state = (applyGameCommand(state, host, { type: 'startGame', seed: 42 }, catalog) as { state: PublicGameState }).state;

			// Drive ~40 rounds to reach a heavy mid/late-game state.
			const rng = botRandom(createRng(42));
			const profiles = Object.fromEntries(seats.map((s) => [s, profileFor('medium')]));
			let ticks = 0;
			while (state.status === 'active' && state.round <= 40 && ticks < 5000) {
				ticks++;
				let progressed = false;
				for (const seat of state.activeSeats) {
					if (!botSeatNeedsToAct(state, seat)) continue;
					for (const cmd of planBotPhaseActions(state, seat, catalog, rng, profiles[seat])) {
						const r = applyGameCommand(state, botActorFor(state, seat), cmd, catalog);
						if (!r.ok) break;
						state = r.state;
						progressed = true;
						if (state.status !== 'active') break;
					}
					if (state.status !== 'active') break;
				}
				if (!progressed) applyDeadlineAdvance(state, catalog);
			}

			// eslint-disable-next-line no-console
			console.log(`[profile] reached round ${state.round}, status ${state.status}`);
			// eslint-disable-next-line no-console
			console.log(`[profile] state size: ${(bytes(state) / 1024).toFixed(1)} KB total | bags ${(bytes(state.bags) / 1024).toFixed(1)} KB | bags.history ${(bytes(state.bags?.history ?? {}) / 1024).toFixed(1)} KB | players ${(bytes(state.players) / 1024).toFixed(1)} KB`);

			const N = 5000;
			const noBags = { ...state, bags: undefined };
			const noHistory = { ...state, bags: { ...state.bags, history: undefined } };
			timeIt('JSON full (current)', N, () => void JSON.parse(JSON.stringify(state)));
			timeIt('JSON minus bags.history', N, () => void JSON.parse(JSON.stringify(noHistory)));
			timeIt('JSON minus all bags', N, () => void JSON.parse(JSON.stringify(noBags)));
			timeIt('structuredClone full', N, () => void structuredClone(state));
		},
		300000
	);
});
