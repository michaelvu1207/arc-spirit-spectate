<script lang="ts">
	import type { SpiritHexType } from '$lib/hex/gridConfig';

	interface Spirit {
		slotIndex: number;
		id: string;
		name: string;
		cost: number;
	}

	interface AugmentBadge {
		runeId: string;
		name: string;
		icon: string | null;
	}

	interface Props {
		hex: SpiritHexType;
		spirit?: Spirit | null;
		imageUrl?: string | null;
		slotIndex: number;
		externalImage?: boolean;
		/** Discard mode: this occupied hex is clickable to discard its spirit. */
		discardable?: boolean;
		onDiscard?: (slotIndex: number) => void;
		/** Spirit augments attached to this hex (rendered in the bottom-right corner). */
		augments?: AugmentBadge[];
		/** Augment-placement mode: this occupied hex accepts a dragged augment. */
		augmentDroppable?: boolean;
		onDropAugment?: (slotIndex: number) => void;
		/** Inspect mode: clicking this occupied hex opens its detail card. */
		selectable?: boolean;
		/** This hex's spirit is the one currently shown in the detail card. */
		selected?: boolean;
		onSelect?: (slotIndex: number) => void;
	}

	let {
		hex,
		spirit = null,
		imageUrl = null,
		slotIndex,
		externalImage = false,
		discardable = false,
		onDiscard,
		augments = [],
		augmentDroppable = false,
		onDropAugment,
		selectable = false,
		selected = false,
		onSelect
	}: Props = $props();

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

	// Augment badge geometry: a small disc tucked into the hex's bottom-right, pulled
	// in from the bounding box so it stays inside the hex's tapering lower edge.
	const augR = $derived(Math.min(hexWidth, hexHeight) * 0.19);
	const augX = $derived(bounds.minX + hexWidth * 0.68);
	const augY = $derived(bounds.minY + hexHeight * 0.7);
	const augmentNames = $derived(augments.map((a) => a.name).join(', '));
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
		stroke={spirit ? 'transparent' : 'var(--color-aether)'}
		stroke-width={spirit ? '0' : '1.5'}
	/>

	<!-- Spirit image with hexagonal clip — `meet` keeps the entire image
	     visible (letter-boxed inside the hex) instead of `slice` cropping
	     the corners. -->
	{#if spirit && imageUrl}
		<image
			href={imageUrl}
			x={bounds.minX}
			y={bounds.minY}
			width={hexWidth}
			height={hexHeight}
			preserveAspectRatio="xMidYMid meet"
			clip-path="url(#{clipId})"
			class="spirit-image"
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

	{#if selectable && spirit}
		<!-- Inspect: clicking an occupied hex opens its detail card. Rendered before the
		     discard/augment overlays so those intercept clicks when their mode is active. -->
		<g
			class="select-hit"
			role="button"
			tabindex="0"
			aria-label={`Inspect ${spirit?.name ?? 'spirit'}`}
			aria-pressed={selected}
			onclick={() => onSelect?.(slotIndex)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onSelect?.(slotIndex);
				}
			}}
		>
			<polygon points={polygonPoints} class="select-tint" class:selected />
		</g>
	{/if}

	{#if discardable}
		<g
			class="discard-hit"
			role="button"
			tabindex="0"
			aria-label={`Discard ${spirit?.name ?? 'spirit'}`}
			onclick={() => onDiscard?.(slotIndex)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onDiscard?.(slotIndex);
				}
			}}
		>
			<polygon points={polygonPoints} class="discard-tint" />
			<text
				x={center.x}
				y={center.y}
				text-anchor="middle"
				dominant-baseline="middle"
				class="discard-glyph">🗑</text>
		</g>
	{/if}

	{#if augments.length > 0}
		<g class="augment-badge" transform={`translate(${augX} ${augY})`}>
			<title>{augmentNames}</title>
			<defs>
				<clipPath id={`aug-clip-${slotIndex}`}>
					<circle cx="0" cy="0" r={augR} />
				</clipPath>
			</defs>
			<circle cx="0" cy="0" r={augR} class="aug-bg" />
			{#if augments[0].icon}
				<image
					href={augments[0].icon}
					x={-augR}
					y={-augR}
					width={augR * 2}
					height={augR * 2}
					preserveAspectRatio="xMidYMid slice"
					clip-path={`url(#aug-clip-${slotIndex})`}
				/>
			{:else}
				<text x="0" y="0" text-anchor="middle" dominant-baseline="central" class="aug-initial"
					>{augments[0].name.slice(0, 1)}</text
				>
			{/if}
			<circle cx="0" cy="0" r={augR} class="aug-ring" />
			{#if augments.length > 1}
				<circle cx={augR * 0.85} cy={-augR * 0.85} r={augR * 0.62} class="aug-count-bg" />
				<text
					x={augR * 0.85}
					y={-augR * 0.85}
					text-anchor="middle"
					dominant-baseline="central"
					class="aug-count">+{augments.length - 1}</text
				>
			{/if}
		</g>
	{/if}

	{#if augmentDroppable}
		<g
			class="augment-drop"
			role="button"
			tabindex="0"
			aria-label={`Place augment on ${spirit?.name ?? 'spirit'}`}
			data-augment-drop={slotIndex}
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => {
				e.preventDefault();
				onDropAugment?.(slotIndex);
			}}
			onclick={() => onDropAugment?.(slotIndex)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onDropAugment?.(slotIndex);
				}
			}}
		>
			<!-- The polygon carries the data attribute so elementFromPoint hits work on touch. -->
			<polygon points={polygonPoints} class="augment-drop-tint" data-augment-drop={slotIndex} />
		</g>
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

	/* Gate glow on hover behind fine-pointer query so it doesn't stick on touch. */
	@media (hover: hover) and (pointer: fine) {
		.spirit-hex:hover .hex-border {
			filter: drop-shadow(0 0 8px rgba(255, 43, 199, 0.4));
		}

		.spirit-hex:hover .spirit-image {
			opacity: 0.9;
		}
	}

	.spirit-hex .spirit-image {
		transition: opacity 0.2s ease;
	}

	/* Inspect mode: a clickable hex that opens the spirit detail card. The tint is
	   invisible until hover/focus, and stays lit (cyan) while this spirit is selected. */
	.select-hit {
		cursor: pointer;
	}
	.select-hit:focus {
		outline: none;
	}
	.select-tint {
		fill: transparent;
		pointer-events: all;
		stroke: var(--brand-cyan, #5cdfff);
		stroke-width: 2.5;
		stroke-opacity: 0;
		transition: stroke-opacity 0.15s ease, fill 0.15s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.select-hit:hover .select-tint {
			stroke-opacity: 0.6;
		}
	}
	.select-hit:focus-visible .select-tint {
		stroke-opacity: 1;
	}
	.select-tint.selected {
		stroke-opacity: 1;
		fill: rgba(92, 223, 255, 0.12);
		filter: drop-shadow(0 0 8px rgba(92, 223, 255, 0.5));
	}

	/* Discard mode: a clickable red overlay on occupied hexes. */
	.discard-hit {
		cursor: pointer;
	}
	.discard-hit:focus {
		outline: none;
	}
	.discard-tint {
		fill: rgba(180, 20, 30, 0);
		stroke: var(--color-blood, #e05858);
		stroke-width: 2.5;
		stroke-opacity: 0.65;
		transition:
			fill 0.15s ease,
			stroke-opacity 0.15s ease;
	}
	/* Show tint+glyph on hover (desktop) and on focus (keyboard/touch). */
	@media (hover: hover) and (pointer: fine) {
		.discard-hit:hover .discard-tint {
			fill: rgba(180, 20, 30, 0.45);
			stroke-opacity: 1;
		}
		.discard-hit:hover .discard-glyph {
			opacity: 1;
		}
	}
	.discard-hit:focus-visible .discard-tint {
		fill: rgba(180, 20, 30, 0.45);
		stroke-opacity: 1;
	}
	.discard-glyph {
		font-size: 22px;
		/* On touch, always show glyph so the tap target is obvious. */
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}
	/* Always reveal the discard glyph on touch (coarse pointer) so users know
	   the hex is tappable — hover is unavailable on touch screens. */
	@media (pointer: coarse) {
		.discard-glyph {
			opacity: 0.7;
		}
		.discard-tint {
			stroke-opacity: 0.85;
		}
	}
	.discard-hit:focus-visible .discard-glyph {
		opacity: 1;
	}

	/* Spirit augment badge (bottom-right of the hex) — purely decorative, so it never
	   absorbs a click meant for the inspect/select hit-layer beneath it. */
	.augment-badge {
		pointer-events: none;
	}
	.aug-bg {
		fill: #140a24;
	}
	.aug-ring {
		fill: none;
		stroke: #d6b24a;
		stroke-width: 2;
		filter: drop-shadow(0 0 4px rgba(214, 178, 74, 0.6));
	}
	.aug-initial {
		fill: #ffe8a3;
		font-size: 16px;
		font-family: var(--font-display, 'Bebas Neue', serif);
	}
	.aug-count-bg {
		fill: #d6b24a;
	}
	.aug-count {
		fill: #140a24;
		font-size: 11px;
		font-weight: 700;
	}

	/* Augment drop target (active only while an augment is armed/dragged).
	   On touch the polygon also carries data-augment-drop for elementFromPoint. */
	.augment-drop {
		cursor: copy;
	}
	.augment-drop-tint {
		fill: rgba(157, 77, 255, 0.14);
		stroke: #9d4dff;
		stroke-width: 2.5;
		stroke-opacity: 0.7;
		transition: fill 0.12s ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.augment-drop:hover .augment-drop-tint {
			fill: rgba(157, 77, 255, 0.32);
			stroke-opacity: 1;
		}
	}
	/* On touch, keep the drop tint slightly brighter so armed target is clear. */
	@media (pointer: coarse) {
		.augment-drop-tint {
			fill: rgba(157, 77, 255, 0.22);
			stroke-opacity: 0.9;
		}
	}
</style>
