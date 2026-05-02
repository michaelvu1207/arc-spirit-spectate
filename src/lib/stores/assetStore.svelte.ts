/**
 * Asset store using Svelte 5 runes
 * Manages spirit and guardian assets for display
 */

import { fetchAssetsData, STORAGE_BASE_URL } from '$lib/supabase';
import type {
	HexSpiritAsset,
	GuardianAsset,
	RuneAsset,
	CustomDiceAsset,
	MonsterAsset,
	IconPoolEntry,
	ClassTrait,
	OriginTrait,
	ResolvedSpiritAsset,
	ResolvedGuardianAsset
} from '$lib/types';

// Reactive state using Svelte 5 runes
let spiritAssets = $state<Map<string, HexSpiritAsset>>(new Map());
let runeAssets = $state<Map<string, RuneAsset>>(new Map());
let customDiceAssets = $state<Map<string, CustomDiceAsset>>(new Map());
let monsterAssets = $state<Map<string, MonsterAsset>>(new Map());
let guardianAssets = $state<Map<string, GuardianAsset>>(new Map());
let classTraits = $state<Map<string, ClassTrait>>(new Map());
let originTraits = $state<Map<string, OriginTrait>>(new Map());
let statusIcons = $state<Map<string, IconPoolEntry>>(new Map()); // key: normalized status token (e.g. "corrupt")
let isLoaded = $state<boolean>(false);
let isLoading = $state<boolean>(false);
let error = $state<string | null>(null);

// Build full storage URL from path
function getStorageUrl(path: string | null): string | null {
	if (!path) return null;
	// Path may already be a full URL or a relative path
	if (path.startsWith('http')) return path;
	return `${STORAGE_BASE_URL}/${path}`;
}

function statusKeyFromIconName(name: string): string | null {
	const match = name.toLowerCase().match(/^status_\d+_(.+)$/);
	return match?.[1] ?? null;
}

// Load all assets from Supabase
export async function loadAssets() {
	if (isLoaded || isLoading) return;

	isLoading = true;
	error = null;

	try {
		const assets = await fetchAssetsData();

		// Build maps
		const newSpirits = new Map<string, HexSpiritAsset>();
		for (const spirit of assets.spirits) {
			newSpirits.set(spirit.id, spirit);
		}
		spiritAssets = newSpirits;

		const newRunes = new Map<string, RuneAsset>();
		for (const rune of assets.runes) {
			newRunes.set(rune.id, rune);
		}
		runeAssets = newRunes;

		const newCustomDice = new Map<string, CustomDiceAsset>();
		for (const die of assets.customDice) {
			newCustomDice.set(die.id, die);
		}
		customDiceAssets = newCustomDice;

		const newMonsters = new Map<string, MonsterAsset>();
		for (const monster of assets.monsters) {
			newMonsters.set(monster.id, monster);
		}
		monsterAssets = newMonsters;

		const newGuardians = new Map<string, GuardianAsset>();
		for (const guardian of assets.guardians) {
			newGuardians.set(guardian.name, guardian); // Keyed by name for easy lookup
		}
		guardianAssets = newGuardians;

		const newClasses = new Map<string, ClassTrait>();
		for (const cls of assets.classes) {
			newClasses.set(cls.id, cls);
		}
		classTraits = newClasses;

		const newOrigins = new Map<string, OriginTrait>();
		for (const origin of assets.origins) {
			newOrigins.set(origin.id, origin);
		}
		originTraits = newOrigins;

		const newStatusIcons = new Map<string, IconPoolEntry>();
		for (const icon of assets.statusIcons) {
			const key = statusKeyFromIconName(icon.name) ?? icon.name.toLowerCase();
			newStatusIcons.set(key, icon);
		}
		statusIcons = newStatusIcons;

		isLoaded = true;
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to load assets';
		console.error('Error loading assets:', e);
	} finally {
		isLoading = false;
	}
}

// Get a resolved spirit asset by ID
export function getSpiritAsset(spiritId: string): ResolvedSpiritAsset | null {
	const spirit = spiritAssets.get(spiritId);
	if (!spirit) return null;

	// Resolve class and origin traits
	const resolvedClasses: ClassTrait[] = [];
	const resolvedOrigins: OriginTrait[] = [];

	if (spirit.traits?.class_ids) {
		for (const classId of spirit.traits.class_ids) {
			const cls = classTraits.get(classId);
			if (cls) resolvedClasses.push(cls);
		}
	}

	if (spirit.traits?.origin_ids) {
		for (const originId of spirit.traits.origin_ids) {
			const origin = originTraits.get(originId);
			if (origin) resolvedOrigins.push(origin);
		}
	}

	return {
		id: spirit.id,
		name: spirit.name,
		cost: spirit.cost,
		imageUrl: getStorageUrl(spirit.game_print_image_path || spirit.art_raw_image_path),
		traits: {
			classes: resolvedClasses,
			origins: resolvedOrigins
		}
	};
}

// Get a resolved guardian asset by name
export function getGuardianAsset(guardianName: string): ResolvedGuardianAsset | null {
	const guardian = guardianAssets.get(guardianName);
	if (!guardian) return null;

	const origin = guardian.origin_id ? originTraits.get(guardian.origin_id) : null;

	return {
		id: guardian.id,
		name: guardian.name,
		iconUrl: getStorageUrl(guardian.icon_image_path),
		matUrl: getStorageUrl(guardian.image_mat_path),
		chibiUrl: getStorageUrl(guardian.chibi_image_path),
		origin: origin ?? null
	};
}

// Get class trait by ID
export function getClassTrait(classId: string): ClassTrait | null {
	return classTraits.get(classId) ?? null;
}

// Get origin trait by ID
export function getOriginTrait(originId: string): OriginTrait | null {
	return originTraits.get(originId) ?? null;
}

export function getCustomDiceAsset(diceId: string): CustomDiceAsset | null {
	return customDiceAssets.get(diceId) ?? null;
}

// Export reactive getters for use in components
export function getAssetState() {
	return {
		get spiritAssets() {
			return spiritAssets;
		},
		get runeAssets() {
			return runeAssets;
		},
		get customDiceAssets() {
			return customDiceAssets;
		},
		get monsterAssets() {
			return monsterAssets;
		},
		get guardianAssets() {
			return guardianAssets;
		},
		get classTraits() {
			return classTraits;
		},
		get originTraits() {
			return originTraits;
		},
		get statusIcons() {
			return statusIcons;
		},
		get isLoaded() {
			return isLoaded;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		}
	};
}
