<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchRatingLeaderboard } from '$lib/supabase';
	import { loadAssets, getGuardianAsset } from '$lib/stores/assetStore.svelte';
	import { toSortedChampions, rankLabel, type ChampionEntry } from '$lib/features/champions/champions';
	import { formatDateCompact } from '$lib/features/stats/format';
	import { playMenuSfx } from '$lib/stores/menuAudio.svelte';
	import ScreenScaffold from './ScreenScaffold.svelte';
	import HexPortrait from './HexPortrait.svelte';
	import StateMessage from './StateMessage.svelte';
	import PlayerDetailPanel from './PlayerDetailPanel.svelte';

	interface Props {
		backHref?: string;
		backLabel?: string;
	}
	let { backHref = '/play', backLabel = 'Menu' }: Props = $props();

	let entries = $state<ChampionEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastRefresh = $state<Date | null>(null);
	let search = $state('');
	let selectedUsername = $state<string | null>(null);

	// Rank is the index in the FULL sorted list so search preserves true global rank.
	const rankByKey = $derived(new Map(entries.map((e, i) => [e.usernameKey, i + 1])));

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return entries;
		return entries.filter((e) => e.username.toLowerCase().includes(q));
	});

	const podium = $derived(entries.slice(0, 3));

	/** rank → accent token, matching the web convention (1 amber, 2 cyan, 3 coral). */
	function rankAccent(rank: number): string {
		if (rank === 1) return 'var(--brand-amber)';
		if (rank === 2) return 'var(--brand-cyan)';
		if (rank === 3) return 'var(--brand-coral)';
		return 'var(--brand-magenta)';
	}

	async function refresh() {
		loading = true;
		error = null;
		try {
			const rows = await fetchRatingLeaderboard();
			entries = toSortedChampions(rows);
			lastRefresh = new Date();
		} catch (e) {
			console.error('Error fetching champions:', e);
			error = e instanceof Error ? e.message : 'Failed to fetch leaderboard';
		} finally {
			loading = false;
		}
	}

	function openDetail(username: string) {
		playMenuSfx('ui-click');
		selectedUsername = username;
	}

	const hover = () => playMenuSfx('ui-hover', { volume: 0.4 });

	onMount(() => {
		void loadAssets();
		void refresh();
	});
</script>

<ScreenScaffold
	eyebrow="Hall of Champions"
	title="Champions"
	subtitle="Placement-only OpenSkill ratings from verified games."
	syncedAt={lastRefresh}
	{backHref}
	{backLabel}
