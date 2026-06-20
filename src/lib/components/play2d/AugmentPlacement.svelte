<script lang="ts">
	import type { getAssetState } from '$lib/stores/assetStore.svelte';
	import type { PlayerProjection } from '$lib/play/types';
	import { SPIRIT_AUGMENT_CLASSES, augmentCapacityForSpirit } from '$lib/play/augments';
	import { augmentIconForClass, spiritBackImageUrl } from './helpers';
	import HexGrid from '$lib/components/HexGrid.svelte';

	interface Props {
		/** The local (own) player whose unplaced augments are being assigned. */
		player: PlayerProjection | null;
		assets: ReturnType<typeof getAssetState>;
		spiritImages?: Map<string, string>;
		busy?: boolean;
		/** Place the chosen Spirit Augment (class) onto a spirit. */
		onPlace?: (
			augmentIndex: number,
			augmentRuneId: string,
			spiritSlotIndex: number,
			className: string
		) => void;
	}

	let { player, assets, spiritImages = new Map(), busy = false, onPlace }: Props = $props();

	// Augments awaiting placement; resolved one at a time (first in pouch = current).
	const myAugments = $derived(player?.unplacedAugments ?? []);
	const current = $derived(myAugments[0] ?? null);

	// The Spirit Augment token icon for a class (the class-linked rune art).
	const augmentIcon = (className: string) => augmentIconForClass(assets, className);
	const augmentIcons = $derived(
		SPIRIT_AUGMENT_CLASSES.map((cls) => ({ className: cls, icon: augmentIcon(cls) }))
	);

	// Armed augment class — click an icon to arm, then click a spirit hex to place.
	let pickedClass = $state<string | null>(null);

	function placedAugmentsOn(slotIndex: number): number {
		return (player?.spiritRuneAttachments ?? []).filter(
			(a) => a.spiritSlotIndex === slotIndex && typeof a.className === 'string'
		).length;
	}
	function isEligible(slotIndex: number): boolean {
		if (!current) return false;
		if (current.boundSlotIndex != null) return slotIndex === current.boundSlotIndex;
		const spirit = (player?.spirits ?? []).find((s) => s.slotIndex === slotIndex);
		if (!spirit) return false;
		// Host-class restriction (e.g. Purifier ⇒ Cursed Spirits only).
		if (current.hostClass != null && (spirit.classes?.[current.hostClass] ?? 0) <= 0) return false;
		const cap = Math.max(augmentCapacityForSpirit(spirit), current.hostCapacity ?? 0);
		return placedAugmentsOn(slotIndex) < cap;
	}
	// Slots that may receive the current augment — passed to HexGrid so the rest stay inert.
	const eligibleSlots = $derived(
		(player?.spirits ?? []).map((s) => s.slotIndex).filter((slot) => isEligible(slot))
	);

	// Placed-augment badges (Spirit Augment icons), keyed by host spirit slot.
	const augmentsBySlot = $derived.by(() => {
		const map = new Map<number, { runeId: string; name: string; icon: string | null }[]>();
		for (const att of player?.spiritRuneAttachments ?? []) {
			const className = typeof att.className === 'string' ? att.className : null;
			if (!className) continue;
			const arr = map.get(att.spiritSlotIndex) ?? [];
			arr.push({ runeId: att.runeId, name: `${className} Augment`, icon: augmentIcon(className) });
			map.set(att.spiritSlotIndex, arr);
		}
		return map;
	});
	const backImageBySlot = $derived.by(() => {
		const map = new Map<number, string>();
		for (const s of player?.spirits ?? []) {
			if (s.isFaceDown) map.set(s.slotIndex, spiritBackImageUrl(s.id));
		}
		return map;
	});

	function dropOn(slotIndex: number) {
		if (busy || !current || !pickedClass || !isEligible(slotIndex)) return;
		onPlace?.(0, current.runeId, slotIndex, pickedClass);
		pickedClass = null;
	}
</script>

<div class="panel" data-testid="augment-placement">
	<header class="head">
		<span class="eyebrow">Spirit Augment</span>
		<span class="title">
			{myAugments.length} to place{current?.boundLabel ? ` — for ${current.boundLabel}` : ''}
		</span>
	</header>

	<!-- Pick list: the six Spirit Augment icons. Click one to arm it. -->
	<div class="aug-list" data-testid="augment-icons">
		{#each augmentIcons as a (a.className)}
			<button
				type="button"
				class="aug-icon"
				class:armed={pickedClass === a.className}
				disabled={busy}
				title={a.className}
				aria-pressed={pickedClass === a.className}
				data-testid={`augment-icon-${a.className}`}
				onclick={() => (pickedClass = pickedClass === a.className ? null : a.className)}
			>
				{#if a.icon}<img src={a.icon} alt={a.className} />{:else}<span class="fb">{a.className}</span>{/if}
			</button>
		{/each}
	</div>

	<p class="hint">
		{#if pickedClass}
			Click a spirit to place the <strong>{pickedClass}</strong> augment{current?.boundLabel
				? ` on ${current.boundLabel}`
				: ''}.
		{:else}
			Click an augment, then a spirit in your board.
		{/if}
	</p>

	<div class="hex-wrap">
		<HexGrid
			spirits={player?.spirits ?? []}
			spiritAssets={spiritImages}
			{backImageBySlot}
			{augmentsBySlot}
			augmentDropMode={!busy && pickedClass !== null}
			augmentEligibleSlots={eligibleSlots}
			onDropAugment={dropOn}
		/>
	</div>
</div>

<style>
	/* In-stage panel — rendered inside MainStage's view (replaces the stage content),
	   NOT a floating modal. */
	.panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		max-width: min(640px, calc(100vw - 680px));
		height: 100%;
		max-height: 100%;
		min-height: 0;
	}
	@media (max-width: 900px) {
		.panel {
			max-width: min(640px, 94vw);
		}
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 2px;
		align-items: center;
		flex-shrink: 0;
	}
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: #ffe8a3;
	}
	.title {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 2vw, 1.5rem);
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: #fff;
		text-align: center;
	}
	.aug-list {
		display: flex;
		gap: 0.8rem;
		justify-content: center;
		flex-wrap: wrap;
		flex-shrink: 0;
	}
	.aug-icon {
		width: 5.1rem;
		height: 5.1rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		transition: transform 120ms ease, filter 120ms ease;
	}
	.aug-icon:not(:disabled):hover {
		transform: translateY(-2px) scale(1.06);
	}
	.aug-icon.armed {
		transform: scale(1.08);
		filter: drop-shadow(0 0 8px #ffe8a3);
	}
	.aug-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.aug-icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.aug-icon .fb {
		font-family: var(--font-display);
		font-size: 0.55rem;
		text-align: center;
		color: #ffe8a3;
		line-height: 1;
	}
	.hint {
		margin: 0;
		font-size: 0.85rem;
		text-align: center;
		color: var(--color-parchment, #d8cfee);
		flex-shrink: 0;
	}
	.hint strong {
		color: #ffe8a3;
	}
	.hex-wrap {
		flex: 1;
		min-height: 0;
		width: 100%;
		display: grid;
		place-items: center;
	}
	.hex-wrap :global(.hex-grid) {
		width: 100%;
		height: 100%;
		max-height: 100%;
	}
</style>
