/**
 * Game state store using Svelte 5 runes
 * Manages current game session, player snapshots, and realtime updates
 */

import {
	fetchAllGameSnapshots,
	fetchGameNotes,
	fetchGameSnapshotsForRound,
	fetchMaxNavigationCount,
	fetchPlayerFeedback,
	subscribeToGame,
	unsubscribeFromGame,
	unwrapGameSnapshotRow,
	type RealtimePayload
} from '$lib/supabase';
import type {
	BagsData,
	GameSnapshot,
	GameSnapshotRow,
	PlayerSnapshot,
	GameNotes,
	PlayerFeedback
} from '$lib/types';

// Reactive state using Svelte 5 runes
let currentGameId = $state<string | null>(null);
let navigationCount = $state<number>(0);
let maxNavigation = $state<number>(0);
let playerSnapshots = $state<PlayerSnapshot[]>([]);
let isLoading = $state<boolean>(false);
let error = $state<string | null>(null);
let isLive = $state<boolean>(false); // Start with live mode off
let lastUpdateTime = $state<number>(0); // Timestamp of last realtime update
let hasNewData = $state<boolean>(false); // Flag for toast notification

// Historical data for graphs - all rounds for the current game
let allRoundSnapshots = $state<Map<number, PlayerSnapshot[]>>(new Map());
let allRoundBags = $state<Map<number, BagsData>>(new Map());
let allRoundTimestamps = $state<Map<number, string>>(new Map());
let roundBags = $state<BagsData | null>(null);
let roundScenario = $state<GameSnapshot['scenario'] | null>(null);
let allRoundScenarios = $state<Map<number, GameSnapshot['scenario']>>(new Map());

// Game notes and player feedback
let gameNotes = $state<GameNotes | null>(null);
let playerFeedback = $state<PlayerFeedback[]>([]);

// Convert database rows to player snapshots
function rowsToPlayerSnapshots(rows: GameSnapshot[]): PlayerSnapshot[] {
	return rows.map((row) => ({
		playerColor: row.player_color,
		ttsUsername: row.tts_username ?? null,
		selectedCharacter: row.selected_character,
		navigationDestination: row.navigation_destination ?? null,
		blood: row.blood,
		victoryPoints: row.victory_points,
		barrier: row.barrier ?? 0,
		maxTokens: row.max_tokens ?? 4,
		statusLevel: row.status_level ?? 1,
		statusToken: row.status_token ?? null,
		spirits: row.spirits,
		runes: row.runes ?? [],
		handDraws: row.hand_draws ?? [],
		spiritRuneAttachments: row.spirit_rune_attachments ?? [],
		dice: row.dice ?? []
	}));
}

// Fetch snapshots for a specific game and navigation count
async function fetchSnapshots(
	gameId: string,
	navCount: number
): Promise<{
	players: PlayerSnapshot[];
	bags: BagsData | null;
	timestamp: string | null;
	scenario: GameSnapshot['scenario'] | null;
}> {
	const snapshots = await fetchGameSnapshotsForRound(gameId, navCount);
	const players = rowsToPlayerSnapshots(snapshots);
	const bags = snapshots[0]?.bags ?? null;
	const timestamp = snapshots[0]?.created_at ?? snapshots[0]?.game_timestamp ?? null;
	const scenario = snapshots[0]?.scenario ?? null;
	return { players, bags, timestamp, scenario };
}

