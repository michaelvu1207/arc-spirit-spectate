// Arc Spirits Spectate - Library exports

// =============================================================================
// Components
// =============================================================================
export { default as GameViewer } from './components/GameViewer.svelte';
export { default as GameHeader } from './components/GameHeader.svelte';
export { default as PlayerPanel } from './components/PlayerPanel.svelte';
export { default as HexGrid } from './components/HexGrid.svelte';
export { default as SpiritHex } from './components/SpiritHex.svelte';
export { default as NavigationSelector } from './components/NavigationSelector.svelte';
export { default as ResourceGraph } from './components/ResourceGraph.svelte';
export { default as ErrorDisplay } from './components/ErrorDisplay.svelte';
export { default as ConnectionStatus } from './components/ConnectionStatus.svelte';
export { default as Toast } from './components/Toast.svelte';

// =============================================================================
// Supabase client and helpers
// =============================================================================
export {
	supabase,
	SCHEMA,
	TABLES,
	SUPABASE_URL,
	STORAGE_BASE_URL,
	subscribeToGame,
	unsubscribeFromGame,
	unsubscribeAll,
	type RealtimePayload
} from './supabase';

// =============================================================================
// Types
// =============================================================================
export type {
	Spirit,
	MatSlotSnapshot,
	HandDrawSnapshot,
	BagEntrySnapshot,
	BagSnapshot,
	PurgeBag,
	BagsData,
	PlayerSnapshot,
	GameSnapshot,
	GameSnapshotRow,
	HexSpiritAsset,
	GuardianAsset,
	ClassTrait,
	OriginTrait,
	ResolvedSpiritAsset,
	ResolvedGuardianAsset,
	PlayerColor
} from './types';

export { PLAYER_COLORS, PLAYER_COLOR_HEX } from './types';

// =============================================================================
// Game State Store
// =============================================================================
export {
	loadGame,
	goToRound,
	nextRound,
	prevRound,
	latestRound,
	toggleLive,
	setLive,
	acknowledgeNewData,
	cleanup,
	getGameState,
	getGraphData
} from './stores/gameStore.svelte';

// =============================================================================
// Asset Store
// =============================================================================
export {
	loadAssets,
	getSpiritAsset,
	getGuardianAsset,
	getClassTrait,
	getOriginTrait,
	getAssetState
} from './stores/assetStore.svelte';

// =============================================================================
// Hex Grid Configuration
// =============================================================================
export {
	SpiritHex as SpiritHexClass,
	SLOT_TO_COORDS,
	COORDS_TO_SLOT,
	getSlotFromCoords,
	createSpiritGrid,
	getHexForSlot,
	getHexesBySlot,
	getGridBounds,
	type SpiritHexType
} from './hex/gridConfig';
