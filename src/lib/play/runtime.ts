import type { BagsData } from '$lib/types';
import type {
	CommandResult,
	DiceType,
	GameActor,
	GameCommand,
	HistorySnapshotRow,
	LobbySeatState,
	PlayCatalog,
	PlayCatalogDie,
	PlayCatalogRune,
	PlayCatalogSpirit,
	PlayerProjection,
	PrivatePlayerState,
	PublicGameState,
	RuntimeBagEntry,
	RuntimeBagsState,
	SeatColor,
	SpiritSourceBag,
	SpectatorProjection
} from './types';
import { SEAT_COLORS, SPIRIT_WORLD_LOCATIONS } from './types';

const EMPTY_BAG = Object.freeze({
	count: 0,
	contents: []
});
const SPIRIT_WORLD_BAG: SpiritSourceBag = 'Spirit World Bag';
const ARCANE_ABYSS_BAG: SpiritSourceBag = 'Arcane Abyss Bag';
const DICE_GRID_START_X = -0.5;
const DICE_GRID_START_Z = 0;
const DICE_GRID_SPACING = 0.25;
const DICE_GRID_COLS = 5;
const MAT_ITEM_SLOT_POSITIONS = [
	{ x: 0.176, z: -0.034 },
	{ x: 0.013, z: -0.279 },
	{ x: -0.141, z: -0.515 },
	{ x: -0.284, z: -0.764 }
] as const;
const MAT_ITEM_RESERVE_START = { x: -0.42, z: -0.95 };
const MAT_ITEM_RESERVE_SPACING = 0.18;

function cloneState(state: PublicGameState): PublicGameState {
	return structuredClone(state);
}

function toBagEntry(spirit: PlayCatalogSpirit, guidSuffix: string): RuntimeBagEntry {
	return {
		name: spirit.name,
		guid: `play_${guidSuffix}_${spirit.id}`,
		id: spirit.id,
		cost: spirit.cost
	};
}

function buildHistoryBags(state: Omit<RuntimeBagsState, 'history'>): BagsData {
	return {
		hexSpirits: state.hexSpirits,
		monsters: state.monsters,
		abyssFallen: state.abyssFallen,
		stageDeck: state.stageDeck,
		purgeBags: state.purgeBags
	};
}

function createEmptyBags(): RuntimeBagsState {
	const base = {
		hexSpirits: { count: 0, contents: [] },
		monsters: { count: 0, contents: [] },
		abyssFallen: { count: 0, contents: [] },
		stageDeck: { count: 0, contents: [] },
		purgeBags: [] as []
	};

	return {
		...base,
		history: buildHistoryBags(base)
	};
}

function createSeatRecord(guardianPool: string[]): Record<SeatColor, LobbySeatState> {
	const seats = {} as Record<SeatColor, LobbySeatState>;
	for (const seatColor of SEAT_COLORS) {
		seats[seatColor] = {
			seatColor,
			memberId: null,
			displayName: null,
			selectedGuardian: guardianPool.length === 0 ? null : null
		};
	}
	return seats;
}

function buildPlayerState(seatColor: SeatColor, seat: LobbySeatState): PrivatePlayerState {
	return {
		playerColor: seatColor,
		displayName: seat.displayName,
		selectedGuardian: seat.selectedGuardian ?? 'Unknown Guardian',
		navigationDestination: null,
		blood: 0,
		victoryPoints: 0,
		barrier: 4,
		maxTokens: 4,
		statusLevel: 1,
		statusToken: null,
		spirits: [],
		runes: [],
		handDraws: [],
		pendingDraw: null,
		spawnedDice: [],
		spawnedItems: [],
		spiritRuneAttachments: []
	};
}

function createInstanceId(prefix: string): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDieRoll(diceType: PlayCatalogDie['diceType']) {
	const faceCount = diceType === 'defense' ? 12 : 6;
	return {
		faceIndex: Math.floor(Math.random() * faceCount),
		rollRotation: {
			x: Math.random() * Math.PI * 2,
			y: Math.random() * Math.PI * 2,
			z: Math.random() * Math.PI * 2
		}
	};
}