// Fetch all historical snapshots for graph data
async function fetchAllSnapshots(gameId: string): Promise<{
	playersByRound: Map<number, PlayerSnapshot[]>;
	bagsByRound: Map<number, BagsData>;
	timestampsByRound: Map<number, string>;
	scenariosByRound: Map<number, GameSnapshot['scenario']>;
}> {
	let parsed: GameSnapshot[] = [];
	try {
		parsed = await fetchAllGameSnapshots(gameId);
	} catch (e) {
		console.error('Failed to fetch all snapshots:', e);
		return {
			playersByRound: new Map(),
			bagsByRound: new Map(),
			timestampsByRound: new Map(),
			scenariosByRound: new Map()
		};
	}
	const grouped = new Map<number, PlayerSnapshot[]>();
	const bagsByRound = new Map<number, BagsData>();
	const timestampsByRound = new Map<number, string>();
	const scenariosByRound = new Map<number, GameSnapshot['scenario']>();

	for (const snapshot of parsed) {
		const navCount = snapshot.navigation_count;
		const playerSnapshot: PlayerSnapshot = {
			playerColor: snapshot.player_color,
			ttsUsername: snapshot.tts_username ?? null,
			selectedCharacter: snapshot.selected_character,
			navigationDestination: snapshot.navigation_destination ?? null,
			blood: snapshot.blood,
			victoryPoints: snapshot.victory_points,
			barrier: snapshot.barrier ?? 0,
			maxTokens: snapshot.max_tokens ?? 4,
			statusLevel: snapshot.status_level ?? 1,
			statusToken: snapshot.status_token ?? null,
			spirits: snapshot.spirits,
			runes: snapshot.runes ?? [],
			handDraws: snapshot.hand_draws ?? [],
			spiritRuneAttachments: snapshot.spirit_rune_attachments ?? [],
			dice: snapshot.dice ?? []
		};

		if (!grouped.has(navCount)) {
			grouped.set(navCount, []);
		}
		grouped.get(navCount)!.push(playerSnapshot);

		if (snapshot.bags) {
			bagsByRound.set(navCount, snapshot.bags);
		}

		if (snapshot.scenario && !scenariosByRound.has(navCount)) {
			scenariosByRound.set(navCount, snapshot.scenario);
		}

		const timestamp = snapshot.created_at ?? snapshot.game_timestamp;
		if (timestamp) {
			const existingTimestamp = timestampsByRound.get(navCount);
			if (!existingTimestamp) {
				timestampsByRound.set(navCount, timestamp);
			} else {
				const existingMs = Date.parse(existingTimestamp);
				const candidateMs = Date.parse(timestamp);
				if (!Number.isNaN(existingMs) && !Number.isNaN(candidateMs) && candidateMs < existingMs) {
					timestampsByRound.set(navCount, timestamp);
				}
			}
		}
	}

	return { playersByRound: grouped, bagsByRound, timestampsByRound, scenariosByRound };
}

// Load a game by ID
export async function loadGame(gameId: string) {
	isLoading = true;
	error = null;

	try {
		// Unsubscribe from previous game if any
		if (currentGameId) {
			unsubscribeFromGame(currentGameId);
		}

		// Set the new game ID
		currentGameId = gameId;
		allRoundTimestamps = new Map();
		allRoundScenarios = new Map();
		roundScenario = null;

		// Fetch the max navigation count
		maxNavigation = await fetchMaxNavigationCount(gameId);
		navigationCount = maxNavigation > 0 ? maxNavigation : 1; // Start at latest round
		isLive = false; // Start with live mode off

		// Fetch snapshots for latest round
		if (maxNavigation > 0) {
			const latestRound = await fetchSnapshots(gameId, maxNavigation);
			playerSnapshots = latestRound.players;
			roundBags = latestRound.bags;
			roundScenario = latestRound.scenario;
			if (latestRound.timestamp) {
				allRoundTimestamps.set(maxNavigation, latestRound.timestamp);
				allRoundTimestamps = new Map(allRoundTimestamps);
			}
		} else {
			playerSnapshots = [];
			roundBags = null;
			roundScenario = null;
		}

		// Fetch all historical data for graphs
		const history = await fetchAllSnapshots(gameId);
		allRoundSnapshots = history.playersByRound;
		allRoundBags = history.bagsByRound;
		allRoundTimestamps = history.timestampsByRound;
		allRoundScenarios = history.scenariosByRound;

		// Fetch game notes and player feedback
		gameNotes = await fetchGameNotes(gameId);
		playerFeedback = await fetchPlayerFeedback(gameId);

		// Subscribe to realtime updates
		subscribeToGame(gameId, handleInsertSnapshot, handleUpdateSnapshot);
	} catch (e) {
		error = e instanceof Error ? e.message : 'Unknown error loading game';
		console.error('Error loading game:', e);
	} finally {
		isLoading = false;
	}
}

