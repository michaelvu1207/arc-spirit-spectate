<script lang="ts">
	import type { SpiritHexType } from '$lib/hex/gridConfig';

	interface Spirit {
		slotIndex: number;
		id: string;
		name: string;
		cost: number;
	}

	interface Props {
		hex: SpiritHexType;
		spirit?: Spirit | null;
		imageUrl?: string | null;
		slotIndex: number;
		externalImage?: boolean;
	}

	let { hex, spirit = null, imageUrl = null, slotIndex, externalImage = false }: Props = $props();

	// Generate unique IDs for this hex's elements
	const clipId = $derived(`hex-clip-${slotIndex}`);
	const gradientId = $derived(`hex-gradient-${slotIndex}`);
	const shadowId = $derived(`hex-shadow-${slotIndex}`);

	// Convert corners to SVG polygon points string
	const polygonPoints = $derived(hex.corners.map((c) => `${c.x},${c.y}`).join(' '));

	// Calculate center of the hex for positioning elements
	const center = $derived({
		x: hex.corners.reduce((sum, c) => sum + c.x, 0) / hex.corners.length,
		y: hex.corners.reduce((sum, c) => sum + c.y, 0) / hex.corners.length
	});

	// Calculate bounding box for the image
	const bounds = $derived({
		minX: Math.min(...hex.corners.map((c) => c.x)),
		minY: Math.min(...hex.corners.map((c) => c.y)),
		maxX: Math.max(...hex.corners.map((c) => c.x)),
		maxY: Math.max(...hex.corners.map((c) => c.y))
	});

	const hexWidth = $derived(bounds.maxX - bounds.minX);
	const hexHeight = $derived(bounds.maxY - bounds.minY);
</script>

<g class="spirit-hex" data-slot={slotIndex}>
	<!-- Define clipPath and gradients -->
	<defs>
		<clipPath id={clipId}>
			<polygon points={polygonPoints} />
		</clipPath>
		<!-- Empty slot fill — crisp brand violet -->
		<radialGradient id={gradientId} cx="50%" cy="50%" r="70%">
			<stop offset="0%" stop-color="rgb(58, 38, 112)" stop-opacity="0.55" />
			<stop offset="100%" stop-color="rgb(26, 15, 46)" stop-opacity="0.9" />
		</radialGradient>
		<!-- Drop shadow filter -->
		<filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
			<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)" />
		</filter>
	</defs>

	<!-- Hex background/border -->
	<polygon
		points={polygonPoints}
		class="hex-border"
		fill={spirit
			? externalImage
				? 'rgba(0, 0, 0, 0.06)'
				: 'rgba(17, 9, 31, 0.95)'
			: `url(#${gradientId})`}
		stroke={spirit ? 'var(--brand-violet)' : 'var(--color-aether)'}
		stroke-width={spirit ? '2.5' : '1.5'}
		filter={spirit ? `url(#${shadowId})` : 'none'}
	/>

	<!-- Spirit image with hexagonal clip -->
	{#if spirit && imageUrl}
		<image
			href={imageUrl}
			x={bounds.minX}
			y={bounds.minY}
			width={hexWidth}
			height={hexHeight}
			preserveAspectRatio="xMidYMid slice"
			clip-path="url(#{clipId})"
			class="spirit-image"
		/>
		<!-- Subtle vignette overlay -->
		<polygon
			points={polygonPoints}
			fill="none"
			stroke="rgba(0, 0, 0, 0.4)"
			stroke-width="8"
			clip-path="url(#{clipId})"
		/>
	{:else if spirit && externalImage}
		<!-- Image rendered externally by parent -->
	{:else if !spirit}
		<!-- Empty slot - just subtle hex outline, no numbers -->
	{:else}
		<!-- Spirit without image - show name with brand styling -->
		<rect
			x={center.x - 40}
			y={center.y - 12}
			width="80"
			height="24"
			rx="3"
			fill="rgba(26, 15, 46, 0.92)"
		/>
		<text
			x={center.x}
			y={center.y}
			text-anchor="middle"
			dominant-baseline="middle"
			fill="#f5f0ff"
			font-size="12"
			font-weight="400"
			font-family="'Bebas Neue', 'Opsilon', ui-serif, serif"
			letter-spacing="0.06em"
		>
			{spirit.name.length > 10 ? spirit.name.slice(0, 10) + '...' : spirit.name}
		</text>
	{/if}
</g>

<style>
	.spirit-hex {
		cursor: pointer;
	}

	.spirit-hex .hex-border {
		transition:
			stroke 0.2s ease,
			stroke-width 0.2s ease,
			filter 0.2s ease;
	}

	.spirit-hex:hover .hex-border {
		stroke: var(--brand-magenta);
		stroke-width: 3;
		filter: drop-shadow(0 0 8px rgba(255, 43, 199, 0.6));
	}

	.spirit-hex .spirit-image {
		transition: opacity 0.2s ease;
	}

	.spirit-hex:hover .spirit-image {
		opacity: 0.9;
	}
</style>
