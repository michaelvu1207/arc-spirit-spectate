/**
 * Code-defined Spirit World location presentation config.
 *
 * Reward-row content (the per-location actions) is authored in Supabase
 * (`game_location_rows` + `reward_row_assignments`) and loaded by the catalog —
 * it does NOT live here. What lives here is app-local presentation that has no
 * business in the data layer: each location's origin/element flavor, brand accent
 * color, and the static splat/music asset paths bundled with the client.
 */

import type { NavigationDestination } from './types';

export interface LocationConfig {
	name: NavigationDestination;
	/** Origin (element) flavor, if any — drives accent color + cultivate output. */
	origin: string | null;
	/**
	 * Abyss is combat-only (fight the monster). Every Spirit World location's available
	 * actions ARE its DB reward rows (see `locationInteractions.ts` + `game_locations`):
	 * Rest lives at Floral Patch, Cultivate at Lantern Canyon, Summon at Tidal Cove, etc.
	 * There is NO generic always-available action set — reward-row interactions are the
	 * only way to act at a location.
	 */
	combatOnly: boolean;
}

export const LOCATIONS: Record<NavigationDestination, LocationConfig> = {
	'Floral Patch': { name: 'Floral Patch', origin: 'Forest', combatOnly: false },
	'Cyber City': { name: 'Cyber City', origin: 'Cyber', combatOnly: false },
	'Tidal Cove': { name: 'Tidal Cove', origin: 'Tidal', combatOnly: false },
	'Lantern Canyon': { name: 'Lantern Canyon', origin: 'Lantern', combatOnly: false },
	'Arcane Abyss': { name: 'Arcane Abyss', origin: null, combatOnly: true }
};

/** Accent color per location, aligned with the brand palette. */
export const LOCATION_ACCENT: Record<NavigationDestination, string> = {
	'Floral Patch': '#4cba6a',
	'Cyber City': '#5cdfff',
	'Tidal Cove': '#4d8bf0',
	'Lantern Canyon': '#ffba3d',
	'Arcane Abyss': '#ff2bc7'
};

export function getLocationConfig(name: string): LocationConfig | null {
	return (LOCATIONS as Record<string, LocationConfig>)[name] ?? null;
}

// ── Per-destination presentation: splat world + music ────────────────────────
// Single source of truth so the board, the splat background layer and the music
// resolver never drift (e.g. a new location added to one map but not another).

/** Gaussian-splat world (static .spz under /static/splats) per destination. */
export const SPLAT_BY_DESTINATION: Partial<Record<NavigationDestination, string>> = {
	'Cyber City': '/splats/cyber-city.spz',
	'Floral Patch': '/splats/forest-clearing.spz',
	'Tidal Cove': '/splats/underwater-cave.spz',
	'Lantern Canyon': '/splats/lantern-market.spz',
	'Arcane Abyss': '/splats/abyssal-portal.spz'
};
/** Shown before a destination is picked (the sunset valley). */
export const DEFAULT_SPLAT = '/splats/misty-valley.spz';

/** Ambient world theme per destination (location/interaction phase). */
export const WORLD_MUSIC: Partial<Record<NavigationDestination, string>> = {
	'Cyber City': '/music/worlds/cyber-city.mp3',
	'Floral Patch': '/music/worlds/forest-clearing.mp3',
	'Tidal Cove': '/music/worlds/underwater-cave.mp3',
	'Lantern Canyon': '/music/worlds/lantern-market.mp3',
	'Arcane Abyss': '/music/worlds/abyssal-portal.mp3'
};
export const DEFAULT_WORLD_MUSIC = '/music/worlds/misty-valley.mp3';

/** Combat theme per destination (encounter phase / monster fight). */
export const COMBAT_MUSIC: Partial<Record<NavigationDestination, string>> = {
	'Cyber City': '/music/combat/cyber-city.mp3',
	'Floral Patch': '/music/combat/floral-patch.mp3',
	'Tidal Cove': '/music/combat/tidal-cove.mp3',
	'Lantern Canyon': '/music/combat/lantern-canyon.mp3',
	'Arcane Abyss': '/music/combat/arcane-abyss.mp3'
};
export const DEFAULT_COMBAT_MUSIC = '/music/combat/arcane-abyss.mp3';

/** Scene themes not tied to a single world. */
export const NAVIGATION_MUSIC = '/music/scenes/navigation.mp3';
export const CLEANUP_MUSIC = '/music/scenes/cleanup.mp3';

export function splatFor(dest: NavigationDestination | null | undefined): string {
	return (dest && SPLAT_BY_DESTINATION[dest]) || DEFAULT_SPLAT;
}
export function worldMusicFor(dest: NavigationDestination | null | undefined): string {
	return (dest && WORLD_MUSIC[dest]) || DEFAULT_WORLD_MUSIC;
}
export function combatMusicFor(dest: NavigationDestination | null | undefined): string {
	return (dest && COMBAT_MUSIC[dest]) || DEFAULT_COMBAT_MUSIC;
}