// Handle INSERT event - new snapshot from realtime subscription
function handleInsertSnapshot(payload: RealtimePayload) {
	const newRow = payload.new as GameSnapshotRow;
	if (!newRow || !newRow.id) return;

	const snapshot = unwrapGameSnapshotRow(newRow);

	// Update last update time for toast
	lastUpdateTime = Date.now();
	hasNewData = true;

	// Update max navigation if this is a new round
	if (snapshot.navigation_count > maxNavigation) {
		maxNavigation = snapshot.navigation_count;
	}

	// Add to historical data
	const navCount = snapshot.navigation_count;
	const timestamp = snapshot.created_at ?? snapshot.game_timestamp;
	if (timestamp) {
		const existingTimestamp = allRoundTimestamps.get(navCount);
		if (!existingTimestamp) {
			allRoundTimestamps.set(navCount, timestamp);
			allRoundTimestamps = new Map(allRoundTimestamps);
		} else {
			const existingMs = Date.parse(existingTimestamp);
			const candidateMs = Date.parse(timestamp);
			if (!Number.isNaN(existingMs) && !Number.isNaN(candidateMs) && candidateMs < existingMs) {
				allRoundTimestamps.set(navCount, timestamp);
				allRoundTimestamps = new Map(allRoundTimestamps);
			}
		}
	}

	const playerSnapshot: PlayerSnapshot = {
		playerColor: snapshot.player_color,
		ttsUsername: snapshot.tts_username ?? null,
		selectedCharacter: snapshot.selected_character,
		navigationDestination: snapshot.navigation_destination ?? null,
		blood: snapshot.blood,
		victoryPoints: snapshot.victory_points,
		barrier: snapshot.barrier ?? 0,
		maxTokens: snapshot.max_tokens ?? 4,
		statusLevel: snapshot.status_level ?? 1,
		statusToken: snapshot.status_token ?? null,
		spirits: snapshot.spirits,
		runes: snapshot.runes ?? [],
		handDraws: snapshot.hand_draws ?? [],
		spiritRuneAttachments: snapshot.spirit_rune_attachments ?? [],
		dice: snapshot.dice ?? []
	};

	if (!allRoundSnapshots.has(navCount)) {
		allRoundSnapshots.set(navCount, []);
	}

	const existingIdx = allRoundSnapshots
		.get(navCount)!
		.findIndex((p) => p.playerColor === snapshot.player_color);

	if (existingIdx >= 0) {
		allRoundSnapshots.get(navCount)![existingIdx] = playerSnapshot;
	} else {
		allRoundSnapshots.get(navCount)!.push(playerSnapshot);
	}

	// Trigger reactivity by reassigning
	allRoundSnapshots = new Map(allRoundSnapshots);

		// Update round-level bag snapshots
		if (snapshot.bags) {
			allRoundBags.set(navCount, snapshot.bags);
			allRoundBags = new Map(allRoundBags);
			if (navCount === navigationCount) {
				roundBags = snapshot.bags;
			}
		}

		if (snapshot.scenario && !allRoundScenarios.has(navCount)) {
			allRoundScenarios.set(navCount, snapshot.scenario);
			allRoundScenarios = new Map(allRoundScenarios);
			if (navCount === navigationCount) {
				roundScenario = snapshot.scenario;
			}
		}

	// If in live mode, auto-navigate to latest round
	if (isLive && snapshot.navigation_count > navigationCount) {
		navigationCount = snapshot.navigation_count;
		playerSnapshots = []; // Will be populated below
		roundBags = allRoundBags.get(navigationCount) ?? null;
	}

	// If this snapshot is for the currently viewed round, add/update it
		if (snapshot.navigation_count === navigationCount) {
			const existingIndex = playerSnapshots.findIndex((p) => p.playerColor === snapshot.player_color);

		if (existingIndex >= 0) {
			playerSnapshots[existingIndex] = playerSnapshot;
			// Trigger reactivity
			playerSnapshots = [...playerSnapshots];
		} else {
			playerSnapshots = [...playerSnapshots, playerSnapshot].sort((a, b) =>
				a.playerColor.localeCompare(b.playerColor)
			);
		}
	}
}