function findCatalogDie(catalog: PlayCatalog, diceId: string): PlayCatalogDie | null {
	return catalog.dice.find((entry) => entry.id === diceId) ?? null;
}

function findCatalogRune(catalog: PlayCatalog, runeId: string): PlayCatalogRune | null {
	return catalog.runes.find((entry) => entry.id === runeId) ?? null;
}

function nextDicePosition(index: number) {
	const col = index % DICE_GRID_COLS;
	const row = Math.floor(index / DICE_GRID_COLS);
	return {
		x: DICE_GRID_START_X - col * DICE_GRID_SPACING,
		z: DICE_GRID_START_Z + row * DICE_GRID_SPACING
	};
}

function nextMatItemPosition(index: number) {
	if (index < MAT_ITEM_SLOT_POSITIONS.length) {
		const slot = MAT_ITEM_SLOT_POSITIONS[index]!;
		return { x: slot.x, z: slot.z };
	}

	const reserveIndex = index - MAT_ITEM_SLOT_POSITIONS.length;
	const col = reserveIndex % 3;
	const row = Math.floor(reserveIndex / 3);
	return {
		x: MAT_ITEM_RESERVE_START.x - col * MAT_ITEM_RESERVE_SPACING,
		z: MAT_ITEM_RESERVE_START.z - row * MAT_ITEM_RESERVE_SPACING
	};
}

function syncBarrierFromBlood(player: PrivatePlayerState) {
	player.blood = Math.max(0, Math.min(player.maxTokens, player.blood));
	player.barrier = Math.max(0, player.maxTokens - player.blood);
}

function sourceBagForSpiritCost(cost: number): SpiritSourceBag {
	return cost >= 7 ? ARCANE_ABYSS_BAG : SPIRIT_WORLD_BAG;
}

function buildInitialSpiritBag(catalog: PlayCatalog, sourceBag: SpiritSourceBag): RuntimeBagEntry[] {
	return catalog.spirits
		.filter((spirit) => sourceBagForSpiritCost(spirit.cost) === sourceBag)
		.map((spirit, index) => toBagEntry(spirit, String(index + 1).padStart(2, '0')));
}

function refillSingleMarketSlot(state: PublicGameState, slotIndex: number) {
	const next = state.bags.hexSpirits.contents.shift() ?? null;
	state.market[slotIndex].spiritId = next?.id ?? null;
	state.bags.hexSpirits.count = state.bags.hexSpirits.contents.length;
	state.bags.history = buildHistoryBags(state.bags);
}

function runtimeBagForSource(state: PublicGameState, sourceBag: SpiritSourceBag) {
	return sourceBag === ARCANE_ABYSS_BAG ? state.bags.abyssFallen : state.bags.hexSpirits;
}

function returnHandDrawsToBags(state: PublicGameState, player: PrivatePlayerState) {
	for (const draw of player.handDraws) {
		const sourceBag = draw.sourceBag === ARCANE_ABYSS_BAG ? ARCANE_ABYSS_BAG : SPIRIT_WORLD_BAG;
		runtimeBagForSource(state, sourceBag).contents.push({
			guid: draw.guid,
			id: draw.id,
			name: draw.name ?? 'Unknown Spirit',
			cost: draw.cost
		});
	}

	state.bags.hexSpirits.count = state.bags.hexSpirits.contents.length;
	state.bags.abyssFallen.count = state.bags.abyssFallen.contents.length;
	state.bags.history = buildHistoryBags(state.bags);
	player.handDraws = [];
	player.pendingDraw = null;
}

function firstOpenSpiritSlot(player: PrivatePlayerState) {
	return Array.from({ length: 7 }, (_, index) => index + 1).find(
		(index) => !player.spirits.some((candidate) => candidate.slotIndex === index)
	);
}

function refillEmptyMarketSlots(state: PublicGameState) {
	for (const slot of state.market) {
		if (!slot.spiritId) {
			refillSingleMarketSlot(state, slot.index);
		}
	}
}

