<script lang="ts">
	import HexGrid from '$lib/components/HexGrid.svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';
	import type { PlayerProjection } from '$lib/play/types';
	import { getAssetState, getGuardianAsset, getSpiritAsset } from '$lib/stores/assetStore.svelte';

	interface Props {
		player: PlayerProjection;
		isFocused?: boolean;
		isCurrentSeat?: boolean;
		onFocus?: () => void;
	}

	let { player, isFocused = false, isCurrentSeat = false, onFocus }: Props = $props();

	const assetState = getAssetState();

	function getStorageUrl(path: string | null): string | null {
		if (!path) return null;
		return path.startsWith('http') ? path : `${STORAGE_BASE_URL}/${path}`;
	}

	const guardian = $derived.by(() => {
		void assetState.guardianAssets;
		return getGuardianAsset(player.selectedGuardian);
	});

	const spiritImageMap = $derived.by(() => {
		void assetState.spiritAssets;
		const map = new Map<string, string>();
		for (const spirit of player.spirits) {
			const asset = getSpiritAsset(spirit.id);
			if (asset?.imageUrl) {
				map.set(spirit.id, asset.imageUrl);
			}
		}
		return map;
	});

	const runeSlots = $derived.by(() => {
		void assetState.runeAssets;
		return [1, 2, 3, 4].map((slotIndex) => {
			const slot = player.runes.find((entry) => entry.slotIndex === slotIndex && entry.hasRune) ?? null;
			const iconUrl =
				slot?.id && assetState.runeAssets.get(slot.id)?.icon_path
					? getStorageUrl(assetState.runeAssets.get(slot.id)?.icon_path ?? null)
					: null;
			return {
				slotIndex,
				slot,
				iconUrl
			};
		});
	});

	const statusIconUrl = $derived.by(() => {
		void assetState.statusIcons;
		if (!player.statusToken) return null;
		const icon = assetState.statusIcons.get(player.statusToken.toLowerCase());
		return icon ? getStorageUrl(icon.file_path) : null;
	});

	const potentialTokens = $derived.by(() => {
		const slots: Array<'barrier' | 'blood' | 'empty'> = [];
		const barrierCount = Math.max(0, Math.min(player.barrier, player.maxTokens));
		const bloodCount = Math.max(0, Math.min(player.blood, Math.max(0, player.maxTokens - barrierCount)));
		for (let index = 0; index < player.maxTokens; index += 1) {
			if (index < barrierCount) {
				slots.push('barrier');
			} else if (index < barrierCount + bloodCount) {
				slots.push('blood');
			} else {
				slots.push('empty');
			}
		}
		return slots;
	});

	const alignmentLabel = $derived(
		player.statusLevel <= 1 ? 'Pure' : player.statusLevel === 2 ? 'Tainted' : player.statusLevel === 3 ? 'Corrupt' : 'Fallen'
	);
</script>

<button
	type="button"
	class:focused={isFocused}
	class:current={isCurrentSeat}
	class="player-mat"
	onclick={() => onFocus?.()}
	style:background-image={guardian?.matUrl ? `linear-gradient(120deg, rgba(14, 10, 30, 0.86), rgba(14, 10, 30, 0.22)), url(${guardian.matUrl})` : undefined}
	aria-label={`Focus ${player.playerColor} ${player.selectedGuardian}`}