// Handle UPDATE event - modified snapshot from realtime subscription
function handleUpdateSnapshot(payload: RealtimePayload) {
	const updatedRow = payload.new as GameSnapshotRow;
	if (!updatedRow || !updatedRow.id) return;

	const snapshot = unwrapGameSnapshotRow(updatedRow);

	// Update last update time for toast
	lastUpdateTime = Date.now();
	hasNewData = true;

	const navCount = snapshot.navigation_count;
	const timestamp = snapshot.created_at ?? snapshot.game_timestamp;
	if (timestamp) {
		const existingTimestamp = allRoundTimestamps.get(navCount);
		if (!existingTimestamp) {
			allRoundTimestamps.set(navCount, timestamp);
			allRoundTimestamps = new Map(allRoundTimestamps);
		} else {
			const existingMs = Date.parse(existingTimestamp);
			const candidateMs = Date.parse(timestamp);
			if (!Number.isNaN(existingMs) && !Number.isNaN(candidateMs) && candidateMs < existingMs) {
				allRoundTimestamps.set(navCount, timestamp);
				allRoundTimestamps = new Map(allRoundTimestamps);
			}
		}
	}

	const playerSnapshot: PlayerSnapshot = {
		playerColor: snapshot.player_color,
		ttsUsername: snapshot.tts_username ?? null,
		selectedCharacter: snapshot.selected_character,
		navigationDestination: snapshot.navigation_destination ?? null,
		blood: snapshot.blood,
		victoryPoints: snapshot.victory_points,
		barrier: snapshot.barrier ?? 0,
		maxTokens: snapshot.max_tokens ?? 4,
		statusLevel: snapshot.status_level ?? 1,
		statusToken: snapshot.status_token ?? null,
		spirits: snapshot.spirits,
		runes: snapshot.runes ?? [],
		handDraws: snapshot.hand_draws ?? [],
		spiritRuneAttachments: snapshot.spirit_rune_attachments ?? [],
		dice: snapshot.dice ?? []
	};

		// Update in historical data
		if (allRoundSnapshots.has(navCount)) {
		const existingIdx = allRoundSnapshots
			.get(navCount)!
			.findIndex((p) => p.playerColor === snapshot.player_color);

		if (existingIdx >= 0) {
			allRoundSnapshots.get(navCount)![existingIdx] = playerSnapshot;
			allRoundSnapshots = new Map(allRoundSnapshots);
		}
		}

		if (snapshot.scenario) {
			allRoundScenarios.set(navCount, snapshot.scenario);
			allRoundScenarios = new Map(allRoundScenarios);
		}

		// If this snapshot is for the currently viewed round, update it
		if (snapshot.navigation_count === navigationCount) {
		const existingIndex = playerSnapshots.findIndex((p) => p.playerColor === snapshot.player_color);

		if (existingIndex >= 0) {
			playerSnapshots[existingIndex] = playerSnapshot;
			playerSnapshots = [...playerSnapshots];
		}

			if (snapshot.bags) {
				roundBags = snapshot.bags;
				allRoundBags.set(snapshot.navigation_count, snapshot.bags);
				allRoundBags = new Map(allRoundBags);
			}

			if (snapshot.scenario) {
				roundScenario = snapshot.scenario;
			}
		}
	}

// Navigate to a specific round
export async function goToRound(round: number) {
	if (!currentGameId || round < 1 || round > maxNavigation) return;

	// Disable live mode when manually navigating (unless going to latest)
	if (round !== maxNavigation) {
		isLive = false;
	}

	isLoading = true;
	error = null;

	try {
		navigationCount = round;

			// Try to use cached data first
			if (allRoundSnapshots.has(round)) {
				playerSnapshots = [...allRoundSnapshots.get(round)!];
				roundBags = allRoundBags.get(round) ?? null;
				roundScenario = allRoundScenarios.get(round) ?? null;
			} else {
				const fetched = await fetchSnapshots(currentGameId, round);
				playerSnapshots = fetched.players;
				roundBags = fetched.bags;
				roundScenario = fetched.scenario;
				if (fetched.timestamp) {
					allRoundTimestamps.set(round, fetched.timestamp);
					allRoundTimestamps = new Map(allRoundTimestamps);
				}
			// Cache it
			allRoundSnapshots.set(round, [...playerSnapshots]);
			allRoundSnapshots = new Map(allRoundSnapshots);
				if (fetched.bags) {
					allRoundBags.set(round, fetched.bags);
					allRoundBags = new Map(allRoundBags);
				}
				if (fetched.scenario) {
					allRoundScenarios.set(round, fetched.scenario);
					allRoundScenarios = new Map(allRoundScenarios);
				}
			}
	} catch (e) {
		error = e instanceof Error ? e.message : 'Unknown error navigating';
		console.error('Error navigating to round:', e);
	} finally {
		isLoading = false;
	}
}

