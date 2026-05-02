import { describe, expect, test } from 'vitest';
import {
	applyGameCommand,
	buildHistorySnapshotRows,
	buildSessionProjection,
	createLobbyState
} from './runtime';
import type { GameActor, PlayCatalog, PublicGameState } from './types';

const HOST: GameActor = {
	memberId: 'member-host',
	displayName: 'Host Player',
	role: 'host',
	seatColor: null
};

const GUEST: GameActor = {
	memberId: 'member-guest',
	displayName: 'Guest Player',
	role: 'player',
	seatColor: null
};

const CATALOG: PlayCatalog = {
	guardians: [
		{ id: 'g-myrtle', name: 'Myrtle', originId: 'astral-zone' },
		{ id: 'g-nyra', name: 'Nyra', originId: 'arcane-abyss' }
	],
	runes: [
		{
			id: 'rune-forest',
			name: 'Forest Rune',
			kind: 'rune',
			originId: 'forest',
			classId: null
		},
		{
			id: 'augment-fighter',
			name: 'Fighter Augment',
			kind: 'augment',
			originId: null,
			classId: 'fighter'
		},
		{
			id: 'relic-sun',
			name: 'Sun Relic',
			kind: 'relic',
			originId: null,
			classId: null
		}
	],
	dice: [
		{ id: 'basic_attack', name: 'Basic Attack', diceType: 'attack' },
		{ id: 'exalted_attack', name: 'Exalted Attack', diceType: 'attack' },
		{ id: 'arcane_attack', name: 'Arcane Attack', diceType: 'attack' },
		{ id: 'defense_dice', name: 'Defense Dice', diceType: 'defense' }
	],
	spirits: [
		{
			id: 'spirit-01',
			name: 'Hero Party',
			cost: 3,
			classes: { Bard: 1 },
			origins: { Carnival: 1 }
		},
		{
			id: 'spirit-02',
			name: 'Star Binder',
			cost: 2,
			classes: { Mage: 2 },
			origins: { Astral: 1 }
		},
		{
			id: 'spirit-03',
			name: 'Crimson Duelist',
			cost: 2,
			classes: { Fighter: 2 },
			origins: { Blood: 1 }
		},
		{
			id: 'spirit-04',
			name: 'Sun Herald',
			cost: 4,
			classes: { Cleric: 2 },
			origins: { Dawn: 1 }
		},
		{
			id: 'spirit-05',
			name: 'Abyss Watcher',
			cost: 5,
			classes: { Rogue: 2 },
			origins: { Abyss: 1 }
		},
		{
			id: 'spirit-06',
			name: 'Glass Oracle',
			cost: 1,
			classes: { Mage: 1 },
			origins: { Fate: 1 }
		},
		{
			id: 'spirit-07',
			name: 'Tide Warden',
			cost: 2,
			classes: { Guardian: 1 },
			origins: { Tide: 2 }
		},
		{
			id: 'spirit-08',
			name: 'Contessa',
			cost: 7,
			classes: { WorldEnder: 1 },
			origins: {}
		},
		{
			id: 'spirit-09',
			name: 'Hollow Eyes',
			cost: 8,
			classes: { Rogue: 1 },
			origins: {}
		},
		{
			id: 'spirit-10',
			name: 'Meteor Shower',
			cost: 9,
			classes: { Elementalist: 1 },
			origins: {}
		},
		{
			id: 'spirit-11',
			name: 'Lantern Dryad',
			cost: 3,
			classes: { Druid: 1 },
			origins: { Lantern: 1 }
		},
		{
			id: 'spirit-12',
			name: 'Signal Fox',
			cost: 2,
			classes: { Scout: 1 },
			origins: { Cyber: 1 }
		},
		{
			id: 'spirit-13',
			name: 'Pebble Sage',
			cost: 1,
			classes: { Sage: 1 },
			origins: { Earth: 1 }
		},
		{
			id: 'spirit-14',
			name: 'Moss Knight',
			cost: 4,
			classes: { Guardian: 1 },
			origins: { Forest: 1 }
		}
	]
};

function withLobbySelections(): PublicGameState {
	let state = createLobbyState({
		roomCode: 'ROOM42',
		guardianNames: CATALOG.guardians.map((guardian) => guardian.name)
	});

	const redClaim = applyGameCommand(state, HOST, { type: 'claimSeat', seatColor: 'Red' }, CATALOG);
	if (!redClaim.ok) throw new Error(redClaim.error.message);
	state = redClaim.state;

	const blueClaim = applyGameCommand(state, GUEST, { type: 'claimSeat', seatColor: 'Blue' }, CATALOG);
	if (!blueClaim.ok) throw new Error(blueClaim.error.message);
	state = blueClaim.state;

	const redGuardian = applyGameCommand(
		state,
		{ ...HOST, seatColor: 'Red' },
		{ type: 'selectGuardian', guardianName: 'Myrtle' },
		CATALOG
	);
	if (!redGuardian.ok) throw new Error(redGuardian.error.message);
	state = redGuardian.state;

	const blueGuardian = applyGameCommand(
		state,
		{ ...GUEST, seatColor: 'Blue' },
		{ type: 'selectGuardian', guardianName: 'Nyra' },
		CATALOG
	);
	if (!blueGuardian.ok) throw new Error(blueGuardian.error.message);
	return blueGuardian.state;
}

