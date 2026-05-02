<script lang="ts">
	import {
		createSpiritGrid,
		getGridBounds,
		getSlotFromCoords,
		SLOT_TO_COORDS
	} from '$lib/hex/gridConfig';
	import SpiritHex from './SpiritHex.svelte';
	import type { Spirit } from '$lib/types';

	interface Props {
		spirits?: Spirit[];
		spiritAssets?: Map<string, string>;
		isLoading?: boolean;
		class?: string;
	}

	let {
		spirits = [],
		spiritAssets = new Map(),
		isLoading = false,
		class: className = ''
	}: Props = $props();

	// Create the honeycomb grid
	const grid = createSpiritGrid();

	// Calculate bounds for viewBox with padding
	const bounds = getGridBounds(grid);
	const padding = 20;
	const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`;

	// Create a map of slotIndex to spirit for quick lookup
	const spiritsBySlot = $derived(() => new Map(spirits.map((s) => [s.slotIndex, s])));

	// Get image URL for a spirit
	function getImageUrl(spirit: Spirit | null | undefined): string | null {
		if (!spirit) return null;
		return spiritAssets.get(spirit.id) ?? null;
	}

	type HeroPartyFootprint = {
		spirit: Spirit | null;
		extensionSlots: Set<number>;
	};

	type HeroPartyOverlay = {
		enabled: boolean;
		clipId: string;
		imageUrl: string;
		x: number;
		y: number;
		width: number;
		height: number;
		polygons: string[];
	};

	const AXIAL_DIRS: Array<[number, number]> = [
		[1, 0],
		[1, -1],
		[0, -1],
		[-1, 0],
		[-1, 1],
		[0, 1]
	];

	function neighborsOfSlot(slotIndex: number): number[] {
		const coords = SLOT_TO_COORDS[slotIndex];
		if (!coords) return [];

		const [q, r] = coords;
		const slots: number[] = [];
		for (const [dq, dr] of AXIAL_DIRS) {
			const neighborSlot = getSlotFromCoords(q + dq, r + dr);
			if (neighborSlot) slots.push(neighborSlot);
		}
		return slots;
	}

	function isHeroPartySpirit(spirit: Spirit): boolean {
		const needle = 'hero party';
		const classKeys = Object.keys(spirit.classes ?? {});
		const originKeys = Object.keys(spirit.origins ?? {});
		return [...originKeys, ...classKeys].some((key) => key.trim().toLowerCase() === needle);
	}

	const heroPartyFootprint = $derived((): HeroPartyFootprint => {
		const hero = spirits.find(isHeroPartySpirit) ?? null;
		if (!hero) return { spirit: null, extensionSlots: new Set() };

		const occupied = new Set(spirits.map((s) => s.slotIndex));
		const emptyNeighbors = neighborsOfSlot(hero.slotIndex)
			.filter((slot) => !occupied.has(slot))
			.sort((a, b) => a - b);

		const extensionSlots = new Set<number>();
		if (emptyNeighbors.length < 2) return { spirit: hero, extensionSlots };

		function areAdjacent(a: number, b: number): boolean {
			return neighborsOfSlot(a).includes(b);
		}

		let chosen: [number, number] | null = null;
		for (let i = 0; i < emptyNeighbors.length && !chosen; i += 1) {
			for (let j = i + 1; j < emptyNeighbors.length; j += 1) {
				if (areAdjacent(emptyNeighbors[i], emptyNeighbors[j])) {
					chosen = [emptyNeighbors[i], emptyNeighbors[j]];
					break;
				}
			}
		}

		const [a, b] = chosen ?? [emptyNeighbors[0], emptyNeighbors[1]];
		extensionSlots.add(a);
		extensionSlots.add(b);
		return { spirit: hero, extensionSlots };
	});

	const heroPartyOverlay = $derived((): HeroPartyOverlay => {
		const hero = heroPartyFootprint();
		if (!hero.spirit) {
			return {
				enabled: false,
				clipId: '',
				imageUrl: '',
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				polygons: []
			};
		}
		if (hero.extensionSlots.size !== 2) {
			return {
				enabled: false,
				clipId: '',
				imageUrl: '',
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				polygons: []
			};
		}

		const imageUrl = getImageUrl(hero.spirit);
		if (!imageUrl) {
			return {
				enabled: false,
				clipId: '',
				imageUrl: '',
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				polygons: []
			};
		}

		const slots = [hero.spirit.slotIndex, ...Array.from(hero.extensionSlots.values())].sort(
			(a, b) => a - b
		);

		const polygons: string[] = [];
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const slotIndex of slots) {
			const hex = grid.getHex(SLOT_TO_COORDS[slotIndex]);
			if (!hex) continue;

			polygons.push(hex.corners.map((c) => `${c.x},${c.y}`).join(' '));
			for (const corner of hex.corners) {
				minX = Math.min(minX, corner.x);
				minY = Math.min(minY, corner.y);
				maxX = Math.max(maxX, corner.x);
				maxY = Math.max(maxY, corner.y);
			}
		}

		if (polygons.length !== 3 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
			return {
				enabled: false,
				clipId: '',
				imageUrl: '',
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				polygons: []
			};
		}

		return {
			enabled: true,
			clipId: `hero-party-clip-${hero.spirit.slotIndex}`,
			imageUrl,
			x: minX,
			y: minY,
			width: Math.max(0, maxX - minX),
			height: Math.max(0, maxY - minY),
			polygons
		};
	});

	// All slot indices we need to render
	const slotIndices = Object.keys(SLOT_TO_COORDS).map(Number);
</script>

<svg
	{viewBox}
	class="hex-grid {className}"
	class:loading={isLoading}
	xmlns="http://www.w3.org/2000/svg"
	preserveAspectRatio="xMidYMid meet"
>
	<!-- Gradient definitions for loading skeleton — brand violet tones -->
	<defs>
		<linearGradient id="skeleton-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
			<stop offset="0%" stop-color="rgb(34, 20, 64)" stop-opacity="0.7">
				<animate attributeName="offset" values="-1;2" dur="1.5s" repeatCount="indefinite" />
			</stop>
			<stop offset="50%" stop-color="rgb(90, 43, 255)" stop-opacity="0.5">
				<animate attributeName="offset" values="-0.5;2.5" dur="1.5s" repeatCount="indefinite" />
			</stop>
			<stop offset="100%" stop-color="rgb(34, 20, 64)" stop-opacity="0.7">
				<animate attributeName="offset" values="0;3" dur="1.5s" repeatCount="indefinite" />
			</stop>
		</linearGradient>
	</defs>

	<!-- Background -->
	<rect
		x={bounds.minX - padding}
		y={bounds.minY - padding}
		width={bounds.width + padding * 2}
		height={bounds.height + padding * 2}
		fill="transparent"
	/>

	{#if heroPartyOverlay().enabled}
		{@const overlay = heroPartyOverlay()}
		<defs>
			<clipPath id={overlay.clipId}>
				{#each overlay.polygons as points (points)}
					<polygon {points} />
				{/each}
			</clipPath>
		</defs>
		<image
			href={overlay.imageUrl}
			x={overlay.x}
			y={overlay.y}
			width={overlay.width}
			height={overlay.height}
			preserveAspectRatio="xMidYMid slice"
			clip-path="url(#{overlay.clipId})"
		/>
	{/if}

	<!-- Render each hex slot -->
	{#each slotIndices as slotIndex}
		{@const hero = heroPartyFootprint()}
		{@const overlay = heroPartyOverlay()}
		{@const hex = grid.getHex(SLOT_TO_COORDS[slotIndex])}
		{@const baseSpirit = spiritsBySlot().get(slotIndex)}
		{@const isHeroExtension = !baseSpirit && !!hero.spirit && hero.extensionSlots.has(slotIndex)}
		{@const spirit = baseSpirit ?? (isHeroExtension ? hero.spirit : null)}
		{@const isHeroMain = !!hero.spirit && hero.spirit.slotIndex === slotIndex}
		{@const usesHeroOverlay = overlay.enabled && (isHeroMain || isHeroExtension)}
		{#if hex}
			{#if isLoading}
				<!-- Loading skeleton hex -->
				<g class="skeleton-hex">
					<polygon
						points={hex.corners.map((c) => `${c.x},${c.y}`).join(' ')}
						fill="url(#skeleton-gradient)"
						stroke="rgb(58, 38, 112)"
						stroke-width="2"
					/>
				</g>
			{:else}
				<SpiritHex
					{hex}
					{spirit}
					imageUrl={usesHeroOverlay ? null : getImageUrl(spirit)}
					{slotIndex}
					externalImage={usesHeroOverlay}
				/>
			{/if}
		{/if}
	{/each}
</svg>

<style>
	.hex-grid {
		width: 520px;
		height: auto;
		max-width: 520px;
		flex: none;
		display: block;
		transition: opacity 0.3s ease;
	}

	@media (max-width: 640px) {
		.hex-grid {
			width: 100%;
			max-width: 520px;
		}
	}

	.hex-grid.loading {
		opacity: 0.7;
	}

	.skeleton-hex {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}
</style>
