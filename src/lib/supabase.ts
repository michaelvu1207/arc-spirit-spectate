/**
 * Supabase client for Arc Spirits Spectate app
 * Configured with realtime support for live game updates
 */

import {
	createClient,
	type RealtimeChannel,
	type RealtimePostgresChangesPayload
} from '@supabase/supabase-js';
import type {
	BagsData,
	CharacterOccurrenceRow,
	CharacterStatsRow,
	ClassTrait,
	CompositionTagOccurrenceRow,
	CompositionTagStatsRow,
	GameNotes,
	GameSnapshot,
	GameSnapshotRow,
	GameSummaryRow,
	GameResultRow,
	FavoriteSpiritEntry,
	GuardianAsset,
	HandDrawSnapshot,
	HexSpiritAsset,
	IconPoolEntry,
	LeaderboardEntryRow,
	RatingLeaderboardRow,
	MonsterAsset,
	OriginTrait,
	PlayerFeedback,
	PlayerBarrierTotalsRow,
	PlayerBloodTotalsRow,
	PlayerFavoriteSpiritsRow,
	PlayerStatsRow,
	RuneAsset,
	RuneSlotSnapshot,
	SpiritRuneAttachmentSnapshot,
	Spirit,
	TraitOccurrenceRow,
	TraitStatsRow
} from './types';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Schema names
export const SCHEMA = 'arc-spirits-game-history'; // Game state data
export const ASSETS_SCHEMA = 'arc-spirits-rev2'; // Static assets (spirits, guardians, etc.)

// Export the Supabase URL for use in other modules
export const SUPABASE_URL = PUBLIC_SUPABASE_URL;

