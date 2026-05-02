<script lang="ts">
	import HexGrid from '$lib/components/HexGrid.svelte';
	import type { HandDrawSnapshot, RuneSlotSnapshot, Spirit } from '$lib/types';

	interface Props {
		playerColor: 'Red' | 'Blue' | 'Orange' | 'Green' | 'Purple' | 'Yellow';
		characterName: string;
		spirits: Spirit[];
		blood: number;
		barrier: number;
		statusLevel: number;
		statusToken: string | null;
		victoryPoints: number;
		runes: RuneSlotSnapshot[];
		handDraws: HandDrawSnapshot[];
		spiritAssets: Map<string, string>;
		runeIcons: Map<string, string>;
		statusIcons: Map<string, string>; // key: lower(statusToken)
		guardianAssets: Map<string, string>;
		isLoading?: boolean;
	}

	const PLAYER_COLORS: Record<
		string,
		{ bg: string; border: string; text: string; accent: string; glow: string }
	> = {
		Red: {
			bg: 'bg-red-500',
			border: 'border-red-500',
			text: 'text-red-500',
			accent: 'bg-red-600',
			glow: 'shadow-red-500/20'
		},
		Blue: {
			bg: 'bg-blue-500',
			border: 'border-blue-500',
			text: 'text-blue-500',
			accent: 'bg-blue-600',
			glow: 'shadow-blue-500/20'
		},
		Orange: {
			bg: 'bg-orange-500',
			border: 'border-orange-500',
			text: 'text-orange-500',
			accent: 'bg-orange-600',
			glow: 'shadow-orange-500/20'
		},
		Green: {
			bg: 'bg-green-500',
			border: 'border-green-500',
			text: 'text-green-500',
			accent: 'bg-green-600',
			glow: 'shadow-green-500/20'
		},
		Purple: {
			bg: 'bg-purple-500',
			border: 'border-purple-500',
			text: 'text-purple-500',
			accent: 'bg-purple-600',
			glow: 'shadow-purple-500/20'
		},
		Yellow: {
			bg: 'bg-yellow-500',
			border: 'border-yellow-500',
			text: 'text-yellow-500',
			accent: 'bg-yellow-600',
			glow: 'shadow-yellow-500/20'
		}
	};

	let {
		playerColor,
		characterName,
		spirits,
		blood,
		barrier,
		statusLevel,
		statusToken,
		victoryPoints,
		runes,
		handDraws,
		spiritAssets,
		runeIcons,
		statusIcons,
		guardianAssets,
		isLoading = false
	}: Props = $props();

	const colors = $derived(PLAYER_COLORS[playerColor] ?? PLAYER_COLORS.Red);
	const guardianIconUrl = $derived(guardianAssets.get(characterName) ?? '');

	const runeSlots = $derived(() => {
		const bySlot = new Map((runes ?? []).map((r) => [r.slotIndex, r]));
		return [1, 2, 3, 4].map((slotIndex) => bySlot.get(slotIndex) ?? { slotIndex, hasRune: false });
	});

	const displayHandDraws = $derived(() => (handDraws ?? []).slice(0, 8));
	const statusDisplay = $derived(() => (statusToken ? `${statusToken} (${statusLevel})` : '—'));
	const statusIconUrl = $derived(() =>
		statusToken ? (statusIcons.get(statusToken.toLowerCase()) ?? null) : null
	);

	function formatBagLabel(name?: string): string {
		if (!name) return '';
		if (name === 'Spirit World Bag') return 'Spirit World';
		if (name === 'Abyss Fallen Spirits') return 'Abyss Fallen';
		return name.replace(/ Bag$/, '');
	}
</script>

