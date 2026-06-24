<script lang="ts">
	import { untrack } from 'svelte';
	import type {
		SpectatorProjection,
		SeatColor,
		NavigationDestination,
		MonsterState
	} from '$lib/play/types';
	import { SPIRIT_WORLD_ONLY } from '$lib/play/types';
	import { LOCATIONS, LOCATION_ACCENT } from '$lib/play/locations';
	import { decideNavMode, compassDiameter, type NavViewMode } from '$lib/play/viewMode';
	import type { GameLocationAsset, IconPoolEntry } from '$lib/types';
	import LocationCard from './LocationCard.svelte';
	import RewardArc from './RewardArc.svelte';

	interface Props {
		room: SpectatorProjection;
		mySeat?: SeatColor | null;
		selectable?: boolean;
		selectedDestination?: NavigationDestination | null;
		focusedDestination?: NavigationDestination | null;
		onHover?: (destination: NavigationDestination | null) => void;
		onSelect?: (destination: NavigationDestination) => void;
		monster: MonsterState | null;
		gameLocations?: Map<string, GameLocationAsset>;
		iconPool?: Map<string, IconPoolEntry>;
	}

	let {
		room,
		mySeat = null,
		selectable = false,
		selectedDestination = null,
		focusedDestination = null,
		onHover,
		onSelect,
		monster,
		gameLocations = new Map(),
		iconPool = new Map()
	}: Props = $props();

	const ABYSS: NavigationDestination = 'Arcane Abyss';
	const s = SPIRIT_WORLD_ONLY;
	// The four realms sit at the cardinal points of the compass around the Abyss hub.
	// The four realms fill the four corner quadrants carved out by the plus.
	const ARMS: { pos: string; name: NavigationDestination }[] = [
		{ pos: 'tl', name: s[0] },
		{ pos: 'tr', name: s[1] },
		{ pos: 'bl', name: s[2] },
		{ pos: 'br', name: s[3] }
	];

	const seatNames = $derived.by(() => {
		const names: Partial<Record<SeatColor, string>> = {};
		for (const seat of room.activeSeats) names[seat] = room.seats[seat]?.displayName ?? seat;
		return names;
	});

	function occupantsOf(destination: NavigationDestination): SeatColor[] {
		return room.locationOccupancy[destination] ?? [];
	}

	// Which 90° quadrant to light up for the focused realm (conic 0deg = up,
	// clockwise). Each wedge is bounded by the plus's vertical/horizontal arms.
	const WEDGE_BY_POS: Record<string, string> = {
		tr: '0deg',
		br: '90deg',
		bl: '180deg',
		tl: '270deg'
	};
	const focusedArm = $derived(ARMS.find((a) => a.name === focusedDestination) ?? null);
	const focusWedge = $derived(focusedArm ? WEDGE_BY_POS[focusedArm.pos] : null);
	const focusAccent = $derived(
		focusedDestination ? (LOCATION_ACCENT[focusedDestination] ?? '#ffffff') : '#ffffff'
	);

	// Compass mode: each cardinal realm is a transparent quadrant hit-target; its title
	// and reward rows are drawn as concentric arcs by RewardArc (one hub-centred overlay).
	const quadInputs = $derived(
		ARMS.map((a) => ({
			name: a.name,
			pos: a.pos as 'tl' | 'tr' | 'bl' | 'br',
			location: gameLocations.get(a.name) ?? null,
			accent: LOCATION_ACCENT[a.name] ?? '#8d8aa1',
			occupants: occupantsOf(a.name),
			selected: selectedDestination === a.name,
			focused: focusedDestination === a.name
		}))
	);

	function pickRealm(name: NavigationDestination) {
		if (selectable) onSelect?.(name);
	}

	// ── Mobile carousel ──────────────────────────────────────────────────────
	// Phones get one location at a time in a horizontal swipe carousel instead of
	// the compass (which is unreadable at 360px). Same LocationCards, handlers and
	// accents; swiping to a card drives the splat world behind it via onHover.
	const DESTINATIONS: NavigationDestination[] = [...s, ABYSS];

	let carouselEl = $state<HTMLDivElement | null>(null);
	let currentIndex = $state(0);
	let didInitScroll = false;
	let scrollRaf = 0;

	// Measure the REAL board area (not the viewport). Whether we show the round
	// compass or the one-card-at-a-time carousel is a single SPACE-BASED decision —
	// "does a full, uncropped, usable circle fit in this cell?" — centralized in
	// viewMode.ts and keyed off the SMALLER dimension only (aspect ratio never
	// matters, which is what the old width/aspect heuristic got wrong). Hysteresis
	// needs the previous mode, so track it in state and recompute on resize.
	let boardW = $state(0);
	let boardH = $state(0);
	let viewMode = $state<NavViewMode>('cards');
	$effect(() => {
		const next = decideNavMode(boardW, boardH, untrack(() => viewMode));
		if (next !== viewMode) viewMode = next;
	});
	const useCards = $derived(viewMode === 'cards');
	// Box sized so the full ring (drawn at 122%) fits inside the cell uncropped.
	const compassSize = $derived(compassDiameter(boardW, boardH));
	// Thickness of the rim band that holds the engraved realm names.
	const ringThickness = $derived(compassSize * 0.085);

	// Portrait → vertical reel (slot-machine, scroll up/down); landscape → the
	// horizontal swipe. Keyed off the board's own shape so it matches the layout.
	const carouselVertical = $derived(boardH >= boardW);

	// One card-slot's size along the scroll axis (measured; leading/trailing spacers
	// are sized so card i centres at scrollPos = i * span).
	function slideSpan(el: HTMLDivElement): number {
		const s = el.querySelector('.nav-slide') as HTMLElement | null;
		if (s) return carouselVertical ? s.offsetHeight : s.offsetWidth;
		return carouselVertical ? el.clientHeight : el.clientWidth;
	}

	// Coverflow depth: for each card write a signed distance --d and abs --ad (in card
	// units from the reel centre) plus a z-index, so the centred card renders large +
	// solid and the others recede smaller, translucent and tilted. Also tracks focus.
	function updateDepth() {
		const el = carouselEl;
		if (!el) return;
		const slides = el.querySelectorAll<HTMLElement>('.nav-slide');
		if (!slides.length) return;
		const r = el.getBoundingClientRect();
		const centre = carouselVertical ? r.top + r.height / 2 : r.left + r.width / 2;
		const span = slideSpan(el) || 1;
		let best = 0;
		let bestAbs = Infinity;
		slides.forEach((node, i) => {
			const sr = node.getBoundingClientRect();
			const c = carouselVertical ? sr.top + sr.height / 2 : sr.left + sr.width / 2;
			const d = (c - centre) / span;
			const ad = Math.abs(d);
			node.style.setProperty('--d', d.toFixed(3));
			node.style.setProperty('--ad', ad.toFixed(3));
			node.style.zIndex = String(100 - Math.round(ad * 10));
			if (ad < bestAbs) {
				bestAbs = ad;
				best = i;
			}
		});
		if (best !== currentIndex && best >= 0 && best < DESTINATIONS.length) {
			currentIndex = best;
			// Keep the splat world + highlight in sync with the centred card.
			if (selectable) onHover?.(DESTINATIONS[best]);
		}
	}

	function scrollCardIntoView(i: number, smooth: boolean) {
		const el = carouselEl;
		if (!el) return;
		const offset = i * slideSpan(el);
		const opts: ScrollToOptions = smooth ? { behavior: 'smooth' } : {};
		el.scrollTo(carouselVertical ? { top: offset, ...opts } : { left: offset, ...opts });
	}

	// Centre the locked/focused card on first layout, then paint the depth.
	$effect(() => {
		if (!useCards || !carouselEl || didInitScroll) return;
		didInitScroll = true;
		const target = selectedDestination ?? focusedDestination;
		const initial = target ? Math.max(0, DESTINATIONS.indexOf(target)) : 0;
		currentIndex = initial;
		scrollCardIntoView(initial, false);
		if (selectable) onHover?.(DESTINATIONS[initial]);
		requestAnimationFrame(updateDepth);
	});

	// Re-centre + repaint depth when the axis flips (rotation) or the cell resizes,
	// so the same card stays focused. currentIndex read untracked.
	$effect(() => {
		void carouselVertical;
		void boardW;
		void boardH;
		if (!useCards || !carouselEl || !didInitScroll) return;
		untrack(() => {
			scrollCardIntoView(currentIndex, false);
			requestAnimationFrame(updateDepth);
		});
	});

	function onCarouselScroll() {
		if (scrollRaf || !carouselEl) return;
		scrollRaf = requestAnimationFrame(() => {
			scrollRaf = 0;
			updateDepth();
		});
	}

	function scrollToIndex(i: number) {
		scrollCardIntoView(i, true);
	}
