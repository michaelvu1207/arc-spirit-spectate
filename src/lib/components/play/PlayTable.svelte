<script lang="ts">
	import type { SeatColor, SpectatorProjection, SpiritWorldLocation } from '$lib/play/types';
	import { SPIRIT_WORLD_LOCATIONS } from '$lib/play/types';
	import { getAssetState, getSpiritAsset } from '$lib/stores/assetStore.svelte';

	interface Props {
		projection: SpectatorProjection;
		focusSeatColor?: SeatColor | null;
		canInteract?: boolean;
		pendingAction?: string | null;
		onTakeSpirit?: (marketIndex: number) => void;
		onSelectDestination?: (location: SpiritWorldLocation) => void;
		onCommitRound?: () => void;
	}

	type LocationTone = {
		eyebrow: string;
		name: SpiritWorldLocation;
		accent: string;
		background: string;
	};

	let {
		projection,
		focusSeatColor = null,
		canInteract = false,
		pendingAction = null,
		onTakeSpirit,
		onSelectDestination,
		onCommitRound
	}: Props = $props();

	const assetState = getAssetState();

	const locationTones: LocationTone[] = [
		{
			eyebrow: 'Spirit World',
			name: 'Floral Patch',
			accent: 'var(--brand-coral)',
			background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 196, 0.85), rgba(121, 201, 80, 0.45) 60%, rgba(34, 58, 22, 0.9))'
		},
		{
			eyebrow: 'Spirit World',
			name: 'Cyber City',
			accent: 'var(--brand-violet-soft)',
			background: 'radial-gradient(circle at 40% 30%, rgba(142, 215, 255, 0.78), rgba(101, 78, 216, 0.38) 58%, rgba(21, 25, 67, 0.92))'
		},
		{
			eyebrow: 'Special Location',
			name: 'Arcane Abyss',
			accent: 'var(--brand-magenta)',
			background: 'radial-gradient(circle at 50% 45%, rgba(255, 55, 221, 0.48), rgba(84, 0, 107, 0.68) 52%, rgba(17, 5, 24, 0.96))'
		},
		{
			eyebrow: 'Spirit World',
			name: 'Tidal Cove',
			accent: 'var(--brand-cyan)',
			background: 'radial-gradient(circle at 50% 30%, rgba(145, 232, 255, 0.82), rgba(48, 103, 180, 0.34) 56%, rgba(12, 32, 70, 0.94))'
		},
		{
			eyebrow: 'Spirit World',
			name: 'Lantern Canyon',
			accent: 'var(--brand-amber)',
			background: 'radial-gradient(circle at 60% 25%, rgba(255, 219, 166, 0.82), rgba(240, 117, 69, 0.42) 56%, rgba(61, 28, 14, 0.92))'
		}
	];

	const focusSeat = $derived(
		focusSeatColor ?? projection.viewer.seatColor ?? projection.activeSeats[0] ?? null
	);

	const focusPlayer = $derived(focusSeat ? projection.players[focusSeat] ?? null : null);

	const marketCards = $derived.by(() => {
		void assetState.spiritAssets;
		return projection.market.map((slot) => {
			const asset = slot.spiritId ? getSpiritAsset(slot.spiritId) : null;
			return {
				...slot,
				name: asset?.name ?? slot.spiritId ?? 'Empty slot',
				imageUrl: asset?.imageUrl ?? null,
				traits:
					asset?.traits.origins.map((origin) => origin.name).join(' / ') ||
					asset?.traits.classes.map((trait) => trait.name).join(' / ') ||
					null
			};
		});
	});

	const playersByDestination = $derived.by(() => {
		const map = new Map<SpiritWorldLocation, SeatColor[]>();
		for (const location of SPIRIT_WORLD_LOCATIONS) {
			map.set(location, []);
		}

		for (const seatColor of projection.activeSeats) {
			const player = projection.players[seatColor];
			if (!player?.navigationDestination) continue;
			if (!map.has(player.navigationDestination as SpiritWorldLocation)) continue;
			map.get(player.navigationDestination as SpiritWorldLocation)?.push(seatColor);
		}

		return map;
	});

	const currentDestination = $derived(focusPlayer?.navigationDestination ?? null);
