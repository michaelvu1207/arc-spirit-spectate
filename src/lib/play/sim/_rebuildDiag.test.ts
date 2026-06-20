/**
 * Scratch diagnostic — per-profile solo build/climb phase split + Elementalist throughput.
 *   RUN_SIM=1 npx vitest run src/lib/play/sim/_rebuildDiag.test.ts --disable-console-intercept
 */
import { describe, expect, test } from 'vitest';
import { loadPlayCatalog } from '../server/catalog';
import { BOT_PROFILES } from '../server/botPolicy';
import { applyDeadlineAdvance, applyGameCommand, createLobbyState } from '../runtime';
import { createRng, nextInt, type RngState } from '../rng';
import { botActorFor, botSeatNeedsToAct, planBotPhaseActions, type BotProfile, type BotRandom } from '../server/botPolicy';
import { awakenedClassCounts } from '../effects/apply';
import { SEAT_COLORS, type GameActor, type PlayCatalog, type SeatColor } from '../types';

const RUN_SIM = !!process.env.RUN_SIM;
function rng(r: RngState): BotRandom { return { int: (m: number) => nextInt(r, m), chance: () => nextInt(r, 2) === 0 }; }
function ok(r: ReturnType<typeof applyGameCommand>) { if (!r.ok) throw new Error(r.error.code); return r.state; }

function traceSolo(catalog: PlayCatalog, seed: number, profile: BotProfile, maxRounds: number) {
	const seat: SeatColor = SEAT_COLORS[0];
	const g = catalog.guardians[0].name;
	let state = createLobbyState({ roomCode: 'SIM', guardianNames: [g] });
	const host: GameActor = { memberId: 'host', displayName: 'host', role: 'host', seatColor: null };
	const m = { memberId: 'bot-Red', displayName: '🤖 Red', role: 'player' as const, seatColor: null };
	state = ok(applyGameCommand(state, m, { type: 'claimSeat', seatColor: seat }, catalog));
	state = ok(applyGameCommand(state, { ...m, seatColor: seat }, { type: 'selectGuardian', guardianName: g }, catalog));
	state = ok(applyGameCommand(state, host, { type: 'startGame', seed }, catalog));
	const botRng = rng(createRng(seed));
	let cur = state.round, dest = '?', firstKill = -1, peakEle = 0, cyber = 0;
	let buildFloral = 0, climbFloral = 0, ticks = 0;
	const rows: { round: number; dest: string; vp: number }[] = [];
	const flush = () => {
		const p = state.players[seat]!;
		// EFFECTIVE Elementalist count (spirits + placed augments on awakened hosts).
		const ele = awakenedClassCounts(p)['Elementalist'] ?? 0;
		peakEle = Math.max(peakEle, ele);
		rows.push({ round: cur, dest, vp: p.victoryPoints });
		if (firstKill < 0 && p.victoryPoints > 0) firstKill = rows.length - 1;
		if (dest.startsWith('Cyber')) cyber++;
		dest = '?';
	};
	while (state.status === 'active' && state.round <= maxRounds) {
		if (++ticks > 50000) break;
		if (state.round !== cur) { flush(); cur = state.round; }
		let progressed = false;
		for (const s of state.activeSeats) {
			if (!botSeatNeedsToAct(state, s)) continue;
			for (const c of planBotPhaseActions(state, s, catalog, botRng, profile)) {
				const r = applyGameCommand(state, botActorFor(state, s), c, catalog);
				if (!r.ok) break; state = r.state; progressed = true;
				if (s === seat && c.type === 'lockNavigation') dest = c.destination;
				if (state.status !== 'active') break;
			}
			if (state.status !== 'active') break;
		}
		if (!progressed && state.status === 'active') {
			const b = `${state.phase}:${state.round}`; applyDeadlineAdvance(state, catalog);
			if (`${state.phase}:${state.round}` === b) break;
		}
	}
	flush();
	const p = state.players[seat]!;
	const fk = firstKill < 0 ? rows.length : firstKill;
	rows.slice(0, fk).forEach((r) => { if (r.dest.startsWith('Floral')) buildFloral++; });
	rows.slice(fk).forEach((r) => { if (r.dest.startsWith('Floral')) climbFloral++; });
	return { won: p.victoryPoints >= 30, rounds: state.round, vp: p.victoryPoints, status: p.statusLevel, peakEle, cyber, buildRounds: fk, climbRounds: rows.length - fk, buildFloral, climbFloral };
}

describe.skipIf(!RUN_SIM)('elementalist scaling diagnostic', () => {
	test('per-profile solo build/climb + peak Elementalists', async () => {
		const catalog = await loadPlayCatalog();
		const NSEED = 30;
		for (const name of ['cullean', 'culrush', 'rushpatient', 'hard', 'cultivator']) {
			const profile = BOT_PROFILES[name];
			const gs = Array.from({ length: NSEED }, (_, i) => traceSolo(catalog, i + 1, profile, 120));
			const won = gs.filter((x) => x.won);
			const a = (f: (x: (typeof gs)[number]) => number, set = gs) => (set.reduce((s, x) => s + f(x), 0) / set.length).toFixed(1);
			console.log(`${name.padEnd(11)} WON=${won.length}/${NSEED} avgR=${a((x) => x.rounds)} status=${a((x) => x.status)} | WON: rounds=${won.length ? a((x) => x.rounds, won) : 'n/a'} build=${won.length ? a((x) => x.buildRounds, won) : 'n/a'}(Floral=${won.length ? a((x) => x.buildFloral, won) : 'n/a'},Cyber=${won.length ? a((x) => x.cyber, won) : 'n/a'}) climb=${won.length ? a((x) => x.climbRounds, won) : 'n/a'} peakEffEle=${won.length ? a((x) => x.peakEle, won) : 'n/a'}`);
		}
		expect((catalog.monsters ?? []).length).toBeGreaterThan(0);
	}, 300000);
});