describe('play runtime', () => {
	test('rejects claiming an occupied seat', () => {
		const initial = createLobbyState({
			roomCode: 'ROOM42',
			guardianNames: CATALOG.guardians.map((guardian) => guardian.name)
		});

		const firstClaim = applyGameCommand(initial, HOST, { type: 'claimSeat', seatColor: 'Red' }, CATALOG);
		expect(firstClaim.ok).toBe(true);
		if (!firstClaim.ok) return;

		const secondClaim = applyGameCommand(
			firstClaim.state,
			GUEST,
			{ type: 'claimSeat', seatColor: 'Red' },
			CATALOG
		);

		expect(secondClaim.ok).toBe(false);
		if (secondClaim.ok) return;
		expect(secondClaim.error.code).toBe('seat_taken');
	});

	test('starts a game with initialized players and seeded market slots', () => {
		const lobby = withLobbySelections();

		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);

		expect(started.ok).toBe(true);
		if (!started.ok) return;

		expect(started.state.status).toBe('active');
		expect(started.state.gameId).toMatch(/^game_/);
		expect(started.state.round).toBe(1);
		expect(started.state.market.map((slot) => slot.spiritId)).toEqual([
			'spirit-01',
			'spirit-02',
			'spirit-03',
			'spirit-04',
			'spirit-05',
			'spirit-06'
		]);
		expect(started.state.bags.hexSpirits.count).toBe(5);
		expect(started.state.bags.abyssFallen.count).toBe(3);
		const redPlayer = started.state.players.Red;
		const bluePlayer = started.state.players.Blue;
		expect(redPlayer).toBeDefined();
		expect(bluePlayer).toBeDefined();
		if (!redPlayer || !bluePlayer) return;
		expect(redPlayer.selectedGuardian).toBe('Myrtle');
		expect(redPlayer.barrier).toBe(4);
		expect(bluePlayer.selectedGuardian).toBe('Nyra');
	});

	test('spawns synced dice on the player mat and allows moving them', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const spawned = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'spawnDiceBatch', diceId: 'basic_attack', count: 2 },
			CATALOG
		);

		expect(spawned.ok).toBe(true);
		if (!spawned.ok) return;

		const dice = spawned.state.players.Red?.spawnedDice ?? [];
		expect(dice).toHaveLength(2);
			expect(dice[0]).toMatchObject({
				diceId: 'basic_attack',
				name: 'Basic Attack',
				diceType: 'attack',
				faceIndex: expect.any(Number),
				rollRotation: {
					x: expect.any(Number),
					y: expect.any(Number),
					z: expect.any(Number)
				}
			});

		const moved = applyGameCommand(
			spawned.state,
			{ ...HOST, seatColor: 'Red' },
			{
				type: 'moveMatObject',
				objectType: 'die',
				instanceId: dice[0]!.instanceId,
				localX: -0.25,
				localZ: 0.55
			},
			CATALOG
		);

		expect(moved.ok).toBe(true);
		if (!moved.ok) return;
			expect(moved.state.players.Red?.spawnedDice[0]).toMatchObject({
				localX: -0.25,
				localZ: 0.55
			});
		});

		test('rolls all spawned dice for the active player', () => {
			const lobby = withLobbySelections();
			const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
			if (!started.ok) throw new Error(started.error.message);

			const spawned = applyGameCommand(
				started.state,
				{ ...HOST, seatColor: 'Red' },
				{ type: 'spawnDiceBatch', diceId: 'basic_attack', count: 2 },
				CATALOG
			);
			if (!spawned.ok) throw new Error(spawned.error.message);

			const before = spawned.state.players.Red?.spawnedDice.map((die) => ({
				faceIndex: die.faceIndex,
				rollRotation: die.rollRotation
			}));
			const rolled = applyGameCommand(
				spawned.state,
				{ ...HOST, seatColor: 'Red' },
				{ type: 'rollSpawnedDice' },
				CATALOG
			);

			expect(rolled.ok).toBe(true);
			if (!rolled.ok) return;
			const dice = rolled.state.players.Red?.spawnedDice ?? [];
			expect(dice).toHaveLength(2);
			expect(dice.every((die) => die.faceIndex >= 0 && die.faceIndex < 6)).toBe(true);
			expect(dice.map((die) => ({ faceIndex: die.faceIndex, rollRotation: die.rollRotation }))).not.toEqual(before);
		});

		test('spawns rune, augment, and relic props on the player mat', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		let state = started.state;
		for (const runeId of ['rune-forest', 'augment-fighter', 'relic-sun'] as const) {
			const next = applyGameCommand(
				state,
				{ ...HOST, seatColor: 'Red' },
				{ type: 'spawnMatItem', runeId },
				CATALOG
			);
			if (!next.ok) throw new Error(next.error.message);
			state = next.state;
		}

		const items = state.players.Red?.spawnedItems ?? [];
		expect(items).toHaveLength(3);
		expect(items.map((item) => item.kind)).toEqual(['rune', 'augment', 'relic']);
	});

	test('flips potential tokens using the rightmost-blood policy', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const toBlood = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'flipPotentialToken', slotIndex: 4 },
			CATALOG
		);

		expect(toBlood.ok).toBe(true);
		if (!toBlood.ok) return;
		expect(toBlood.state.players.Red).toMatchObject({
			blood: 1,
			barrier: 3
		});

		const backToBarrier = applyGameCommand(
			toBlood.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'flipPotentialToken', slotIndex: 4 },
			CATALOG
		);

		expect(backToBarrier.ok).toBe(true);
		if (!backToBarrier.ok) return;
		expect(backToBarrier.state.players.Red).toMatchObject({
			blood: 0,
			barrier: 4
		});
	});

	test('takes a spirit into the first empty slot and refills the market', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const taken = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'takeSpirit', marketIndex: 0 },
			CATALOG
		);

		expect(taken.ok).toBe(true);
		if (!taken.ok) return;

		const redPlayer = taken.state.players.Red;
		expect(redPlayer).toBeDefined();
		if (!redPlayer) return;
		expect(redPlayer.spirits).toHaveLength(1);
		expect(redPlayer.spirits[0]).toMatchObject({
			slotIndex: 1,
			id: 'spirit-01',
			name: 'Hero Party'
		});
		expect(taken.state.market[0].spiritId).toBe('spirit-07');
		expect(taken.state.bags.hexSpirits.count).toBe(4);
	});

	test('draws four spirit world spirits into the private tray and tracks picks remaining', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const drawn = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'drawSpiritWorld' },
			CATALOG
		);

		expect(drawn.ok).toBe(true);
		if (!drawn.ok) return;

		const redPlayer = drawn.state.players.Red;
		expect(redPlayer).toBeDefined();
		if (!redPlayer) return;
		expect(redPlayer.handDraws).toHaveLength(4);
		expect(redPlayer.pendingDraw).toMatchObject({
			sourceBag: 'Spirit World Bag',
			drawCount: 4,
			summonLimit: 2,
			summonedCount: 0
		});
		expect(drawn.state.bags.hexSpirits.count).toBe(1);
	});

	test('spawns a chosen spirit world draw face-up and returns leftovers after the second summon', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const drawn = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'drawSpiritWorld' },
			CATALOG
		);
		if (!drawn.ok) throw new Error(drawn.error.message);

		const firstGuid = drawn.state.players.Red?.handDraws[0]?.guid;
		const secondGuid = drawn.state.players.Red?.handDraws[1]?.guid;
		if (!firstGuid || !secondGuid) throw new Error('Expected spirit world tray entries.');

		const firstSpawn = applyGameCommand(
			drawn.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'spawnHandSpirit', guid: firstGuid },
			CATALOG
		);
		if (!firstSpawn.ok) throw new Error(firstSpawn.error.message);

		const secondSpawn = applyGameCommand(
			firstSpawn.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'spawnHandSpirit', guid: secondGuid },
			CATALOG
		);

		expect(secondSpawn.ok).toBe(true);
		if (!secondSpawn.ok) return;

		const redPlayer = secondSpawn.state.players.Red;
		expect(redPlayer).toBeDefined();
		if (!redPlayer) return;
		expect(redPlayer.spirits).toHaveLength(2);
		expect(redPlayer.spirits[0]?.isFaceDown).toBe(false);
		expect(redPlayer.spirits[1]?.isFaceDown).toBe(false);
		expect(redPlayer.handDraws).toEqual([]);
		expect(redPlayer.pendingDraw).toBeNull();
		expect(secondSpawn.state.bags.hexSpirits.count).toBe(3);
	});

	test('draws arcane abyss spirits face-down and flips them on command', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const drawn = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'drawArcaneAbyss' },
			CATALOG
		);
		if (!drawn.ok) throw new Error(drawn.error.message);

		const guid = drawn.state.players.Red?.handDraws[0]?.guid;
		if (!guid) throw new Error('Expected arcane abyss tray entries.');

		const spawned = applyGameCommand(
			drawn.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'spawnHandSpirit', guid },
			CATALOG
		);
		if (!spawned.ok) throw new Error(spawned.error.message);

		const redPlayer = spawned.state.players.Red;
		expect(redPlayer).toBeDefined();
		if (!redPlayer) return;
		expect(redPlayer.spirits[0]?.isFaceDown).toBe(true);
		expect(redPlayer.handDraws).toEqual([]);
		expect(redPlayer.pendingDraw).toBeNull();
		expect(spawned.state.bags.abyssFallen.count).toBe(2);

		const flipped = applyGameCommand(
			spawned.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'flipSpirit', slotIndex: 1 },
			CATALOG
		);

		expect(flipped.ok).toBe(true);
		if (!flipped.ok) return;
		expect(flipped.state.players.Red?.spirits[0]?.isFaceDown).toBe(false);
	});

	test('returns unchosen tray spirits to their source bag', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const drawn = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'drawArcaneAbyss' },
			CATALOG
		);
		if (!drawn.ok) throw new Error(drawn.error.message);

		const discarded = applyGameCommand(
			drawn.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'discardHandDraws' },
			CATALOG
		);

		expect(discarded.ok).toBe(true);
		if (!discarded.ok) return;

		const redPlayer = discarded.state.players.Red;
		expect(redPlayer).toBeDefined();
		if (!redPlayer) return;
		expect(redPlayer.handDraws).toEqual([]);
		expect(redPlayer.pendingDraw).toBeNull();
		expect(discarded.state.bags.abyssFallen.count).toBe(3);
	});

	test('hides private hand draws from spectators and other seats', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const redPlayer = started.state.players.Red;
		if (!redPlayer) throw new Error('Red player was not initialized.');
		redPlayer.handDraws = [{ guid: 'draw-01', id: 'spirit-07', name: 'Tide Warden' }];

		const spectatorProjection = buildSessionProjection(started.state, {
			role: 'spectator',
			seatColor: null,
			displayName: 'Observer'
		});
		const blueProjection = buildSessionProjection(started.state, {
			role: 'player',
			seatColor: 'Blue',
			displayName: 'Guest Player'
		});
		const redProjection = buildSessionProjection(started.state, {
			role: 'player',
			seatColor: 'Red',
			displayName: 'Host Player'
		});

		const spectatorRed = spectatorProjection.players.Red;
		const blueRed = blueProjection.players.Red;
		const redRed = redProjection.players.Red;
		expect(spectatorRed).toBeDefined();
		expect(blueRed).toBeDefined();
		expect(redRed).toBeDefined();
		if (!spectatorRed || !blueRed || !redRed) return;
		expect(spectatorRed.handDraws).toEqual([]);
		expect(blueRed.handDraws).toEqual([]);
		expect(redRed.handDraws).toHaveLength(1);
	});

	test('builds history-compatible snapshot rows at round commit', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		let state = started.state;
		const redDestination = applyGameCommand(
			state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'selectNavigationDestination', destination: 'Tidal Cove' },
			CATALOG
		);
		if (!redDestination.ok) throw new Error(redDestination.error.message);
		state = redDestination.state;

		const blueDestination = applyGameCommand(
			state,
			{ ...GUEST, seatColor: 'Blue' },
			{ type: 'selectNavigationDestination', destination: 'Arcane Abyss' },
			CATALOG
		);
		if (!blueDestination.ok) throw new Error(blueDestination.error.message);
		state = blueDestination.state;

		const rows = buildHistorySnapshotRows(state, '2026-04-27T20:00:00.000Z');

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			game_id: state.gameId,
			navigation_count: 1,
			player_color: 'Blue',
			selected_character: 'Nyra'
		});
		expect(rows[0].bags).toEqual(state.bags.history);
		expect(rows[1]).toMatchObject({
			game_id: state.gameId,
			navigation_count: 1,
			player_color: 'Red',
			selected_character: 'Myrtle'
		});
	});

	test('rejects destinations outside the spirit world map', () => {
		const lobby = withLobbySelections();
		const started = applyGameCommand(lobby, { ...HOST, seatColor: 'Red' }, { type: 'startGame' }, CATALOG);
		if (!started.ok) throw new Error(started.error.message);

		const invalidDestination = applyGameCommand(
			started.state,
			{ ...HOST, seatColor: 'Red' },
			{ type: 'selectNavigationDestination', destination: 'Kitchen Sink' },
			CATALOG
		);

		expect(invalidDestination.ok).toBe(false);
		if (invalidDestination.ok) return;
		expect(invalidDestination.error.code).toBe('destination_invalid');
	});
});