{#if isLoading}
	<!-- Loading Skeleton -->
	<div
		class="player-panel-skeleton brand-panel flex flex-col overflow-hidden shadow-lg"
	>
		<!-- Header Skeleton -->
		<div class="flex items-center gap-3 px-4 py-3" style="background: rgba(34, 20, 64, 0.5)">
			<div class="skeleton-pulse h-10 w-1.5 rounded-full" style="background: var(--color-mist)"></div>
			<div class="skeleton-pulse h-10 w-10 rounded-full" style="background: var(--color-mist)"></div>
			<div class="flex flex-1 items-end justify-between gap-3">
				<div class="flex flex-col gap-1.5">
					<div class="skeleton-pulse h-3 w-12 rounded" style="background: var(--color-mist)"></div>
					<div class="skeleton-pulse h-5 w-24 rounded" style="background: var(--color-mist)"></div>
				</div>
				<div class="flex flex-wrap items-center justify-end gap-1.5">
					<div class="skeleton-pulse h-5 w-10 rounded-full" style="background: var(--color-mist)"></div>
					<div class="skeleton-pulse h-5 w-10 rounded-full" style="background: var(--color-mist)"></div>
					<div class="skeleton-pulse h-5 w-16 rounded-full" style="background: var(--color-mist)"></div>
					<div class="skeleton-pulse h-5 w-10 rounded-full" style="background: var(--color-mist)"></div>
				</div>
			</div>
		</div>

		<!-- Grid Skeleton -->
		<div class="panel-body flex flex-1 items-center justify-center px-4 py-4">
			<HexGrid isLoading={true} />
		</div>
	</div>
{:else}
	<div
		class="player-panel brand-panel flex flex-col overflow-hidden shadow-lg transition-all duration-300 {colors.glow}"
	>
		<!-- Header -->
		<div class="panel-header flex items-center gap-3 px-5 py-4">
			<!-- Color accent bar — player identity, kept as data -->
			<div class="h-12 w-1.5 shrink-0 rounded-full {colors.bg}"></div>

			<!-- Guardian icon -->
			{#if guardianIconUrl}
				<img
					src={guardianIconUrl}
					alt={characterName}
					class="h-12 w-12 rounded-full border-2 object-cover {colors.border}"
				/>
			{:else}
				<div
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 {colors.border}"
					style="background: var(--color-crypt)"
				>
					<span style="color: var(--color-fog); font-family: var(--font-display); font-size: 1.5rem">
						{characterName.charAt(0).toUpperCase()}
					</span>
				</div>
			{/if}

			<!-- Player info -->
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<span class="eyebrow {colors.text}" style="font-size: 0.6rem">{playerColor}</span>
				<span class="character-name min-w-0 truncate">{characterName}</span>

				<!-- Stats row — big numbers in display font -->
				<div class="mt-1 flex items-end gap-4">
					<div class="stat-hero" title="Victory Points">
						<span class="stat-hero-num" style="color: var(--brand-amber)">{victoryPoints}</span>
						<span class="stat-hero-label">VP</span>
					</div>
					<div class="stat-hero" title="Arcane Blood">
						<span class="stat-hero-num" style="color: var(--color-blood)">{blood}</span>
						<span class="stat-hero-label">BLD</span>
					</div>
					<div class="stat-hero" title="Barrier">
						<span class="stat-hero-num" style="color: var(--brand-cyan)">{barrier}</span>
						<span class="stat-hero-label">BAR</span>
					</div>
					<div
						class="status-chip ml-auto flex max-w-[9rem] items-center gap-1 rounded px-2 py-0.5 text-xs"
						title={`Status: ${statusDisplay()}`}
					>
						{#if statusIconUrl()}
							<img
								src={statusIconUrl() ?? ''}
								alt={statusToken ?? 'Status'}
								class="h-3.5 w-3.5 rounded-full object-contain"
								loading="lazy"
							/>
						{:else}
							<span style="color: var(--brand-magenta-soft)">✦</span>
						{/if}
						<span class="truncate" style="color: var(--color-parchment)">{statusDisplay()}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Spirit Grid -->
		<div class="panel-body flex flex-1 flex-col items-center justify-center gap-4 px-4 py-5">
			<HexGrid {spirits} {spiritAssets} />

			<!-- Runes + Hand Draws -->
			<div class="w-full max-w-sm space-y-3">
				<!-- Rune Slots -->
				<div class="flex items-center justify-between gap-3">
					<span class="eyebrow" style="font-size: 0.65rem">Runes</span>
					<div class="flex items-center gap-2">
						{#each runeSlots() as rune (rune.slotIndex)}
							{@const runeIconUrl =
								rune.hasRune && rune.id ? (runeIcons.get(rune.id) ?? null) : null}
							<div
								class="rune-token flex items-center justify-center overflow-hidden rounded border uppercase"
								class:filled={rune.hasRune}
								title={`Slot ${rune.slotIndex}: ${rune.hasRune ? (rune.name ?? 'Rune') : 'Empty'}`}
								aria-label={`Rune slot ${rune.slotIndex}: ${rune.hasRune ? (rune.name ?? 'Rune') : 'Empty'}`}
							>
								{#if runeIconUrl}
									<img
										src={runeIconUrl}
										alt={rune.name ?? 'Rune'}
										class="h-full w-full object-contain p-0.5"
										loading="lazy"
									/>
								{:else if rune.hasRune}
									<span style="font-family: var(--font-display); font-size: 0.7rem">{(rune.name ?? 'R').slice(0, 1)}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Hand Draws This Navigation -->
				{#if displayHandDraws().length > 0}
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="eyebrow" style="font-size: 0.65rem">Hand Draws</span>
							<span class="tabular-nums text-xs" style="color: var(--color-whisper)">{handDraws.length}</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each displayHandDraws() as draw, i (`${draw.guid ?? 'draw'}-${i}`)}
								<span
									class="draw-chip max-w-[12rem] truncate rounded px-2 py-0.5 text-[11px]"
									title={`${draw.name ?? 'Unknown'}${draw.cost != null ? ` (Cost ${draw.cost})` : ''}${draw.sourceBag ? ` — ${formatBagLabel(draw.sourceBag)}` : ''}`}
								>
									<span style="color: var(--color-parchment)">{draw.name ?? 'Unknown'}</span>
									{#if draw.cost != null}
										<span style="color: var(--color-fog)"> · {draw.cost}</span>
									{/if}
									{#if draw.sourceBag}
										<span style="color: var(--color-whisper)"> · {formatBagLabel(draw.sourceBag)}</span>
									{/if}
								</span>
							{/each}
						</div>
						{#if handDraws.length > displayHandDraws().length}
							<div class="text-[10px]" style="color: var(--color-whisper)">
								Showing {displayHandDraws().length} of {handDraws.length}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.skeleton-pulse {
		animation: skeleton-pulse 1.5s ease-in-out infinite;
	}

	@keyframes skeleton-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.player-panel {
		animation: fade-in 0.3s ease-out;
	}

	.panel-header {
		background: var(--color-crypt);
		border-bottom: 1px solid var(--color-mist);
	}

	.panel-body {
		background: var(--color-shadow);
	}

	/* Character name — Bebas Neue, prominent */
	.character-name {
		font-family: var(--font-display);
		font-size: clamp(1.2rem, 2.5vw, 1.6rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-bone);
		line-height: 1;
	}

	/* Big stat trio */
	.stat-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}
	.stat-hero-num {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 3vw, 2rem);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.stat-hero-label {
		font-family: var(--font-display);
		font-size: 0.5rem;
		letter-spacing: 0.2em;
		color: var(--color-whisper);
		text-transform: uppercase;
	}

	.status-chip {
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
	}

	.draw-chip {
		border: 1px solid var(--color-mist);
		background: var(--color-tomb);
	}

	.rune-token {
		height: 20px;
		width: 20px;
		border-color: var(--color-mist);
		background: var(--color-shadow);
		color: var(--color-fog);
	}

	.rune-token.filled {
		border-color: var(--brand-magenta);
		background: var(--color-tomb);
		color: var(--color-bone);
	}

	@media (min-width: 1024px) {
		.rune-token {
			height: 22px;
			width: 22px;
		}
	}

	@keyframes fade-in {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