</script>

<div class="board" bind:clientWidth={boardW} bind:clientHeight={boardH}>
	{#if useCards}
		<!-- Mobile: one location per view. Portrait → vertical reel (up/down);
		     landscape → horizontal swipe. Dots jump between them. -->
		<div class="nav-carousel-wrap" class:vertical={carouselVertical}>
			<div
				class="nav-carousel"
				class:vertical={carouselVertical}
				bind:this={carouselEl}
				onscroll={onCarouselScroll}
				data-testid="nav-carousel"
			>
				<div class="nav-spacer" aria-hidden="true"></div>
				{#each DESTINATIONS as dest (dest)}
					<div class="nav-slide">
						<div
							class="nav-card"
							class:selected={selectedDestination === dest}
							class:focused={focusedDestination === dest}
							style="--accent: {LOCATION_ACCENT[dest] ?? '#8d8aa1'}"
						>
							<LocationCard
								config={LOCATIONS[dest]}
								location={gameLocations.get(dest) ?? null}
								{iconPool}
								occupants={occupantsOf(dest)}
								{seatNames}
								{selectable}
								focused={focusedDestination === dest}
								selected={selectedDestination === dest}
								monster={dest === ABYSS ? monster : null}
								{mySeat}
								{onHover}
								{onSelect}
							/>
						</div>
					</div>
				{/each}
				<div class="nav-spacer" aria-hidden="true"></div>
			</div>
			<div class="nav-dots" role="tablist" aria-label="Locations">
				{#each DESTINATIONS as dest, i (dest)}
					<button
						type="button"
						class="nav-dot"
						class:active={i === currentIndex}
						role="tab"
						aria-selected={i === currentIndex}
						aria-label={dest}
						onclick={() => scrollToIndex(i)}
					>
						<span class="dot-mark" style="--accent: {LOCATION_ACCENT[dest] ?? '#fff'}"></span>
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<div
			class="compass"
			data-testid="realm-compass"
			style="width: {compassSize}px; height: {compassSize}px;"
		>
			<!-- A thick rim band; the engraved realm names ride inside it (RewardArc). -->
			<div class="ring" style="border-width: {ringThickness}px;" aria-hidden="true"></div>
			<!-- Pie-wedge highlight for the focused realm's quadrant. -->
			{#if focusWedge}
				<div
					class="quadrant"
					style="--wedge: {focusWedge}; --accent: {focusAccent}"
					aria-hidden="true"
				></div>
			{/if}
			<!-- A plus of spokes from the hub out to each cardinal realm. -->
			<svg class="spokes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<line x1="50" y1="5" x2="50" y2="95" />
				<line x1="5" y1="50" x2="95" y2="50" />
			</svg>

			<div class="arm hub">
				<LocationCard
					config={LOCATIONS[ABYSS]}
					location={gameLocations.get(ABYSS) ?? null}
					{iconPool}
					occupants={occupantsOf(ABYSS)}
					{seatNames}
					{selectable}
					hub
					focused={focusedDestination === ABYSS}
					selected={selectedDestination === ABYSS}
					{monster}
					{mySeat}
					{onHover}
					{onSelect}
				/>
			</div>

			<!-- Transparent quadrant hit-targets; the reward arcs sit on top (non-interactive). -->
			{#each ARMS as arm (arm.name)}
				<button
					type="button"
					class="q-hit {arm.pos}"
					data-testid="location-{arm.name}"
					aria-label={arm.name}
					disabled={!selectable}
					onclick={() => pickRealm(arm.name)}
					onpointerenter={() => selectable && onHover?.(arm.name)}
					onpointerleave={() => selectable && onHover?.(null)}
					onfocus={() => selectable && onHover?.(arm.name)}
					onblur={() => selectable && onHover?.(null)}
				></button>
			{/each}

			<RewardArc quads={quadInputs} {iconPool} {seatNames} {mySeat} size={compassSize} />
		</div>
	{/if}
</div>

<style>
	.board {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		/* Fill the available stage area rather than shrink to the rendered content.
		   This is what makes the compass-vs-cards decision STABLE: the measured cell
		   (boardW/boardH) is the available space, identical in both modes — so picking
		   the compass can't shrink the cell and bounce the decision back to cards
		   (the flicker). Both views then center within this fixed area. */
		flex: 1 1 auto;
		height: 100%;
		min-height: 0;
	}

	/* ── Mobile carousel: one location per view, swipe left/right ───────────── */
	.nav-carousel-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		width: 100%;
		/* MainStage centers this view with place-items:center, so the board is
		   content-sized — and a horizontal flex-scroller with no definite height
		   collapses to 0 (the compass avoided this via aspect-ratio). Give the
		   carousel an explicit height (the map-layer band is ~74dvh on a phone) so
		   the cards actually render. */
		height: 64dvh;
		max-height: 100%;
	}
	.nav-carousel {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}
	.nav-carousel::-webkit-scrollbar {
		display: none;
	}
	.nav-slide {
		/* ~3 cards in view: the focused one centred, flanked by peeks of its
		   neighbours so the player can tell there's more to scroll through. */
		flex: 0 0 44%;
		min-width: 0;
		min-height: 0;
		scroll-snap-align: center;
		scroll-snap-stop: always;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 5px 12px;
		box-sizing: border-box;
		/* 3D context for each card's coverflow tilt. */
		perspective: 1100px;
	}
	/* Leading/trailing space so the FIRST and LAST cards can reach the centre too
	   (half the empty band: (100% − slide)/2). */
	.nav-spacer {
		flex: 0 0 28%;
	}
	/* Each card is a real surface that is scaled / faded / tilted by its distance
	   from the reel centre — --d (signed) and --ad (absolute), set per-card in JS on
	   the parent .nav-slide. Centre = large, solid, glowing; neighbours recede into
	   the void, smaller and translucent. */
	.nav-card {
		--d: 0;
		--ad: 0;
		width: 100%;
		max-width: 420px;
		max-height: 100%;
		overflow-y: auto;
		box-sizing: border-box;
		padding: 18px 16px;
		border-radius: 18px;
		background: linear-gradient(180deg, rgba(20, 14, 34, 0.92), rgba(10, 7, 20, 0.96));
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		transform-origin: center center;
		/* Horizontal reel (landscape): pull toward centre, tilt on Y. */
		transform: translateX(calc(var(--d) * -6%))
			scale(max(0.6, calc(1.02 - var(--ad) * 0.24)))
			rotateY(calc(var(--d) * 9deg));
		opacity: max(0.16, calc(1 - var(--ad) * 0.52));
		filter: blur(calc(min(var(--ad) * 1.4, 4) * 1px));
		box-shadow:
			0 14px 40px rgba(0, 0, 0, 0.55),
			0 0 calc(max(0px, (1 - var(--ad)) * 34px))
				color-mix(in srgb, var(--accent) 48%, transparent);
		will-change: transform, opacity, filter;
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-card {
			filter: none;
		}
	}
	.nav-card.focused {
		border-color: color-mix(in srgb, var(--accent) 60%, transparent);
	}
	.nav-card.selected {
		border-color: var(--accent);
	}
	.nav-card :global(.loc) {
		width: 100%;
	}
	.nav-dots {
		display: flex;
		gap: 4px;
		justify-content: center;
		align-items: center;
	}
	.nav-dot {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}
	.nav-dot:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
		border-radius: 10px;
	}
	.dot-mark {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.28);
		transition:
			background 160ms ease,
			transform 160ms ease;
	}
	.nav-dot.active .dot-mark {
		background: var(--accent);
		transform: scale(1.6);
	}

	/* ── Vertical reel (portrait): cards stack and snap up/down like a slot
	   machine; the dots move to a column on the right. ─────────────────────── */
	.nav-carousel-wrap.vertical {
		flex-direction: row;
		align-items: stretch;
		gap: 8px;
	}
	.nav-carousel.vertical {
		flex-direction: column;
		width: auto;
		min-width: 0;
		overflow-x: hidden;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		overscroll-behavior-y: contain;
	}
	/* In a column flex, flex-basis:100% is full HEIGHT — each card fills the reel
	   window and snaps. (.nav-slide's flex:0 0 100% already does the right thing.) */
	.nav-carousel-wrap.vertical .nav-dots {
		flex-direction: column;
		justify-content: center;
		flex: 0 0 auto;
	}
	/* Vertical reel: cards fly in from below/above, tilting on X. */
	.nav-carousel.vertical .nav-card {
		transform: translateY(calc(var(--d) * -6%))
			scale(max(0.6, calc(1.02 - var(--ad) * 0.24)))
			rotateX(calc(var(--d) * -9deg));
	}
	.compass {
		position: relative;
		/* Portrait-safe: never let the iOS toolbar squeeze the square below the
		   available width. dvh keeps it honest as the toolbar shows/hides. */
		width: min(92vw, 92dvh, 720px);
		aspect-ratio: 1;
		margin: 0 auto;
		overflow: visible;
	}
	/* A true circle (square box + aspect-ratio) sized well beyond the reward-row
	   cluster so it never clips the rows. */
	.ring {
		position: absolute;
		left: 50%;
		top: 50%;
		/* Outer diameter 120% of the cell; border-box keeps the thick band inside that
		   edge so its INNER edge (and the reward disc it frames) scales predictably. */
		width: 120%;
		aspect-ratio: 1;
		box-sizing: border-box;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		border-style: solid;
		border-color: rgba(255, 255, 255, 0.05);
		/* Crisp hairlines on the inner and outer edges so the faint band reads as a rim. */
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.18),
			inset 0 0 0 1px rgba(255, 255, 255, 0.2);
		pointer-events: none;
	}
	/* Pie-wedge highlight: a 90° conic slice masked to a ring around the hub, so the
	   whole quadrant glows (not a rectangle around the card). */
	.quadrant {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 116%;
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		pointer-events: none;
		background: conic-gradient(
			from var(--wedge, -45deg) at 50% 50%,
			color-mix(in srgb, var(--accent) 32%, transparent) 0deg,
			color-mix(in srgb, var(--accent) 32%, transparent) 90deg,
			transparent 90deg,
			transparent 360deg
		);
		-webkit-mask: radial-gradient(
			closest-side,
			transparent 26%,
			#000 34%,
			#000 88%,
			transparent 100%
		);
		mask: radial-gradient(closest-side, transparent 26%, #000 34%, #000 88%, transparent 100%);
		animation: quad-in 150ms ease both;
	}
	@keyframes quad-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.quadrant {
			animation: none;
		}
	}
	.spokes {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.spokes line {
		stroke: rgba(255, 255, 255, 0.22);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.arm {
		position: absolute;
		display: flex;
		justify-content: center;
	}
	.arm > :global(.loc) {
		width: 100%;
	}
	.hub {
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 26%;
		/* Above the reward-arc overlay so the Abyss core stays clickable. */
		z-index: 3;
	}

	/* Each cardinal realm's clickable region is its quarter of the compass; the arcs
	   and title render on top via RewardArc. A big target reads well with the wedge glow. */
	.q-hit {
		position: absolute;
		width: 50%;
		height: 50%;
		padding: 0;
		margin: 0;
		border: none;
		background: none;
		cursor: default;
		z-index: 1;
	}
	.q-hit:not(:disabled) {
		cursor: pointer;
	}
	.q-hit:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -6px;
		border-radius: 16px;
	}
	.q-hit.tl {
		left: 0;
		top: 0;
	}
	.q-hit.tr {
		left: 50%;
		top: 0;
	}
	.q-hit.bl {
		left: 0;
		top: 50%;
	}
	.q-hit.br {
		left: 50%;
		top: 50%;
	}
</style>