function ensurePlayerCollections(player: PrivatePlayerState) {
	player.handDraws ??= [];
	player.runes ??= [];
	player.spirits ??= [];
	player.spawnedDice ??= [];
	player.spawnedItems ??= [];
	player.spiritRuneAttachments ??= [];
	player.pendingDraw ??= null;
}

function activePlayerForActor(
	state: PublicGameState,
	actor: GameActor
): { seatColor: SeatColor; player: PrivatePlayerState } | null {
	const seatColor = actor.seatColor;
	if (!seatColor) return null;
	const player = state.players[seatColor];
	if (!player) return null;
	ensurePlayerCollections(player);
	return { seatColor, player };
}

function failure(code: string, message: string): CommandResult {
	return {
		ok: false,
		error: { code, message }
	};
}

function success(state: PublicGameState): CommandResult {
	state.revision += 1;
	return { ok: true, state };
}

function occupiedSeatForMember(state: PublicGameState, memberId: string): SeatColor | null {
	for (const seatColor of SEAT_COLORS) {
		if (state.seats[seatColor].memberId === memberId) return seatColor;
	}
	return null;
}

function selectedGuardianTaken(state: PublicGameState, guardianName: string, excludeSeat: SeatColor | null) {
	return SEAT_COLORS.some((seatColor) => {
		if (seatColor === excludeSeat) return false;
		return state.seats[seatColor].selectedGuardian === guardianName;
	});
}

function makeGameId(now = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	const y = now.getUTCFullYear();
	const m = pad(now.getUTCMonth() + 1);
	const d = pad(now.getUTCDate());
	const hh = pad(now.getUTCHours());
	const mm = pad(now.getUTCMinutes());
	const ss = pad(now.getUTCSeconds());
	const random = Math.floor(Math.random() * 10000)
		.toString()
		.padStart(4, '0');
	return `game_${y}${m}${d}_${hh}${mm}${ss}_${random}`;
}

export function createLobbyState(input: {
	roomCode: string;
	guardianNames: string[];
}): PublicGameState {
	return {
		roomCode: input.roomCode.toUpperCase(),
		revision: 0,
		status: 'lobby',
		gameId: null,
		scenario: null,
		round: 0,
		guardianPool: [...input.guardianNames],
		seats: createSeatRecord(input.guardianNames),
		activeSeats: [],
		players: {},
		market: Array.from({ length: 6 }, (_, index) => ({ index, spiritId: null })),
		bags: createEmptyBags()
	};
}