</script>

<section class="board-root">
	<header class="board-header">
		<div>
			<div class="eyebrow">Spirit World</div>
			<h2>Room {projection.roomCode}</h2>
		</div>
		<div class="revision">Revision {projection.revision}</div>
	</header>

	<div class="market-row">
		{#each marketCards as card, index (`${card.index}:${card.spiritId ?? 'empty'}`)}
			<button
				type="button"
				class="market-card"
				disabled={!card.spiritId || !canInteract || pendingAction !== null}
				onclick={() => onTakeSpirit?.(index)}
			>
				<div class="market-badge">#{index + 1}</div>
				{#if card.imageUrl}
					<img src={card.imageUrl} alt={card.name} />
				{:else}
					<div class="market-fallback">{card.name.slice(0, 2).toUpperCase()}</div>
				{/if}
				<div class="market-meta">
					<strong>{card.name}</strong>
					{#if card.traits}
						<span>{card.traits}</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>

	<div class="map-grid">
		{#each locationTones as location (location.name)}
			<div class:abyss={location.name === 'Arcane Abyss'} class="location-card">
				<div class="location-surface" style:background={location.background}>
					<div class="location-frame">
						<div class="location-eyebrow">{location.eyebrow}</div>
						<div class="location-name" style={`--accent:${location.accent}`}>{location.name}</div>
					</div>
				</div>

				<div class="location-footer">
					<div class="occupants">
						{#each playersByDestination.get(location.name) ?? [] as seatColor (seatColor)}
							<span class:focused={seatColor === focusSeat} class="seat-token">{seatColor}</span>
						{/each}
					</div>
					{#if canInteract}
						<button
							type="button"
							class:active={currentDestination === location.name}
							class="destination-btn"
							disabled={pendingAction !== null}
							onclick={() => onSelectDestination?.(location.name)}
						>
							{currentDestination === location.name ? 'Chosen' : 'Navigate'}
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<footer class="board-footer">
		<div class="focus-summary">
			<div class="summary-label">Focused Seat</div>
			{#if focusSeat && focusPlayer}
				<div class="summary-row">
					<strong>{focusSeat} • {focusPlayer?.selectedGuardian}</strong>
					<span>{currentDestination ?? 'Destination pending'}</span>
				</div>
				<div class="summary-metrics">
					<span>Blood {focusPlayer?.blood}</span>
					<span>Barrier {focusPlayer?.barrier}</span>
					<span>VP {focusPlayer?.victoryPoints}</span>
				</div>
			{:else}
				<div class="summary-row">
					<strong>No focused seat</strong>
				</div>
			{/if}
		</div>

		{#if canInteract}
			<button
				type="button"
				class="commit-btn"
				disabled={pendingAction !== null}
				onclick={() => onCommitRound?.()}
			>
				Commit round
			</button>
		{/if}
	</footer>
</section>

<style>
	/* ── Board root: clean solid dark surface ─────────────── */
	.board-root {
		padding: 24px;
		border-radius: 2px;
		border: 1px solid var(--brand-violet);
		background: var(--color-obsidian);
	}

	.board-header,
	.board-footer,
	.summary-row,
	.summary-metrics,
	.location-footer,
	.market-row,
	.map-grid {
		display: flex;
	}

	.board-header,
	.board-footer {
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.eyebrow,
	.summary-label,
	.location-eyebrow,
	.revision {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}

	/* Room code in header: big Bebas Neue */
	.board-header h2 {
		margin: 6px 0 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 3vw, 3rem);
		letter-spacing: 0.04em;
		color: var(--brand-magenta);
		font-variant-numeric: tabular-nums;
		line-height: 0.95;
	}

	/* ── Spirit market ────────────────────────────────────── */
	.market-row {
		gap: 12px;
		margin-top: 20px;
		flex-wrap: wrap;
	}

	.market-card {
		width: 148px;
		border: 1px solid var(--color-mist);
		border-radius: 2px;
		background: var(--color-tomb);
		color: #fff;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		text-align: left;
		cursor: pointer;
		transition: border-color 150ms ease;
	}

	.market-card:hover:not(:disabled) {
		border-color: var(--brand-magenta);
	}

	.market-card img,
	.market-fallback {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 2px;
		object-fit: cover;
	}

	/* Fallback tile: solid dark block with accent triangle */
	.market-fallback {
		display: grid;
		place-items: center;
		background: var(--color-crypt);
		border: 1px solid var(--color-aether);
		font-family: var(--font-display);
		font-size: 2rem;
		color: var(--brand-magenta);
	}

	.market-badge {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		color: var(--brand-cyan);
	}

	.market-meta strong {
		display: block;
		font-size: 0.92rem;
		font-family: var(--font-display);
		letter-spacing: 0.04em;
	}

	.market-meta span {
		display: block;
		margin-top: 4px;
		font-size: 0.72rem;
		color: var(--color-fog);
	}

	/* ── Location map grid ───────────────────────────────── */
	.map-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
		margin-top: 22px;
	}

	.location-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Abyss gets magenta border — saturated, not muted */
	.location-card.abyss .location-surface {
		border-color: var(--brand-magenta);
	}

	/* Location hex tile: the background radial gradients are the location artwork, kept */
	.location-surface {
		position: relative;
		min-height: 250px;
		border-radius: 2px;
		border: 2px solid rgba(255, 255, 255, 0.18);
		clip-path: polygon(50% 0%, 92% 25%, 92% 75%, 50% 100%, 8% 75%, 8% 25%);
		overflow: hidden;
	}

	/* Location frame: very subtle scrim, not a full gradient panel */
	.location-frame {
		position: absolute;
		inset: 16px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 16px 14px;
		border-radius: 2px;
		background: rgba(10, 6, 18, 0.22);
	}

	/* Location name: bold Bebas Neue, one accent underline rule */
	.location-name {
		margin-top: auto;
		font-family: var(--font-display);
		font-size: clamp(1rem, 1.8vw, 1.55rem);
		letter-spacing: 0.04em;
		color: #fff;
		text-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
	}

	/* Single accent underline — the ONE embellishment per section */
	.location-name::after {
		content: '';
		display: block;
		width: 40px;
		height: 3px;
		margin-top: 8px;
		background: var(--accent);
	}

	.location-footer {
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.occupants {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-height: 30px;
	}

	.seat-token {
		padding: 4px 8px;
		border-radius: 2px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-parchment);
	}

	.seat-token.focused {
		border-color: var(--brand-cyan);
		color: var(--brand-cyan);
	}

	.destination-btn,
	.commit-btn {
		padding: 8px 12px;
		border-radius: 2px;
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 150ms ease, border-color 150ms ease;
	}

	/* Navigate button: outlined cyan, no fill */
	.destination-btn {
		background: transparent;
		color: var(--brand-cyan);
		border: 1px solid var(--brand-cyan);
	}

	.destination-btn:hover:not(:disabled) {
		background: rgba(36, 212, 255, 0.1);
	}

	/* Chosen destination: solid magenta */
	.destination-btn.active {
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
		color: #fff;
	}

	.focus-summary {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.summary-row {
		align-items: center;
		gap: 14px;
		color: var(--color-fog);
	}

	.summary-row strong {
		font-family: var(--font-display);
		font-size: 1.2rem;
		letter-spacing: 0.06em;
		color: #fff;
	}

	.summary-metrics {
		gap: 18px;
		flex-wrap: wrap;
		color: var(--color-parchment);
		font-size: 0.9rem;
	}

	/* Commit button: solid magenta block — no gradient */
	.commit-btn {
		background: var(--brand-magenta);
		border: none;
		color: #fff;
	}

	.commit-btn:hover:not(:disabled) {
		background: var(--brand-magenta-soft);
	}

	.commit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 1200px) {
		.map-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 820px) {
		.map-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.market-row {
			justify-content: center;
		}

		.board-footer {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
