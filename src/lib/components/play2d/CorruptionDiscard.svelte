<script lang="ts">
	import type { getAssetState } from '$lib/stores/assetStore.svelte';
	import type { PlayerProjection } from '$lib/play/types';
	import { augmentIconForClass, spiritBackImageUrl } from './helpers';
	import HexGrid from '$lib/components/HexGrid.svelte';

	interface Props {
		/** The local (own) player who owes a forced corruption discard. */
		player: PlayerProjection | null;
		assets: ReturnType<typeof getAssetState>;
		spiritImages?: Map<string, string>;
		busy?: boolean;
		/** How many spirits must still be discarded (pendingCorruptionDiscard.count). */
		count: number;
		/** Discard one of your spirits by slot index. */
		onDiscard: (slotIndex: number) => void;
	}

	let { player, assets, spiritImages = new Map(), busy = false, count, onDiscard }: Props = $props();

	// Placed Spirit Augment badges (class-token icons), keyed by host spirit slot.
	const augmentsBySlot = $derived.by(() => {
		const map = new Map<number, { runeId: string; name: string; icon: string | null }[]>();
		for (const att of player?.spiritRuneAttachments ?? []) {
			const className = typeof att.className === 'string' ? att.className : null;
			if (!className) continue;
			const arr = map.get(att.spiritSlotIndex) ?? [];
			arr.push({
				runeId: att.runeId,
				name: `${className} Augment`,
				icon: augmentIconForClass(assets, className)
			});
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

	function discardHex(slot: number) {
		if (busy) return;
		onDiscard(slot);
	}
</script>

<div class="panel" data-testid="corruption-discard">
	<header class="head">
		<span class="eyebrow">Corruption</span>
		<span class="title">Discard {count} spirit{count === 1 ? '' : 's'}</span>
	</header>
	<p class="hint">You were corrupted — tap a spirit to send it back to the bag.</p>
	<div class="hex-wrap" data-testid="corruption-discard-hexes">
		<HexGrid
			spirits={player?.spirits ?? []}
			spiritAssets={spiritImages}
			{backImageBySlot}
			{augmentsBySlot}
			discardMode={!busy}
			onDiscard={discardHex}
		/>
	</div>
</div>

<style>
	/* In-stage panel — rendered inside MainStage's view, not a floating modal. */
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
		color: #ffb3b3;
	}
	.title {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 2vw, 1.5rem);
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: #fff;
		text-align: center;
	}
	.hint {
		margin: 0;
		font-size: 0.85rem;
		text-align: center;
		color: var(--color-blood, #ff8f8f);
		flex-shrink: 0;
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
