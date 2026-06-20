import { describe, expect, it } from 'vitest';
import { ability } from './infiltrator';
import { makePlayer } from './testHelpers';
import { applyGameCommand } from '../../runtime';
import type {
	AttackDie,
	GameActor,
	PublicGameState,
	PrivatePlayerState,
	SeatColor,
	PlayCatalog
} from '../../types';

/**
 * Infiltrator — DB-intended behavior:
 *   "Before Player Interaction, you may swap 1 Attack Die with all players in your
 *    Location."
 *
 * This is ENGINE-handled, not effect-system handled. The class `ability` array is
 * intentionally empty: there is no trigger, breakpoint, or claim. The swap is a
 * standalone Location-phase runtime command (`infiltratorSwap`) backed by a swap UI,
 * once per round, while an awakened Infiltrator shares a location with the targets.
 *
 * The UX channel is therefore an ENGINE ACTION — these tests drive the real
 * `applyGameCommand` dispatcher (the channel the player actually triggers) to prove
 * the swap mutates dice, and that the action surfaces (eligibility guards + a
 * `lastAction` log entry), so it is never a silent no-op.
 */

const HOST: GameActor = {
	memberId: 'm-red',
	displayName: 'Red',
	role: 'host',
	seatColor: 'Red'
};

/** A tier-tagged Attack Die with a stable instanceId, so swaps are observable by id. */
function die(instanceId: string, tier: AttackDie['tier']): AttackDie {
	return { instanceId, tier } as AttackDie;
}

/**
 * A minimal ACTIVE state in the Location phase: Red holds an awakened Infiltrator and
 * is co-located with `extras`. `applyGameCommand` clones via JSON + `ensureStateShape`
 * (fills defaults) and the `infiltratorSwap` case never touches the catalog, so a bare
 * hand-built state is enough to exercise the real engine path.
 */
function activeState(opts: {
	redDice?: AttackDie[];
	redInfiltrator?: boolean;
	redUsed?: boolean;
	redDestination?: string | null;
	extras?: Partial<Record<SeatColor, Partial<PrivatePlayerState>>>;
}): PublicGameState {
	const red = makePlayer({
		playerColor: 'Red',
		navigationDestination: opts.redDestination === undefined ? 'Floral' : opts.redDestination,
		attackDice: opts.redDice ?? [die('r1', 'basic')],
		actionsUsedThisRound: opts.redUsed ? ['infiltratorSwap'] : [],
		spirits: (opts.redInfiltrator ?? true)
			? [
					{
						slotIndex: 1,
						id: 's-inf',
						name: 'Infiltrator',
						cost: 2,
						classes: { Infiltrator: 1 },
						origins: {},
						isFaceDown: false
					}
				]
			: []
	});

	const players: Partial<Record<SeatColor, PrivatePlayerState>> = { Red: red };
	for (const [seat, override] of Object.entries(opts.extras ?? {})) {
		players[seat as SeatColor] = makePlayer({
			playerColor: seat as SeatColor,
			navigationDestination: 'Floral',
			attackDice: [die(`${seat}-1`, 'enchanted')],
			...override
		});
	}

	const activeSeats = Object.keys(players) as SeatColor[];
	const seats = Object.fromEntries(
		activeSeats.map((seat) => [
			seat,
			{ memberId: `m-${seat}`, displayName: seat, selectedGuardian: 'Myrtle' }
		])
	);

	return {
		roomCode: 'TEST',
		revision: 0,
		status: 'active',
		phase: 'location',
		players,
		activeSeats,
		seats
	} as unknown as PublicGameState;
}

function swap(
	state: PublicGameState,
	swaps: { targetSeat: SeatColor; myInstanceId: string; theirInstanceId: string }[]
) {
	return applyGameCommand(state, HOST, { type: 'infiltratorSwap', swaps }, {} as PlayCatalog);
}

describe('Infiltrator — engine-handled dice swap', () => {
	it('the class ability array is intentionally empty (engine-handled, not effect-handled)', () => {
		expect(ability).toEqual([]);
	});

	it('swaps one of your dice for a co-located player\'s die (DB behavior)', () => {
		const state = activeState({
			redDice: [die('r1', 'basic')],
			extras: { Blue: { attackDice: [die('b1', 'arcane')] } }
		});
		const result = swap(state, [
			{ targetSeat: 'Blue', myInstanceId: 'r1', theirInstanceId: 'b1' }
		]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Red now holds Blue's arcane die; Blue holds Red's basic die.
		expect(result.state.players.Red!.attackDice.map((d) => d.instanceId)).toEqual(['b1']);
		expect(result.state.players.Blue!.attackDice.map((d) => d.instanceId)).toEqual(['r1']);
	});

	it('swaps with every co-located player at once (one die each)', () => {
		const state = activeState({
			redDice: [die('r1', 'basic'), die('r2', 'enchanted')],
			extras: {
				Blue: { attackDice: [die('b1', 'arcane')] },
				Green: { attackDice: [die('g1', 'exalted')] }
			}
		});
		const result = swap(state, [
			{ targetSeat: 'Blue', myInstanceId: 'r1', theirInstanceId: 'b1' },
			{ targetSeat: 'Green', myInstanceId: 'r2', theirInstanceId: 'g1' }
		]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const redIds = result.state.players.Red!.attackDice.map((d) => d.instanceId).sort();
		expect(redIds).toEqual(['b1', 'g1']);
		expect(result.state.players.Blue!.attackDice.map((d) => d.instanceId)).toEqual(['r1']);
		expect(result.state.players.Green!.attackDice.map((d) => d.instanceId)).toEqual(['r2']);
	});

	// No-silent-no-op: a successful swap records a visible lastAction the player sees.
	it('records a visible lastAction log entry (the swap is not silent)', () => {
		const state = activeState({
			redDice: [die('r1', 'basic')],
			extras: { Blue: { attackDice: [die('b1', 'arcane')] } }
		});
		const result = swap(state, [
			{ targetSeat: 'Blue', myInstanceId: 'r1', theirInstanceId: 'b1' }
		]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const last = result.state.players.Red!.lastAction;
		expect(last?.key).toBe('infiltrate');
		expect(last?.log.length).toBeGreaterThan(0);
		expect(result.state.players.Red!.actionsUsedThisRound).toContain('infiltratorSwap');
	});

	it('rejects a second swap in the same round (once per round)', () => {
		const state = activeState({
			redUsed: true,
			extras: { Blue: {} }
		});
		const result = swap(state, [
			{ targetSeat: 'Blue', myInstanceId: 'r1', theirInstanceId: 'Blue-1' }
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe('already_used');
	});

	it('rejects swapping with a player who is not in your location', () => {
		const state = activeState({
			extras: { Blue: { navigationDestination: 'Tidal' } }
		});
		const result = swap(state, [
			{ targetSeat: 'Blue', myInstanceId: 'r1', theirInstanceId: 'Blue-1' }
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe('not_colocated');
	});

	it('rejects the action when the player has no awakened Infiltrator', () => {
		const state = activeState({
			redInfiltrator: false,
			extras: { Blue: {} }
		});
		const result = swap(state, [
			{ targetSeat: 'Blue', myInstanceId: 'r1', theirInstanceId: 'Blue-1' }
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe('no_infiltrator');
	});

	it('rejects swapping with yourself', () => {
		const state = activeState({ extras: { Blue: {} } });
		const result = swap(state, [
			{ targetSeat: 'Red', myInstanceId: 'r1', theirInstanceId: 'r1' }
		]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe('self_swap');
	});
});