>
	{#snippet actions()}
		<div class="search-bare">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="7" />
				<path d="m21 21-4.3-4.3" stroke-linecap="round" />
			</svg>
			<input class="input-bare" bind:value={search} placeholder="Filter by name…" spellcheck="false" />
		</div>
		<button class="btn-ghost" type="button" onclick={refresh} onpointerenter={hover} disabled={loading}>
			<svg
				class={loading ? 'spin' : ''}
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
			Refresh
		</button>
	{/snippet}

	{#if loading && entries.length === 0}
		<StateMessage loading message="Tallying ascendant souls…" />
	{:else if error}
		<StateMessage tone="error" title="Could not summon leaderboard" message={error}>
			{#snippet actions()}
				<button class="btn-ghost" type="button" onclick={refresh}>Try Again</button>
			{/snippet}
		</StateMessage>
	{:else}
		<!-- ── PODIUM ─────────────────────────────────────────── -->
		{#if podium.length > 0}
			<section class="podium" aria-label="Top three">
				{#each podium as champ, i (champ.usernameKey)}
					{@const rank = i + 1}
					{@const accent = rankAccent(rank)}
					{@const last = champ.lastGames[0]}
					<button
						type="button"
						class="pod-card pod-rank-{rank}"
						style:--accent={accent}
						onclick={() => openDetail(champ.username)}
						onpointerenter={hover}
					>
						<div class="pod-rank-chip">
							<span class="pod-rank-num">{rank}</span>
							<span class="pod-rank-label">{rankLabel(rank)}</span>
						</div>
						<HexPortrait
							src={last ? getGuardianAsset(last.character)?.iconUrl : null}
							name={champ.username}
							alt={last?.character ?? champ.username}
							size={rank === 1 ? 64 : 56}
							{accent}
						/>
						<div class="pod-body">
							<div class="pod-name">{champ.username}</div>
							<div class="pod-stats">
								<span><b>{champ.gamesPlayed}</b> games</span>
								<span><b>{champ.winRatePct.toFixed(0)}%</b> wins</span>
								<span><b>{champ.avgPoints.toFixed(1)}</b> avg VP</span>
							</div>
						</div>
						{#if champ.rating != null}
							<div class="pod-rating-block">
								<div class="pod-rating-num">{champ.rating.toFixed(1)}</div>
								<div class="pod-rating-lab">Rating</div>
							</div>
						{/if}
					</button>
				{/each}
			</section>
		{/if}

		<!-- ── FULL STANDINGS ─────────────────────────────────── -->
		<div class="standings-head">
			<h2 class="standings-title">Full Standings</h2>
			<span class="standings-rule" aria-hidden="true"></span>
		</div>

		{#if filtered.length === 0}
			<StateMessage title="No players match this search" />
		{:else}
			<div class="lb-table" role="table">
				<div class="lb-head" role="row">
					<div role="columnheader">Rank</div>
					<div role="columnheader">Player</div>
					<div class="num" role="columnheader">Rating</div>
					<div class="num" role="columnheader">Games</div>
					<div class="num" role="columnheader">Win %</div>
					<div class="num col-vp" role="columnheader">Avg VP</div>
					<div class="num col-place" role="columnheader">Avg Place</div>
					<div class="col-recent" role="columnheader">Recent</div>
				</div>
				{#each filtered as entry (entry.usernameKey)}
					{@const rank = rankByKey.get(entry.usernameKey) ?? 0}
					{@const last = entry.lastGames[0]}
					<button
						type="button"
						class="lb-row"
						class:top={rank <= 3}
						role="row"
						onclick={() => openDetail(entry.username)}
						onpointerenter={hover}
					>
						<div class="rank-cell" role="cell">
							<span class="rank-chip rank-chip-{rank <= 3 ? rank : 'rest'}">{rank}</span>
						</div>
						<div class="player-cell" role="cell">
							<span class="player-name">{entry.username}</span>
							{#if last}
								<span class="player-meta">Last played {formatDateCompact(last.endedAt)}</span>
							{/if}
						</div>
						<div class="num" role="cell">
							{#if entry.rating != null}
								<span class="rating-num">{entry.rating.toFixed(1)}</span>
							{:else}<span class="dim">—</span>{/if}
						</div>
						<div class="num" role="cell">{entry.gamesPlayed}</div>
						<div class="num winrate" role="cell">
							<span>{entry.winRatePct.toFixed(1)}%</span>
							<div class="winrate-bar">
								<div class="winrate-fill" style:width={`${Math.min(100, entry.winRatePct)}%`}></div>
							</div>
						</div>
						<div class="num col-vp" role="cell">{entry.avgPoints.toFixed(1)}</div>
						<div class="num col-place" role="cell">{entry.avgPlacement.toFixed(2)}</div>
						<div class="recent-cell col-recent" role="cell">
							{#each entry.lastGames.slice(0, 5) as game (`${game.gameId}:${game.round}:${game.playerColor}`)}
								<span
									class="recent-hex"
									title={`${game.character} • ${game.victoryPoints} VP • Place ${game.placement}`}
								>
									<HexPortrait
										src={getGuardianAsset(game.character)?.iconUrl}
										name={game.character}
										alt={game.character}
										size={26}
									/>
								</span>
							{/each}
						</div>
					</button>
				{/each}
			</div>
		{/if}

		<div class="standings-foot">
			Showing <b>{filtered.length}</b> of <b>{entries.length}</b> champions
		</div>
	{/if}
</ScreenScaffold>

{#if selectedUsername}
	<PlayerDetailPanel username={selectedUsername} onClose={() => (selectedUsername = null)} />
{/if}

<style>
	/* ── Header actions: search + refresh ─────────────────── */
	.search-bare {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 220px;
	}
	.search-bare svg {
		position: absolute;
		left: 0;
		width: 16px;
		height: 16px;
		color: var(--color-fog);
		pointer-events: none;
	}
	.search-bare :global(.input-bare) {
		padding-left: 26px;
		min-width: 180px;
	}

	/* ── Podium ───────────────────────────────────────────── */
	.podium {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 48px;
	}
	.pod-card {
		display: grid;
		grid-template-columns: 132px 64px 1fr auto;
		align-items: center;
		gap: 22px;
		width: 100%;
		padding: 18px 22px;
		text-align: left;
		cursor: pointer;
		color: inherit;
		background: linear-gradient(180deg, rgba(20, 12, 36, 0.72), rgba(10, 6, 20, 0.72));
		border: 1px solid var(--color-mist);
		border-left: 4px solid var(--accent);
		border-radius: 12px;
		transition:
			border-color 240ms ease,
			background 240ms ease,
			transform 240ms ease;
	}
	.pod-card:hover,
	.pod-card:focus-visible {
		border-color: var(--brand-magenta);
		border-left-color: var(--accent);
		background: linear-gradient(180deg, rgba(40, 16, 52, 0.78), rgba(16, 8, 28, 0.78));
		transform: translateY(-2px);
		outline: none;
	}

	.pod-rank-chip {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.pod-rank-num {
		font-family: var(--font-display);
		font-size: 4rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
		color: var(--accent);
	}
	.pod-rank-1 .pod-rank-num {
		font-size: 4.8rem;
	}
	.pod-rank-label {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.pod-body {
		min-width: 0;
	}
	.pod-name {
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 1;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pod-rank-1 .pod-name {
		font-size: 2.5rem;
	}
	.pod-stats {
		display: flex;
		gap: 18px;
		margin-top: 8px;
		font-size: 0.8rem;
		color: var(--color-fog);
		font-family: var(--font-body);
		flex-wrap: wrap;
	}
	.pod-stats b {
		color: var(--color-bone);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		margin-right: 3px;
	}

	.pod-rating-block {
		text-align: right;
	}
	.pod-rating-num {
		font-family: var(--font-display);
		font-size: 2.6rem;
		line-height: 1;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.pod-rank-1 .pod-rating-num {
		font-size: 3.2rem;
	}
	.pod-rating-lab {
		margin-top: 4px;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	/* ── Standings heading ────────────────────────────────── */
	.standings-head {
		display: flex;
		align-items: center;
		gap: 18px;
		margin-bottom: 14px;
	}
	.standings-title {
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 4vmin, 2.6rem);
		line-height: 0.95;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--color-bone);
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 3px solid var(--brand-magenta);
	}
	.standings-rule {
		flex: 1;
		height: 1px;
		background: var(--gradient-flame);
		opacity: 0.5;
	}

	/* ── Standings table ──────────────────────────────────── */
	.lb-table {
		border-top: 1px solid var(--color-mist);
	}
	.lb-head,
	.lb-row {
		display: grid;
		grid-template-columns: 70px minmax(160px, 1.6fr) 84px 64px 120px 76px 92px minmax(180px, 1.2fr);
		align-items: center;
		gap: 16px;
		padding: 12px 8px;
		border-bottom: 1px solid var(--color-mist);
	}
	.lb-head {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.lb-row {
		position: relative;
		width: 100%;
		text-align: left;
		cursor: pointer;
		color: inherit;
		background: transparent;
		transition: background 180ms ease;
	}
	.lb-row::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: 0;
		height: 1px;
		background: var(--gradient-spectrum);
		transform: scaleX(0);
		transform-origin: left;
		opacity: 0.8;
		transition: transform 240ms ease;
	}
	.lb-row:hover,
	.lb-row:focus-visible {
		background: rgba(255, 43, 199, 0.05);
		outline: none;
	}
	.lb-row:hover::after,
	.lb-row:focus-visible::after {
		transform: scaleX(1);
	}
	.lb-row.top {
		background: rgba(255, 186, 61, 0.04);
	}

	.rank-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.1rem;
		height: 2.1rem;
		font-family: var(--font-display);
		font-size: 1.3rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--color-void);
		border-radius: 6px;
	}
	.rank-chip-1 {
		background: var(--brand-amber);
	}
	.rank-chip-2 {
		background: var(--brand-cyan);
	}
	.rank-chip-3 {
		background: var(--brand-coral);
	}
	.rank-chip-rest {
		background: transparent;
		color: var(--color-fog);
		font-size: 1.05rem;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--color-bone);
		font-family: var(--font-display);
		font-size: 1.05rem;
	}

	.player-cell {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.player-name {
		font-family: var(--font-display);
		font-size: 1.3rem;
		line-height: 1;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.player-meta {
		font-size: 0.8rem;
		color: var(--color-fog);
		letter-spacing: 0.04em;
		font-family: var(--font-mono);
	}

	.rating-num {
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--brand-magenta-soft);
	}
	.dim {
		color: var(--color-fog);
	}

	.winrate {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.winrate-bar {
		width: 90px;
		height: 2px;
		background: var(--color-mist);
	}
	.winrate-fill {
		height: 100%;
		background: var(--brand-magenta);
	}

	.recent-cell {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.recent-hex {
		display: block;
		transition: opacity 180ms ease;
	}
	.recent-hex:hover {
		opacity: 0.85;
	}

	/* ── Standings footer ─────────────────────────────────── */
	.standings-foot {
		margin-top: 22px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--color-fog);
	}
	.standings-foot b {
		color: var(--color-bone);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}

	/* Refresh-icon spin (the StateMessage primitive owns the loading ring). */
	.spin {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Responsive column drops (mirror the web page) ────── */
	@media (max-width: 1024px) {
		.lb-head,
		.lb-row {
			grid-template-columns: 62px minmax(150px, 1.6fr) 78px 60px 110px 72px 88px;
			gap: 12px;
		}
		.col-recent {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.pod-card {
			grid-template-columns: 78px 48px 1fr;
			gap: 14px;
			padding: 14px 14px;
		}
		.pod-rating-block,
		.pod-stats {
			display: none;
		}
		.pod-name {
			font-size: 1.4rem;
		}
		.pod-rank-1 .pod-name {
			font-size: 1.7rem;
		}
		.pod-rank-num {
			font-size: 2.8rem;
		}
		.pod-rank-1 .pod-rank-num {
			font-size: 3.2rem;
		}
		.lb-head,
		.lb-row {
			grid-template-columns: 50px 1fr 70px 56px;
			gap: 10px;
		}
		.col-vp,
		.col-place {
			display: none;
		}
		.search-bare {
			min-width: 0;
			flex: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pod-card,
		.lb-row::after {
			transition: none;
		}
		.pod-card:hover,
		.pod-card:focus-visible {
			transform: none;
		}
		.spin {
			animation: none;
		}
	}
</style>