export function applyGameCommand(
	currentState: PublicGameState,
	actor: GameActor,
	command: GameCommand,
	catalog: PlayCatalog
): CommandResult {
	const state = cloneState(currentState);

	switch (command.type) {
		case 'claimSeat': {
			if (state.status !== 'lobby') {
				return failure('seat_locked', 'Seats can only be claimed before the game starts.');
			}

			const seat = state.seats[command.seatColor];
			if (seat.memberId && seat.memberId !== actor.memberId) {
				return failure('seat_taken', `${command.seatColor} is already claimed.`);
			}

			const previousSeat = occupiedSeatForMember(state, actor.memberId);
			if (previousSeat && previousSeat !== command.seatColor) {
				state.seats[previousSeat] = {
					...state.seats[previousSeat],
					memberId: null,
					displayName: null,
					selectedGuardian: null
				};
			}

			state.seats[command.seatColor] = {
				...seat,
				memberId: actor.memberId,
				displayName: actor.displayName
			};

			return success(state);
		}

		case 'releaseSeat': {
			if (state.status !== 'lobby') {
				return failure('seat_locked', 'Seats can only be released before the game starts.');
			}

			const currentSeat = command.seatColor ?? occupiedSeatForMember(state, actor.memberId);
			if (!currentSeat || state.seats[currentSeat].memberId !== actor.memberId) {
				return failure('seat_missing', 'No claimed seat found for this member.');
			}

			state.seats[currentSeat] = {
				...state.seats[currentSeat],
				memberId: null,
				displayName: null,
				selectedGuardian: null
			};
			return success(state);
		}

		case 'selectGuardian': {
			if (state.status !== 'lobby') {
				return failure('guardian_locked', 'Guardians can only be selected before the game starts.');
			}

			if (!state.guardianPool.includes(command.guardianName)) {
				return failure('guardian_unknown', `Guardian ${command.guardianName} is not available.`);
			}

			const seatColor = actor.seatColor ?? occupiedSeatForMember(state, actor.memberId);
			if (!seatColor) {
				return failure('seat_required', 'Claim a seat before selecting a guardian.');
			}

			const seat = state.seats[seatColor];
			if (seat.memberId !== actor.memberId) {
				return failure('seat_required', 'Only the seated player can change this guardian.');
			}

			if (selectedGuardianTaken(state, command.guardianName, seatColor)) {
				return failure('guardian_taken', `${command.guardianName} is already selected.`);
			}

			state.seats[seatColor] = {
				...seat,
				selectedGuardian: command.guardianName
			};
			return success(state);
		}

		case 'startGame': {
			if (state.status !== 'lobby') {
				return failure('already_started', 'The game has already started.');
			}

			if (actor.role !== 'host') {
				return failure('host_required', 'Only the host can start the game.');
			}

			const occupiedSeats = SEAT_COLORS.filter((seatColor) => state.seats[seatColor].memberId);
			if (occupiedSeats.length === 0) {
				return failure('no_players', 'At least one player must claim a seat.');
			}

			for (const seatColor of occupiedSeats) {
				if (!state.seats[seatColor].selectedGuardian) {
					return failure('guardian_required', `Seat ${seatColor} must choose a guardian.`);
				}
			}

			state.status = 'active';
			state.gameId = makeGameId();
			state.round = 1;
			state.activeSeats = occupiedSeats;

			for (const seatColor of occupiedSeats) {
				state.players[seatColor] = buildPlayerState(seatColor, state.seats[seatColor]);
			}

			state.bags.hexSpirits = {
				count: 0,
				contents: []
			};
			state.bags.abyssFallen = {
				count: 0,
				contents: []
			};
			const spiritWorldBagContents = buildInitialSpiritBag(catalog, SPIRIT_WORLD_BAG);
			const arcaneAbyssBagContents = buildInitialSpiritBag(catalog, ARCANE_ABYSS_BAG);
			state.bags.hexSpirits = {
				count: spiritWorldBagContents.length,
				contents: spiritWorldBagContents
			};
			state.bags.abyssFallen = {
				count: arcaneAbyssBagContents.length,
				contents: arcaneAbyssBagContents
			};
			state.bags.history = buildHistoryBags(state.bags);

			refillEmptyMarketSlots(state);
			return success(state);
		}

		case 'drawSpiritWorld':
		case 'drawArcaneAbyss': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) {
				return failure('seat_required', 'Only seated players can draw spirits.');
			}

			if (activePlayer.player.handDraws.length > 0 || activePlayer.player.pendingDraw) {
				return failure('draw_pending', 'Resolve or discard your current drawn spirits first.');
			}

			const sourceBag = command.type === 'drawArcaneAbyss' ? ARCANE_ABYSS_BAG : SPIRIT_WORLD_BAG;
			const drawCount = command.type === 'drawArcaneAbyss' ? 3 : 4;
			const summonLimit = command.type === 'drawArcaneAbyss' ? 1 : 2;
			const runtimeBag = runtimeBagForSource(state, sourceBag);

			if (runtimeBag.contents.length < drawCount) {
				return failure(
					'bag_shortage',
					`Not enough spirits in ${sourceBag}. Need ${drawCount}, have ${runtimeBag.contents.length}.`
				);
			}

			const draws = runtimeBag.contents.splice(0, drawCount);
			activePlayer.player.handDraws = draws.map((entry) => ({
				guid: entry.guid,
				id: entry.id,
				name: entry.name,
				cost: entry.cost,
				sourceBag
			}));
			activePlayer.player.pendingDraw = {
				sourceBag,
				drawCount,
				summonLimit,
				summonedCount: 0
			};
			runtimeBag.count = runtimeBag.contents.length;
			state.bags.history = buildHistoryBags(state.bags);
			return success(state);
		}

		case 'spawnHandSpirit': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) {
				return failure('seat_required', 'Only seated players can summon drawn spirits.');
			}

			const pendingDraw = activePlayer.player.pendingDraw;
			if (!pendingDraw || activePlayer.player.handDraws.length === 0) {
				return failure('draw_missing', 'No drawn spirits are waiting to be summoned.');
			}

			const draw = activePlayer.player.handDraws.find((entry) => entry.guid === command.guid);
			if (!draw?.id) {
				return failure('draw_missing', 'That drawn spirit is no longer available.');
			}

			const spirit = catalog.spirits.find((entry) => entry.id === draw.id);
			if (!spirit) {
				return failure('spirit_missing', 'That spirit could not be found in the catalog.');
			}

			const slotIndex = command.slotIndex ?? firstOpenSpiritSlot(activePlayer.player);
			if (!slotIndex || slotIndex < 1 || slotIndex > 7) {
				return failure('slot_missing', 'No open spirit slot is available.');
			}

			activePlayer.player.spirits = activePlayer.player.spirits.filter(
				(candidate) => candidate.slotIndex !== slotIndex
			);
			activePlayer.player.spirits.push({
				slotIndex,
				id: spirit.id,
				name: spirit.name,
				cost: spirit.cost,
				classes: spirit.classes,
				origins: spirit.origins,
				isFaceDown: pendingDraw.sourceBag === ARCANE_ABYSS_BAG
			});
			activePlayer.player.spirits.sort((a, b) => a.slotIndex - b.slotIndex);
			activePlayer.player.handDraws = activePlayer.player.handDraws.filter((entry) => entry.guid !== command.guid);
			activePlayer.player.pendingDraw = {
				...pendingDraw,
				summonedCount: pendingDraw.summonedCount + 1
			};

			if (
				activePlayer.player.pendingDraw.summonedCount >= activePlayer.player.pendingDraw.summonLimit ||
				activePlayer.player.handDraws.length === 0
			) {
				returnHandDrawsToBags(state, activePlayer.player);
			}

			return success(state);
		}

		case 'discardHandDraws': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) {
				return failure('seat_required', 'Only seated players can discard drawn spirits.');
			}

			if (activePlayer.player.handDraws.length === 0) {
				return failure('draw_missing', 'No drawn spirits are waiting to be discarded.');
			}

			returnHandDrawsToBags(state, activePlayer.player);
			return success(state);
		}

		case 'takeSpirit':
		case 'replaceSpirit': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) {
				return failure('seat_required', 'Only seated players can take a spirit.');
			}

			const marketSlot = state.market[command.marketIndex];
			if (!marketSlot || !marketSlot.spiritId) {
				return failure('market_empty', 'That market slot is empty.');
			}

			const spirit = catalog.spirits.find((entry) => entry.id === marketSlot.spiritId);
			if (!spirit) {
				return failure('spirit_missing', 'That spirit could not be found in the catalog.');
			}

			const slotIndex =
				command.type === 'replaceSpirit' ? command.slotIndex : command.slotIndex ?? firstOpenSpiritSlot(activePlayer.player);

			if (!slotIndex || slotIndex < 1 || slotIndex > 7) {
				return failure('slot_missing', 'No open spirit slot is available.');
			}

			activePlayer.player.spirits = activePlayer.player.spirits.filter(
				(candidate) => candidate.slotIndex !== slotIndex
			);
			activePlayer.player.spirits.push({
				slotIndex,
				id: spirit.id,
				name: spirit.name,
				cost: spirit.cost,
				classes: spirit.classes,
				origins: spirit.origins,
				isFaceDown: false
			});
			activePlayer.player.spirits.sort((a, b) => a.slotIndex - b.slotIndex);

			marketSlot.spiritId = null;
			refillSingleMarketSlot(state, command.marketIndex);
			return success(state);
		}

		case 'selectNavigationDestination': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) {
				return failure('seat_required', 'Only seated players can select a destination.');
			}
			if (!SPIRIT_WORLD_LOCATIONS.includes(command.destination as (typeof SPIRIT_WORLD_LOCATIONS)[number])) {
				return failure('destination_invalid', `${command.destination} is not a valid Spirit World location.`);
			}

			activePlayer.player.navigationDestination = command.destination;
			return success(state);
		}

		case 'refillMarket': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}
			refillEmptyMarketSlots(state);
			return success(state);
		}

		case 'spawnDiceBatch': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can spawn dice.');

			const die = findCatalogDie(catalog, command.diceId);
			if (!die) {
				return failure('dice_missing', `Dice ${command.diceId} was not found.`);
			}

			const count = Math.max(0, Math.min(12, Math.floor(command.count)));
			if (count <= 0) {
				return failure('dice_count_invalid', 'Spawn at least one die.');
			}

			for (let index = 0; index < count; index += 1) {
				const position = nextDicePosition(activePlayer.player.spawnedDice.length);
				activePlayer.player.spawnedDice.push({
					instanceId: createInstanceId('die'),
					diceId: die.id,
					name: die.name,
					diceType: die.diceType,
					localX: position.x,
					localZ: position.z,
					...createDieRoll(die.diceType)
				});
			}

			return success(state);
		}

		case 'rollSpawnedDice': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can roll dice.');

			for (const die of activePlayer.player.spawnedDice) {
				Object.assign(die, createDieRoll(die.diceType));
			}

			return success(state);
		}

		case 'clearSpawnedDice': {
			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can clear dice.');
			activePlayer.player.spawnedDice = [];
			return success(state);
		}

		case 'spawnMatItem': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can spawn items.');

			const rune = findCatalogRune(catalog, command.runeId);
			if (!rune) {
				return failure('item_missing', `Item ${command.runeId} was not found.`);
			}

			const position = nextMatItemPosition(activePlayer.player.spawnedItems.length);
			activePlayer.player.spawnedItems.push({
				instanceId: createInstanceId('item'),
				runeId: rune.id,
				name: rune.name,
				kind: rune.kind,
				localX: position.x,
				localZ: position.z
			});
			return success(state);
		}

		case 'clearSpawnedItems': {
			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can clear items.');
			activePlayer.player.spawnedItems = [];
			return success(state);
		}

		case 'moveMatObject': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can move mat objects.');

			if (command.objectType === 'die') {
				const target = activePlayer.player.spawnedDice.find((entry) => entry.instanceId === command.instanceId);
				if (!target) return failure('object_missing', 'That die no longer exists.');
				target.localX = command.localX;
				target.localZ = command.localZ;
				return success(state);
			}

			const target = activePlayer.player.spawnedItems.find((entry) => entry.instanceId === command.instanceId);
			if (!target) return failure('object_missing', 'That item no longer exists.');
			target.localX = command.localX;
			target.localZ = command.localZ;
			return success(state);
		}

		case 'adjustBarrier': {
			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can adjust barrier.');
			activePlayer.player.barrier = Math.max(0, activePlayer.player.barrier + command.amount);
			activePlayer.player.maxTokens = Math.max(activePlayer.player.maxTokens, activePlayer.player.blood + activePlayer.player.barrier);
			return success(state);
		}

		case 'adjustBlood': {
			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can adjust blood.');
			activePlayer.player.blood = Math.max(0, activePlayer.player.blood + command.amount);
			activePlayer.player.maxTokens = Math.max(activePlayer.player.maxTokens, activePlayer.player.blood + activePlayer.player.barrier);
			return success(state);
		}

		case 'adjustMaxTokens': {
			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can adjust potential.');
			activePlayer.player.maxTokens = Math.max(0, Math.min(10, activePlayer.player.maxTokens + command.amount));
			syncBarrierFromBlood(activePlayer.player);
			return success(state);
		}

		case 'adjustStatus': {
			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can adjust status.');
			activePlayer.player.statusLevel = Math.max(0, activePlayer.player.statusLevel + command.amount);
			return success(state);
		}

		case 'flipSpirit': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) {
				return failure('seat_required', 'Only seated players can flip spirits.');
			}

			const spirit = activePlayer.player.spirits.find((entry) => entry.slotIndex === command.slotIndex);
			if (!spirit) {
				return failure('spirit_missing', 'No spirit exists in that slot.');
			}

			spirit.isFaceDown = !spirit.isFaceDown;
			return success(state);
		}

		case 'flipPotentialToken': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}

			const activePlayer = activePlayerForActor(state, actor);
			if (!activePlayer) return failure('seat_required', 'Only seated players can flip potential tokens.');

			const slotIndex = Math.max(1, Math.min(activePlayer.player.maxTokens, Math.floor(command.slotIndex)));
			const currentBloodStart = activePlayer.player.maxTokens - activePlayer.player.blood + 1;
			const isCurrentlyBlood = activePlayer.player.blood > 0 && slotIndex >= currentBloodStart;

			if (isCurrentlyBlood) {
				activePlayer.player.blood = Math.max(0, activePlayer.player.maxTokens - slotIndex);
			} else {
				activePlayer.player.blood = Math.max(
					activePlayer.player.blood,
					activePlayer.player.maxTokens - slotIndex + 1
				);
			}

			syncBarrierFromBlood(activePlayer.player);
			return success(state);
		}

		case 'commitRound': {
			if (state.status !== 'active') {
				return failure('inactive', 'The game has not started yet.');
			}
			for (const seatColor of state.activeSeats) {
				if (!state.players[seatColor]?.navigationDestination) {
					return failure('destination_missing', `Seat ${seatColor} has not selected a destination.`);
				}
			}
			for (const seatColor of state.activeSeats) {
				const player = state.players[seatColor];
				if (player) player.navigationDestination = null;
			}
			state.round += 1;
			return success(state);
		}

		default:
			return failure('unsupported_command', `${command.type} is not implemented yet.`);
	}
}