// Supabase storage bucket base URL (bucket is 'game_assets')
export const STORAGE_BASE_URL = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/game_assets`;

// Table names
export const TABLES = {
	GAME_STATE_SNAPSHOTS: 'game_state_snapshots',
	GAME_NOTES: 'game_notes',
	PLAYER_FEEDBACK: 'player_feedback',
	VERIFIED_GAMES: 'verified_games',
	GAME_SUMMARIES: 'game_summaries',
	GAME_RESULTS_ALL: 'game_results_all',
	GAME_RESULTS_VERIFIED: 'game_results_verified',
	LEADERBOARD_ENTRIES_VERIFIED: 'leaderboard_entries_verified',
	PLAYER_RATINGS_LEADERBOARD: 'player_ratings_leaderboard',
	PLAYER_MATCH_RESULTS: 'player_match_results',
	PLAYER_STATS_VERIFIED: 'player_stats_verified',
	PLAYER_FAVORITE_SPIRITS_VERIFIED: 'player_favorite_spirits_verified',
	PLAYER_FAVORITE_SPIRITS_BY_KEY: 'player_favorite_spirits_by_key',
	PLAYER_BARRIER_TOTALS_VERIFIED: 'player_barrier_totals_verified',
	PLAYER_BARRIER_TOTALS_BY_KEY: 'player_barrier_totals_by_key',
	PLAYER_BLOOD_TOTALS_VERIFIED: 'player_blood_totals_verified',
	PLAYER_BLOOD_TOTALS_BY_KEY: 'player_blood_totals_by_key',
	COMPOSITION_TAG_STATS_VERIFIED: 'composition_tag_stats_verified',
	COMPOSITION_TAG_OCCURRENCES_VERIFIED: 'composition_tag_occurrences_verified',
	CHARACTER_STATS_VERIFIED: 'character_stats_verified',
	CHARACTER_OCCURRENCES_VERIFIED: 'character_occurrences_verified',
	TRAIT_STATS_VERIFIED: 'trait_stats_exact_verified',
	TRAIT_OCCURRENCES_VERIFIED: 'trait_occurrences_verified',
	HEX_SPIRITS: 'hex_spirits',
	RUNES: 'runes',
	MONSTERS: 'monsters',
	GUARDIANS: 'guardians',
	CLASSES: 'classes',
	ORIGINS: 'origins',
	ICON_POOL: 'icon_pool'
} as const;

// Create the Supabase client for game state (arc-spirits-game-history schema)
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
	db: {
		schema: SCHEMA
	},
	realtime: {
		params: {
			eventsPerSecond: 10
		}
	},
	auth: {
		persistSession: false // No auth needed for spectator app
	}
});

// Create a separate client for static assets (arc-spirits-rev2 schema)
export const supabaseAssets = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
	db: {
		schema: ASSETS_SCHEMA
	},
	auth: {
		persistSession: false
	}
});

// Store active channels for cleanup
const activeChannels = new Map<string, RealtimeChannel>();

function parseJsonValue<T>(value: string | T | null): T | null {
	if (value == null) return null;
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function parseJsonWithFallback<T>(value: string | T | null, fallback: T): T {
	return parseJsonValue<T>(value) ?? fallback;
}

// Payload type for realtime postgres changes
export type RealtimePayload = RealtimePostgresChangesPayload<GameSnapshotRow>;

// Helper to subscribe to game state changes
export function subscribeToGame(
	gameId: string,
	onInsert: (payload: RealtimePayload) => void,
	onUpdate?: (payload: RealtimePayload) => void
): RealtimeChannel {
	// Unsubscribe from existing channel if present
	unsubscribeFromGame(gameId);

	const channelName = `game:${gameId}`;
	const channel = supabase.channel(channelName);

	// Listen for INSERT events (new snapshots)
	channel.on(
		'postgres_changes',
		{
			event: 'INSERT',
			schema: SCHEMA,
			table: TABLES.GAME_STATE_SNAPSHOTS,
			filter: `game_id=eq.${gameId}`
		},
		(payload) => {
			console.log('[Realtime] INSERT received:', payload);
			onInsert(payload as RealtimePayload);
		}
	);

	// Listen for UPDATE events (modified snapshots)
	if (onUpdate) {
		channel.on(
			'postgres_changes',
			{
				event: 'UPDATE',
				schema: SCHEMA,
				table: TABLES.GAME_STATE_SNAPSHOTS,
				filter: `game_id=eq.${gameId}`
			},
			(payload) => {
				console.log('[Realtime] UPDATE received:', payload);
				onUpdate(payload as RealtimePayload);
			}
		);
	}

	// Subscribe and track the channel
	channel.subscribe((status) => {
		console.log(`[Realtime] Channel ${channelName} status:`, status);
		if (status === 'SUBSCRIBED') {
			console.log(`[Realtime] Successfully subscribed to game ${gameId}`);
		}
	});

	activeChannels.set(gameId, channel);

	return channel;
}

// Helper to unsubscribe from a game channel
export function unsubscribeFromGame(gameId: string): void {
	const channel = activeChannels.get(gameId);
	if (channel) {
		console.log(`[Realtime] Unsubscribing from game ${gameId}`);
		supabase.removeChannel(channel);
		activeChannels.delete(gameId);
	}
}

// Cleanup all active channels
export function unsubscribeAll(): void {
	for (const [gameId, channel] of activeChannels) {
		console.log(`[Realtime] Unsubscribing from game ${gameId}`);
		supabase.removeChannel(channel);
	}
	activeChannels.clear();
}

// ============ Game Snapshot Functions ============

export function unwrapGameSnapshotRow(row: GameSnapshotRow): GameSnapshot {
	return {
		id: row.id,
		game_id: row.game_id,
		navigation_count: row.navigation_count,
		game_timestamp: row.game_timestamp,
		scenario: parseJsonWithFallback<GameSnapshot['scenario']>(row.scenario, null),
		player_color: row.player_color,
		selected_character: row.selected_character,
		blood: row.blood,
		victory_points: row.victory_points,
		barrier: row.barrier,
		max_tokens: row.max_tokens ?? 4,
		status_level: row.status_level,
		status_token: row.status_token,
		spirits: parseJsonWithFallback<Spirit[]>(row.spirits, []),
		runes: parseJsonWithFallback<RuneSlotSnapshot[]>(row.runes, []),
		hand_draws: parseJsonWithFallback<HandDrawSnapshot[]>(row.hand_draws, []),
		bags: parseJsonWithFallback<BagsData>(row.bags, {}),
		tts_username: row.tts_username ?? null,
		navigation_destination: row.navigation_destination ?? null,
		spirit_rune_attachments: parseJsonWithFallback<SpiritRuneAttachmentSnapshot[]>(
			row.spirit_rune_attachments,
			[]
		),
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

export async function fetchGameSnapshotsForRound(
	gameId: string,
	navCount: number
): Promise<GameSnapshot[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_STATE_SNAPSHOTS)
		.select('*')
		.eq('game_id', gameId)
		.eq('navigation_count', navCount)
		.order('player_color');

	if (fetchError) {
		throw new Error(`Failed to fetch snapshots: ${fetchError.message}`);
	}

	return ((data as GameSnapshotRow[] | null) ?? []).map(unwrapGameSnapshotRow);
}

export async function fetchMaxNavigationCount(gameId: string): Promise<number> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_STATE_SNAPSHOTS)
		.select('navigation_count')
		.eq('game_id', gameId)
		.order('navigation_count', { ascending: false })
		.limit(1)
		.single();

	if (fetchError) {
		// No rows found is not an error, just return 0
		if (fetchError.code === 'PGRST116') {
			return 0;
		}
		throw new Error(`Failed to fetch max navigation: ${fetchError.message}`);
	}

	return data?.navigation_count ?? 0;
}

export async function fetchAllGameSnapshots(gameId: string): Promise<GameSnapshot[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_STATE_SNAPSHOTS)
		.select('*')
		.eq('game_id', gameId)
		.order('navigation_count')
		.order('player_color');

	if (fetchError) {
		throw new Error(`Failed to fetch game snapshots: ${fetchError.message}`);
	}

	return ((data as GameSnapshotRow[] | null) ?? []).map(unwrapGameSnapshotRow);
}

export type GameListSnapshotRow = Pick<
	GameSnapshotRow,
	| 'game_id'
	| 'game_timestamp'
	| 'navigation_count'
	| 'player_color'
	| 'selected_character'
	| 'victory_points'
	| 'created_at'
>;

export async function fetchGameListSnapshotRows(): Promise<GameListSnapshotRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_STATE_SNAPSHOTS)
		.select(
			'game_id, game_timestamp, navigation_count, player_color, selected_character, victory_points, created_at'
		)
		.order('created_at', { ascending: false });

	if (fetchError) {
		throw new Error(`Failed to fetch game list snapshots: ${fetchError.message}`);
	}

	return (data as GameListSnapshotRow[] | null) ?? [];
}

export type LeaderboardSnapshotRow = Pick<
	GameSnapshotRow,
	| 'game_id'
	| 'tts_username'
	| 'player_color'
	| 'selected_character'
	| 'victory_points'
	| 'navigation_count'
	| 'created_at'
>;

export async function fetchLeaderboardSnapshotRows(): Promise<LeaderboardSnapshotRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_STATE_SNAPSHOTS)
		.select(
			'game_id, tts_username, player_color, selected_character, victory_points, navigation_count, created_at'
		);

	if (fetchError) {
		throw new Error(`Failed to fetch leaderboard snapshots: ${fetchError.message}`);
	}

	return (data as LeaderboardSnapshotRow[] | null) ?? [];
}

export async function fetchGameSummaries(): Promise<GameSummaryRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_SUMMARIES)
		.select(
			'game_id, verified, verified_at, verified_by, started_at, ended_at, navigation_count, player_count, avg_navigation_ms, winner_guardian, winner_vp'
		)
		.order('ended_at', { ascending: false });

	if (fetchError) {
		throw new Error(`Failed to fetch game summaries: ${fetchError.message}`);
	}

	return (data as GameSummaryRow[] | null) ?? [];
}

export async function fetchLeaderboardEntriesVerified(): Promise<LeaderboardEntryRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.LEADERBOARD_ENTRIES_VERIFIED)
		.select('username, games_played, avg_points, avg_placement, last_games');

	if (fetchError) {
		throw new Error(`Failed to fetch leaderboard: ${fetchError.message}`);
	}

	return (data as LeaderboardEntryRow[] | null) ?? [];
}

export async function fetchRatingLeaderboard(): Promise<RatingLeaderboardRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_RATINGS_LEADERBOARD)
		.select(
			'username, username_key, games_played, wins, win_rate, avg_victory_points, avg_placement, mu, sigma, ordinal, last_game_at, last_games'
		);

	if (fetchError) {
		throw new Error(`Failed to fetch rating leaderboard: ${fetchError.message}`);
	}

	return (data as RatingLeaderboardRow[] | null) ?? [];
}

export async function fetchRatingLeaderboardByUsernameKey(
	usernameKey: string
): Promise<RatingLeaderboardRow | null> {
	const normalized = usernameKey.trim().toLowerCase();
	if (!normalized) return null;

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_RATINGS_LEADERBOARD)
		.select(
			'username, username_key, games_played, wins, win_rate, avg_victory_points, avg_placement, mu, sigma, ordinal, last_game_at, last_games'
		)
		.eq('username_key', normalized)
		.limit(1)
		.maybeSingle();

	if (fetchError) {
		throw new Error(`Failed to fetch rating profile: ${fetchError.message}`);
	}

	return (data as RatingLeaderboardRow | null) ?? null;
}

export async function fetchPlayerMatchResultsByUsernameKey(usernameKey: string): Promise<GameResultRow[]> {
	const normalized = usernameKey.trim().toLowerCase();
	if (!normalized) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_MATCH_RESULTS)
		.select(
			'game_id, verified, started_at, ended_at, navigation_count, player_color, username, raw_username, selected_character, victory_points, placement, player_count'
		)
		.eq('username_key', normalized)
		.order('ended_at', { ascending: false, nullsFirst: false })
		.order('game_id', { ascending: false });

	if (fetchError) {
		throw new Error(`Failed to fetch player matches: ${fetchError.message}`);
	}

	return (data as GameResultRow[] | null) ?? [];
}

export async function fetchPlayerFavoriteSpiritsByUsernameKey(
	usernameKey: string
): Promise<FavoriteSpiritEntry[]> {
	const normalized = usernameKey.trim().toLowerCase();
	if (!normalized) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_FAVORITE_SPIRITS_BY_KEY)
		.select('favorites')
		.eq('username_key', normalized)
		.limit(1)
		.maybeSingle();

	if (fetchError) {
		throw new Error(`Failed to fetch favorite spirits: ${fetchError.message}`);
	}

	const favoritesRaw = (data as Pick<PlayerFavoriteSpiritsRow, 'favorites'> | null)?.favorites ?? [];
	return parseJsonWithFallback<FavoriteSpiritEntry[]>(favoritesRaw, []);
}

export async function fetchPlayerBarrierTotalsByUsernameKey(
	usernameKey: string
): Promise<{ gained: number; lost: number } | null> {
	const normalized = usernameKey.trim().toLowerCase();
	if (!normalized) return null;

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_BARRIER_TOTALS_BY_KEY)
		.select('barrier_gained, barrier_lost')
		.eq('username_key', normalized)
		.limit(1)
		.maybeSingle();

	if (fetchError) {
		throw new Error(`Failed to fetch barrier totals: ${fetchError.message}`);
	}

	const row = (data as Omit<PlayerBarrierTotalsRow, 'username'> | null) ?? null;
	if (!row) return null;

	return {
		gained: Number(row.barrier_gained ?? 0),
		lost: Number(row.barrier_lost ?? 0)
	};
}

export async function fetchPlayerBloodTotalsByUsernameKey(
	usernameKey: string
): Promise<{ gained: number; spent: number } | null> {
	const normalized = usernameKey.trim().toLowerCase();
	if (!normalized) return null;

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_BLOOD_TOTALS_BY_KEY)
		.select('blood_gained, blood_spent')
		.eq('username_key', normalized)
		.limit(1)
		.maybeSingle();

	if (fetchError) {
		throw new Error(`Failed to fetch blood totals: ${fetchError.message}`);
	}

	const row = (data as Omit<PlayerBloodTotalsRow, 'username'> | null) ?? null;
	if (!row) return null;

	return {
		gained: Number(row.blood_gained ?? 0),
		spent: Number(row.blood_spent ?? 0)
	};
}

export async function fetchPlayerStatsVerified(): Promise<PlayerStatsRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_STATS_VERIFIED)
		.select(
			'username, games_played, wins, win_rate, avg_victory_points, avg_placement, best_victory_points, best_placement, first_game_at, last_game_at'
		);

	if (fetchError) {
		throw new Error(`Failed to fetch player stats: ${fetchError.message}`);
	}

	return (data as PlayerStatsRow[] | null) ?? [];
}

export async function fetchPlayerStatsVerifiedByUsername(
	username: string
): Promise<PlayerStatsRow | null> {
	const normalized = username.trim();
	if (!normalized) return null;

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_STATS_VERIFIED)
		.select(
			'username, games_played, wins, win_rate, avg_victory_points, avg_placement, best_victory_points, best_placement, first_game_at, last_game_at'
		)
		.eq('username', normalized)
		.limit(1);

	if (fetchError) {
		throw new Error(`Failed to fetch player stats: ${fetchError.message}`);
	}

	return (data as PlayerStatsRow[] | null)?.[0] ?? null;
}

export async function fetchGameResultsVerifiedForUsername(
	username: string
): Promise<GameResultRow[]> {
	const normalized = username.trim();
	if (!normalized) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.GAME_RESULTS_VERIFIED)
		.select(
			'game_id, verified, started_at, ended_at, navigation_count, player_color, username, raw_username, selected_character, victory_points, placement, player_count'
		)
		.eq('username', normalized)
		.order('ended_at', { ascending: false });

	if (fetchError) {
		throw new Error(`Failed to fetch player games: ${fetchError.message}`);
	}

	return (data as GameResultRow[] | null) ?? [];
}

export async function fetchPlayerFavoriteSpiritsVerified(
	username: string
): Promise<FavoriteSpiritEntry[]> {
	const normalized = username.trim();
	if (!normalized) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_FAVORITE_SPIRITS_VERIFIED)
		.select('username, favorites')
		.eq('username', normalized)
		.limit(1);

	if (fetchError) {
		throw new Error(`Failed to fetch favorite spirits: ${fetchError.message}`);
	}

	const row = (data as PlayerFavoriteSpiritsRow[] | null)?.[0] ?? null;
	const favoritesRaw = row?.favorites ?? [];
	return parseJsonWithFallback<FavoriteSpiritEntry[]>(favoritesRaw, []);
}

export async function fetchPlayerBarrierTotalsVerified(
	username: string
): Promise<{ gained: number; lost: number } | null> {
	const normalized = username.trim();
	if (!normalized) return null;

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_BARRIER_TOTALS_VERIFIED)
		.select('username, barrier_gained, barrier_lost')
		.eq('username', normalized)
		.limit(1);

	if (fetchError) {
		throw new Error(`Failed to fetch barrier totals: ${fetchError.message}`);
	}

	const row = (data as PlayerBarrierTotalsRow[] | null)?.[0] ?? null;
	if (!row) return null;

	return {
		gained: Number(row.barrier_gained ?? 0),
		lost: Number(row.barrier_lost ?? 0)
	};
}

export async function fetchPlayerBloodTotalsVerified(
	username: string
): Promise<{ gained: number; spent: number } | null> {
	const normalized = username.trim();
	if (!normalized) return null;

	const { data, error: fetchError } = await supabase
		.from(TABLES.PLAYER_BLOOD_TOTALS_VERIFIED)
		.select('username, blood_gained, blood_spent')
		.eq('username', normalized)
		.limit(1);

	if (fetchError) {
		throw new Error(`Failed to fetch blood totals: ${fetchError.message}`);
	}

	const row = (data as PlayerBloodTotalsRow[] | null)?.[0] ?? null;
	if (!row) return null;

	return {
		gained: Number(row.blood_gained ?? 0),
		spent: Number(row.blood_spent ?? 0)
	};
}

export async function fetchCompositionTagStatsVerified(): Promise<CompositionTagStatsRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.COMPOSITION_TAG_STATS_VERIFIED)
		.select('tag, tagged_players, games, avg_victory_points, avg_placement');

	if (fetchError) {
		throw new Error(`Failed to fetch tag stats: ${fetchError.message}`);
	}

	return (data as CompositionTagStatsRow[] | null) ?? [];
}

export async function fetchCompositionTagOccurrencesVerified(params: {
	tag: string;
	limit?: number;
}): Promise<CompositionTagOccurrenceRow[]> {
	const tag = params.tag.trim().toLowerCase().replace(/\s+/g, ' ');
	if (!tag) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.COMPOSITION_TAG_OCCURRENCES_VERIFIED)
		.select(
			'tag, game_id, player_color, username, raw_username, selected_character, victory_points, placement, player_count, navigation_count, ended_at'
		)
		.eq('tag', tag)
		.order('ended_at', { ascending: false, nullsFirst: false })
		.order('game_id', { ascending: false })
		.limit(params.limit ?? 25);

	if (fetchError) {
		throw new Error(`Failed to fetch tag games: ${fetchError.message}`);
	}

	return (data as CompositionTagOccurrenceRow[] | null) ?? [];
}

export async function fetchCharacterStatsVerified(): Promise<CharacterStatsRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.CHARACTER_STATS_VERIFIED)
		.select('character, games_played, wins, avg_victory_points, avg_placement');

	if (fetchError) {
		throw new Error(`Failed to fetch character stats: ${fetchError.message}`);
	}

	return (data as CharacterStatsRow[] | null) ?? [];
}

export async function fetchCharacterOccurrencesVerified(params: {
	character: string;
	limit?: number;
}): Promise<CharacterOccurrenceRow[]> {
	const character = params.character.trim();
	if (!character) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.CHARACTER_OCCURRENCES_VERIFIED)
		.select(
			'character, game_id, player_color, username, raw_username, victory_points, placement, player_count, navigation_count, ended_at'
		)
		.eq('character', character)
		.order('ended_at', { ascending: false, nullsFirst: false })
		.order('game_id', { ascending: false })
		.limit(params.limit ?? 25);

	if (fetchError) {
		throw new Error(`Failed to fetch character games: ${fetchError.message}`);
	}

	return (data as CharacterOccurrenceRow[] | null) ?? [];
}

export async function fetchTraitStatsVerified(): Promise<TraitStatsRow[]> {
	const { data, error: fetchError } = await supabase
		.from(TABLES.TRAIT_STATS_VERIFIED)
		.select(
			'trait_type, trait_key, trait_name, trait_count, players, games, avg_victory_points, avg_placement, wins, example_game_id, example_player_color, example_round'
		);

	if (fetchError) {
		throw new Error(`Failed to fetch trait stats: ${fetchError.message}`);
	}

	return (data as TraitStatsRow[] | null) ?? [];
}

export async function fetchTraitOccurrencesVerified(params: {
	traitType: 'class' | 'origin';
	traitKey: string;
	traitCount: number;
	limit?: number;
}): Promise<TraitOccurrenceRow[]> {
	const traitKey = params.traitKey.trim().toLowerCase();
	const traitCount = params.traitCount;
	if (!traitKey) return [];
	if (!Number.isFinite(traitCount) || traitCount <= 0) return [];

	const { data, error: fetchError } = await supabase
		.from(TABLES.TRAIT_OCCURRENCES_VERIFIED)
		.select(
			'trait_type, trait_key, trait_name, trait_count, game_id, player_color, username, raw_username, selected_character, victory_points, placement, player_count, navigation_count, ended_at'
		)
		.eq('trait_type', params.traitType)
		.eq('trait_key', traitKey)
		.eq('trait_count', traitCount)
		.order('ended_at', { ascending: false, nullsFirst: false })
		.order('game_id', { ascending: false })
		.limit(params.limit ?? 25);

	if (fetchError) {
		throw new Error(`Failed to fetch trait games: ${fetchError.message}`);
	}

	return (data as TraitOccurrenceRow[] | null) ?? [];
}

export async function fetchAssetsData(): Promise<{
	spirits: HexSpiritAsset[];
	runes: RuneAsset[];
	monsters: MonsterAsset[];
	statusIcons: IconPoolEntry[];
	guardians: GuardianAsset[];
	classes: ClassTrait[];
	origins: OriginTrait[];
}> {
	const [
		spiritsResult,
		runesResult,
		monstersResult,
		statusIconsResult,
		guardiansResult,
		classesResult,
		originsResult
	] = await Promise.all([
		supabaseAssets
			.from(TABLES.HEX_SPIRITS)
			.select('id, name, cost, traits, game_print_image_path, art_raw_image_path'),
		supabaseAssets.from(TABLES.RUNES).select('id, name, origin_id, class_id, icon_path'),
		supabaseAssets
			.from(TABLES.MONSTERS)
			.select('id, name, stage, damage, barrier, image_path, card_image_path, icon'),
		supabaseAssets
			.from(TABLES.ICON_POOL)
			.select('id, name, file_path, tags')
			.contains('tags', ['status']),
		supabaseAssets
			.from(TABLES.GUARDIANS)
			.select('id, name, origin_id, icon_image_path, image_mat_path, chibi_image_path'),
		supabaseAssets.from(TABLES.CLASSES).select('id, name, position, icon_png, color, description'),
		supabaseAssets
			.from(TABLES.ORIGINS)
			.select('id, name, position, icon_png, icon_token_png, color, description')
	]);

	if (spiritsResult.error) throw spiritsResult.error;
	if (runesResult.error) throw runesResult.error;
	if (monstersResult.error) throw monstersResult.error;
	if (statusIconsResult.error) throw statusIconsResult.error;
	if (guardiansResult.error) throw guardiansResult.error;
	if (classesResult.error) throw classesResult.error;
	if (originsResult.error) throw originsResult.error;

	return {
		spirits: (spiritsResult.data as HexSpiritAsset[]) ?? [],
		runes: (runesResult.data as RuneAsset[]) ?? [],
		monsters: (monstersResult.data as MonsterAsset[]) ?? [],
		statusIcons: (statusIconsResult.data as IconPoolEntry[]) ?? [],
		guardians: (guardiansResult.data as GuardianAsset[]) ?? [],
		classes: (classesResult.data as ClassTrait[]) ?? [],
		origins: (originsResult.data as OriginTrait[]) ?? []
	};
}

// ============ Game Notes Functions ============

// Fetch game notes for a specific game (excludes host_secret)
export async function fetchGameNotes(gameId: string): Promise<GameNotes | null> {
	const { data, error } = await supabase
		.from(TABLES.GAME_NOTES)
		.select('id, game_id, summary, improvements, created_at, updated_at')
		.eq('game_id', gameId)
		.single();

	if (error || !data) {
		if (error?.code !== 'PGRST116') {
			// Not a "no rows" error
			console.error('[Supabase] Error fetching game notes:', error);
		}
		return null;
	}

	// Parse improvements JSONB
	const improvements = parseJsonWithFallback<string[] | null>(data.improvements, null);

	return {
		...data,
		improvements: improvements || []
	} as GameNotes;
}

export async function upsertGameNotes(params: {
	gameId: string;
	summary: string | null;
	improvements: string[];
}): Promise<void> {
	const { gameId, summary, improvements } = params;

	const { error: upsertError } = await supabase.from(TABLES.GAME_NOTES).upsert(
		{
			game_id: gameId,
			host_secret: 'env-validated',
			summary,
			improvements,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'game_id' }
	);

	if (upsertError) {
		throw upsertError;
	}
}

// ============ Player Feedback Functions ============

// Fetch all player feedback for a specific game
export async function fetchPlayerFeedback(gameId: string): Promise<PlayerFeedback[]> {
	const { data, error } = await supabase
		.from(TABLES.PLAYER_FEEDBACK)
		.select('*')
		.eq('game_id', gameId)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[Supabase] Error fetching player feedback:', error);
		return [];
	}

	return data as PlayerFeedback[];
}

// Submit new player feedback
export async function submitPlayerFeedback(feedback: {
	gameId: string;
	playerName: string;
	feedbackText: string | null;
	ratingComplexity: number;
	ratingEnjoyment: number;
	ratingOthersEnjoyment: number;
}): Promise<{ success: boolean; message: string }> {
	const { error } = await supabase.from(TABLES.PLAYER_FEEDBACK).insert({
		game_id: feedback.gameId,
		player_name: feedback.playerName,
		feedback_text: feedback.feedbackText,
		rating_complexity: feedback.ratingComplexity,
		rating_enjoyment: feedback.ratingEnjoyment,
		rating_others_enjoyment: feedback.ratingOthersEnjoyment
	});

	if (error) {
		console.error('[Supabase] Error submitting player feedback:', error);
		return { success: false, message: error.message };
	}

	return { success: true, message: 'Feedback submitted successfully' };
}
