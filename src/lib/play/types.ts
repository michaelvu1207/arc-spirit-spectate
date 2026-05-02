import type { BagsData, HandDrawSnapshot, RuneSlotSnapshot, SpiritRuneAttachmentSnapshot } from '$lib/types';

export const SEAT_COLORS = ['Red', 'Blue', 'Orange', 'Green', 'Purple', 'Yellow'] as const;
export const SPIRIT_WORLD_LOCATIONS = [
	'Floral Patch',
	'Cyber City',
	'Tidal Cove',
	'Lantern Canyon',
	'Arcane Abyss'
] as const;

export type SeatColor = (typeof SEAT_COLORS)[number];
export type SpiritWorldLocation = (typeof SPIRIT_WORLD_LOCATIONS)[number];
export type GameSessionStatus = 'lobby' | 'active' | 'finished';
export type MemberRole = 'host' | 'player' | 'spectator';
export type SpiritSourceBag = 'Spirit World Bag' | 'Arcane Abyss Bag';
export type DiceType = 'attack' | 'special' | 'defense';
export type MatItemKind = 'rune' | 'augment' | 'relic';

export interface GameActor {
	memberId: string;
	displayName: string;
	role: MemberRole;
	seatColor: SeatColor | null;
}

export interface PlayCatalogGuardian {
	id: string;
	name: string;
	originId: string | null;
}

export interface PlayCatalogSpirit {
	id: string;
	name: string;
	cost: number;
	classes: Record<string, number>;
	origins: Record<string, number>;
}

export interface PlayCatalogRune {
	id: string;
	name: string;
	kind: MatItemKind;
	originId: string | null;
	classId: string | null;
}

export interface PlayCatalogDie {
	id: string;
	name: string;
	diceType: DiceType;
}

export interface PlayCatalog {
	guardians: PlayCatalogGuardian[];
	spirits: PlayCatalogSpirit[];
	runes: PlayCatalogRune[];
	dice: PlayCatalogDie[];
}

export interface PlaySpirit {
	slotIndex: number;
	id: string;
	name: string;
	cost: number;
	classes: Record<string, number>;
	origins: Record<string, number>;
	isFaceDown: boolean;
}

export interface PendingDrawState {
	sourceBag: SpiritSourceBag;
	drawCount: number;
	summonLimit: number;
	summonedCount: number;
}

export interface PlayDie {
	instanceId: string;
	diceId: string;
	name: string;
	diceType: DiceType;
	localX: number;
	localZ: number;
	faceIndex: number;
	rollRotation: {
		x: number;
		y: number;
		z: number;
	};
}

export interface PlayMatItem {
	instanceId: string;
	runeId: string;
	name: string;
	kind: MatItemKind;
	localX: number;
	localZ: number;
}

export interface LobbySeatState {
	seatColor: SeatColor;
	memberId: string | null;
	displayName: string | null;
	selectedGuardian: string | null;
}

export interface MarketSlotState {
	index: number;
	spiritId: string | null;
}

export interface RuntimeBagEntry {
	name: string;
	guid: string;
	id?: string;
	cost?: number;
	state?: string;
	barrier?: number;
	damage?: number;
}

export interface RuntimeBagSnapshot {
	count: number;
	contents: RuntimeBagEntry[];
}

export interface RuntimeBagsState {
	hexSpirits: RuntimeBagSnapshot;
	monsters: RuntimeBagSnapshot;
	abyssFallen: RuntimeBagSnapshot;
	stageDeck: RuntimeBagSnapshot;
	purgeBags: [];
	history: BagsData;
}

export interface PrivatePlayerState {
	playerColor: SeatColor;
	displayName: string | null;
	selectedGuardian: string;
	navigationDestination: string | null;
	blood: number;
	victoryPoints: number;
	barrier: number;
	maxTokens: number;
	statusLevel: number;
	statusToken: string | null;
	spirits: PlaySpirit[];
	runes: RuneSlotSnapshot[];
	handDraws: HandDrawSnapshot[];
	pendingDraw: PendingDrawState | null;
	spawnedDice: PlayDie[];
	spawnedItems: PlayMatItem[];
	spiritRuneAttachments: SpiritRuneAttachmentSnapshot[];
}