// Navigation helpers
export function nextRound() {
	goToRound(navigationCount + 1);
}

export function prevRound() {
	goToRound(navigationCount - 1);
}

export function latestRound() {
	isLive = true;
	goToRound(maxNavigation);
}

// Toggle live mode
export function toggleLive() {
	if (isLive) {
		// Turn off live mode - stay on current round
		isLive = false;
	} else {
		// Turn on live mode - go to latest round
		isLive = true;
		if (navigationCount !== maxNavigation) {
			goToRound(maxNavigation);
		}
	}
}

// Set live mode explicitly
export function setLive(value: boolean) {
	if (value) {
		isLive = true;
		if (navigationCount !== maxNavigation) {
			goToRound(maxNavigation);
		}
	} else {
		isLive = false;
	}
}

// Acknowledge new data (dismiss toast)
export function acknowledgeNewData() {
	hasNewData = false;
}

// Refresh game notes (call after saving)
export async function refreshGameNotes() {
	if (!currentGameId) return;
	gameNotes = await fetchGameNotes(currentGameId);
}

// Refresh player feedback (call after submitting)
export async function refreshPlayerFeedback() {
	if (!currentGameId) return;
	playerFeedback = await fetchPlayerFeedback(currentGameId);
}

// Cleanup function
export function cleanup() {
	if (currentGameId) {
		unsubscribeFromGame(currentGameId);
	}
	currentGameId = null;
	navigationCount = 0;
	maxNavigation = 0;
	playerSnapshots = [];
	allRoundSnapshots = new Map();
	allRoundBags = new Map();
	allRoundTimestamps = new Map();
	roundBags = null;
	allRoundScenarios = new Map();
	roundScenario = null;
	gameNotes = null;
	playerFeedback = [];
	error = null;
	isLive = false;
	hasNewData = false;
}

// Build graph data from historical snapshots
export function getGraphData(): Array<{
	round: number;
	players: Array<{ color: string; blood: number; victoryPoints: number; barrier: number }>;
}> {
	const data: Array<{
		round: number;
		players: Array<{ color: string; blood: number; victoryPoints: number; barrier: number }>;
	}> = [];

	const sortedRounds = Array.from(allRoundSnapshots.keys()).sort((a, b) => a - b);

	for (const round of sortedRounds) {
		const snapshots = allRoundSnapshots.get(round);
		if (snapshots) {
			data.push({
				round,
				players: snapshots.map((s) => ({
					color: s.playerColor,
					blood: s.blood,
					victoryPoints: s.victoryPoints,
					barrier: s.barrier
				}))
			});
		}
	}

	return data;
}

// Export reactive getters for use in components
export function getGameState() {
	return {
		get currentGameId() {
			return currentGameId;
		},
		get navigationCount() {
			return navigationCount;
		},
		get maxNavigation() {
			return maxNavigation;
		},
		get playerSnapshots() {
			return playerSnapshots;
		},
		get roundBags() {
			return roundBags;
		},
		get roundScenario() {
			return roundScenario;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get canGoBack() {
			return navigationCount > 1;
		},
		get canGoForward() {
			return navigationCount < maxNavigation;
		},
		get isLatest() {
			return navigationCount === maxNavigation;
		},
		get isLive() {
			return isLive;
		},
		get hasNewData() {
			return hasNewData;
		},
		get lastUpdateTime() {
			return lastUpdateTime;
		},
		get allRoundSnapshots() {
			return allRoundSnapshots;
		},
		get allRoundBags() {
			return allRoundBags;
		},
		get allRoundTimestamps() {
			return allRoundTimestamps;
		},
		get allRoundScenarios() {
			return allRoundScenarios;
		},
		get gameNotes() {
			return gameNotes;
		},
		get playerFeedback() {
			return playerFeedback;
		}
	};
}