export function buildSessionProjection(
	state: PublicGameState,
	viewer: SpectatorProjection['viewer']
): SpectatorProjection {
	const players: Partial<Record<SeatColor, PlayerProjection>> = {};

	for (const seatColor of state.activeSeats) {
		const player = state.players[seatColor];
		if (!player) continue;
		ensurePlayerCollections(player);

		players[seatColor] = {
			...player,
			handDraws: viewer.seatColor === seatColor ? player.handDraws : [],
			pendingDraw: viewer.seatColor === seatColor ? player.pendingDraw : null
		};
	}

	return {
		roomCode: state.roomCode,
		revision: state.revision,
		status: state.status,
		gameId: state.gameId,
		round: state.round,
		guardianPool: [...state.guardianPool],
		viewer,
		seats: structuredClone(state.seats),
		activeSeats: [...state.activeSeats],
		market: state.market.map((slot) => ({ ...slot })),
		players,
		bagCounts: {
			hexSpirits: state.bags.hexSpirits.count,
			monsters: state.bags.monsters.count,
			abyssFallen: state.bags.abyssFallen.count,
			stageDeck: state.bags.stageDeck.count
		}
	};
}

export function buildHistorySnapshotRows(
	state: PublicGameState,
	timestamp: string
): HistorySnapshotRow[] {
	if (!state.gameId) {
		return [];
	}

	return [...state.activeSeats]
		.sort((a, b) => a.localeCompare(b))
		.map((seatColor) => {
			const player = state.players[seatColor];
			if (!player) {
				throw new Error(`Missing player state for seat ${seatColor}`);
			}

			return {
				game_id: state.gameId!,
				navigation_count: state.round,
				game_timestamp: timestamp,
				player_color: seatColor,
				tts_username: player.displayName,
				navigation_destination: player.navigationDestination,
				selected_character: player.selectedGuardian,
				blood: player.blood,
				victory_points: player.victoryPoints,
				barrier: player.barrier,
				max_tokens: player.maxTokens,
				status_level: player.statusLevel,
				status_token: player.statusToken,
				spirits: player.spirits,
				runes: player.runes,
				spirit_rune_attachments: player.spiritRuneAttachments,
				hand_draws: player.handDraws,
				bags: state.bags.history,
				scenario: state.scenario
			};
		});
}