export interface PublicGameState {
	roomCode: string;
	revision: number;
	status: GameSessionStatus;
	gameId: string | null;
	scenario: string | { id?: string; name?: string; requested?: string | null } | null;
	round: number;
	guardianPool: string[];
	seats: Record<SeatColor, LobbySeatState>;
	activeSeats: SeatColor[];
	players: Partial<Record<SeatColor, PrivatePlayerState>>;
	market: MarketSlotState[];
	bags: RuntimeBagsState;
}

export interface PlayerProjection extends Omit<PrivatePlayerState, 'displayName'> {
	displayName: string | null;
	handDraws: HandDrawSnapshot[];
}

export interface SpectatorProjection {
	roomCode: string;
	revision: number;
	status: GameSessionStatus;
	gameId: string | null;
	round: number;
	guardianPool: string[];
	viewer: {
		role: MemberRole;
		seatColor: SeatColor | null;
		displayName: string | null;
	};
	seats: Record<SeatColor, LobbySeatState>;
	activeSeats: SeatColor[];
	market: MarketSlotState[];
	players: Partial<Record<SeatColor, PlayerProjection>>;
	bagCounts: {
		hexSpirits: number;
		monsters: number;
		abyssFallen: number;
		stageDeck: number;
	};
}

export interface HistorySnapshotRow {
	game_id: string;
	navigation_count: number;
	game_timestamp: string;
	player_color: SeatColor;
	tts_username: string | null;
	navigation_destination: string | null;
	selected_character: string;
	blood: number;
	victory_points: number;
	barrier: number;
	max_tokens: number;
	status_level: number;
	status_token: string | null;
	spirits: PlaySpirit[];
	runes: RuneSlotSnapshot[];
	spirit_rune_attachments: SpiritRuneAttachmentSnapshot[];
	hand_draws: HandDrawSnapshot[];
	bags: BagsData;
	scenario: PublicGameState['scenario'];
}

export type GameCommand =
	| { type: 'claimSeat'; seatColor: SeatColor }
	| { type: 'releaseSeat'; seatColor?: SeatColor }
	| { type: 'selectGuardian'; guardianName: string }
	| { type: 'startGame' }
	| { type: 'selectNavigationDestination'; destination: string }
	| { type: 'refillMarket' }
	| { type: 'drawSpiritWorld' }
	| { type: 'drawArcaneAbyss' }
	| { type: 'spawnHandSpirit'; guid: string; slotIndex?: number }
	| { type: 'discardHandDraws' }
	| { type: 'flipSpirit'; slotIndex: number }
	| { type: 'spawnDiceBatch'; diceId: string; count: number }
	| { type: 'rollSpawnedDice' }
	| { type: 'clearSpawnedDice' }
	| { type: 'spawnMatItem'; runeId: string }
	| { type: 'clearSpawnedItems' }
	| { type: 'moveMatObject'; objectType: 'die' | 'item'; instanceId: string; localX: number; localZ: number }
	| { type: 'flipPotentialToken'; slotIndex: number }
	| { type: 'adjustMaxTokens'; amount: number }
	| { type: 'takeSpirit'; marketIndex: number; slotIndex?: number }
	| { type: 'replaceSpirit'; marketIndex: number; slotIndex: number }
	| { type: 'absorbSpirit'; slotIndex: number }
	| { type: 'moveRuneToSlot'; runeId: string; slotIndex: number }
	| { type: 'attachRuneToSpirit'; runeId: string; spiritSlotIndex: number }
	| { type: 'detachRuneFromSpirit'; runeId: string; spiritSlotIndex: number }
	| { type: 'adjustBarrier'; amount: number }
	| { type: 'adjustBlood'; amount: number }
	| { type: 'adjustStatus'; amount: number }
	| { type: 'commitRound' };

export type CommandResult =
	| { ok: true; state: PublicGameState }
	| {
			ok: false;
			error: {
				code: string;
				message: string;
			};
	  };