>
	<div class="mat-shell">
		<div class="tableau">
			<div class="tableau-grid">
				<HexGrid spirits={player.spirits} spiritAssets={spiritImageMap} />
			</div>
		</div>

		<div class="resource-rail">
			<div class="limit-chip">7 Spirit Limit</div>
			<div class="alignment-chip">{alignmentLabel}</div>

			<div class="rune-column">
				{#each runeSlots as rune}
					<div class="rune-slot">
						{#if rune.iconUrl}
							<img src={rune.iconUrl} alt={rune.slot?.name ?? `Rune slot ${rune.slotIndex}`} />
						{/if}
					</div>
				{/each}
				<div class="status-slot">
					{#if statusIconUrl}
						<img src={statusIconUrl ?? ''} alt={player.statusToken ?? 'Status token'} />
					{:else}
						<span>{player.statusLevel}</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="guardian-panel">
			<div class="guardian-meta">
				<div class="seat-pill">{player.playerColor}</div>
				{#if guardian?.origin}
					<div class="origin-pill">{guardian.origin?.name}</div>
				{/if}
			</div>

			<div class="guardian-figure">
				{#if guardian?.chibiUrl}
					<img src={guardian.chibiUrl ?? ''} alt={player.selectedGuardian} />
				{/if}
			</div>

			<div class="guardian-name">{player.selectedGuardian}</div>

			<div class="status-strip">
				<div class="metric">
					<span>Barrier</span>
					<strong>{player.barrier}</strong>
				</div>
				<div class="metric">
					<span>Blood</span>
					<strong>{player.blood}</strong>
				</div>
				<div class="metric">
					<span>VP</span>
					<strong>{player.victoryPoints}</strong>
				</div>
			</div>

			<div class="potential-track">
				<div class="potential-label">Potential</div>
				<div class="tokens">
					{#each potentialTokens as tokenState, index (`${player.playerColor}:${index}`)}
						<div class:barrier={tokenState === 'barrier'} class:blood={tokenState === 'blood'} class="token">
							{#if tokenState === 'empty'}
								<span>{index + 1}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</button>

<style>
	/* ── Player mat: single solid block, left-edge player-color stripe ─ */
	.player-mat {
		position: relative;
		display: block;
		width: 100%;
		padding: 0;
		/* Single 1px border — color tinted by player color identity via CSS var
		   set inline on parent. Fallback to violet. */
		border: 1px solid var(--player-color, var(--brand-violet));
		border-left: 4px solid var(--player-color, var(--brand-violet));
		border-radius: 2px;
		overflow: hidden;
		background-color: var(--color-tomb);
		background-size: cover;
		background-position: center;
		text-align: left;
		color: #fff;
		transition: border-color 180ms ease;
	}

	.player-mat:hover {
		border-color: var(--brand-magenta-soft);
		border-left-color: var(--brand-magenta);
	}

	/* Focused: swap to saturated magenta border */
	.player-mat.focused {
		border-color: var(--brand-magenta);
		border-left-color: var(--brand-magenta);
	}

	/* Current player seat: cyan border */
	.player-mat.current {
		border-color: var(--brand-cyan);
		border-left-color: var(--brand-cyan);
	}

	.mat-shell {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) 128px minmax(280px, 0.85fr);
		min-height: 310px;
	}

	.tableau {
		padding: 18px 16px 18px 18px;
		display: flex;
		align-items: stretch;
	}

	/* Hex grid area: single border, no gradient fill */
	.tableau-grid {
		width: 100%;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--color-aether);
		padding: 12px;
	}

	.resource-rail {
		position: relative;
		padding: 18px 12px 18px 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	/* Spirit limit chip: solid amber block */
	.limit-chip {
		padding: 5px 8px;
		border-radius: 2px;
		font-family: var(--font-display);
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		background: var(--brand-amber);
		color: var(--color-void);
	}

	/* Alignment chip: solid block, color reflects alignment */
	.alignment-chip {
		padding: 5px 8px;
		border-radius: 2px;
		font-family: var(--font-display);
		font-size: 0.64rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.88);
		color: var(--color-obsidian);
	}

	.rune-column {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}

	.rune-slot,
	.status-slot {
		width: 44px;
		height: 44px;
		border-radius: 2px;
		border: 1px solid var(--color-aether);
		background: var(--color-shadow);
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.rune-slot img,
	.status-slot img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.status-slot span {
		font-family: var(--font-display);
		font-size: 0.9rem;
	}

	.guardian-panel {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 18px 20px 18px 0;
	}

	.guardian-meta {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	/* Seat and origin labels: flat bordered chips */
	.seat-pill,
	.origin-pill {
		padding: 4px 8px;
		border-radius: 2px;
		background: transparent;
		border: 1px solid var(--color-mist);
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-parchment);
	}

	.guardian-figure {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-right: 12px;
	}

	.guardian-figure img {
		max-height: 150px;
		width: auto;
		filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.55));
	}

	/* Guardian name: large Bebas Neue, solid block beneath figure */
	.guardian-name {
		align-self: flex-end;
		margin-top: auto;
		padding: 8px 18px;
		background: var(--color-shadow);
		border-top: 1px solid var(--color-aether);
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 2.2vw, 2.8rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
	}

	/* Stats strip: solid block, no gradient */
	.status-strip {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px 8px;
		background: var(--color-shadow);
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.metric span {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-fog);
		font-family: var(--font-display);
	}

	/* Metric values: big Bebas Neue tabular numerals */
	.metric strong {
		font-family: var(--font-display);
		font-size: 1.6rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: #fff;
	}

	/* Potential track: solid dark block, no gradient */
	.potential-track {
		padding: 10px 18px 16px;
		background: var(--color-crypt);
		border-top: 1px solid var(--color-mist);
	}

	.potential-label {
		font-family: var(--font-display);
		font-size: 0.68rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.tokens {
		display: grid;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		gap: 6px;
		margin-top: 10px;
	}

	.token {
		aspect-ratio: 1;
		border-radius: 2px;
		border: 1px solid var(--color-aether);
		background: var(--color-shadow);
		display: grid;
		place-items: center;
		font-family: var(--font-display);
		font-size: 0.62rem;
		color: var(--color-whisper);
	}

	/* Barrier tokens: saturated cyan solid */
	.token.barrier {
		background: var(--brand-cyan);
		border-color: var(--brand-cyan);
		color: var(--color-void);
	}

	/* Blood tokens: saturated magenta solid */
	.token.blood {
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
		color: var(--color-bone);
	}

	@media (max-width: 1100px) {
		.mat-shell {
			grid-template-columns: minmax(0, 1fr);
			min-height: auto;
		}

		.resource-rail {
			order: 3;
			flex-direction: row;
			padding: 0 18px 18px;
			justify-content: space-between;
		}

		.rune-column {
			flex-direction: row;
			margin-top: 0;
		}

		.guardian-panel {
			padding: 0 18px 18px;
		}
	}
</style>
