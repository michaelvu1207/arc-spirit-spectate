<script lang="ts">
	import type { SidebarGame } from '../../../routes/admin/composition-analysis/+layout.server';
	import { compositionAnalysisStore as store } from '$lib/stores/compositionAnalysis.svelte';

	interface Props {
		games: SidebarGame[];
	}
	let { games }: Props = $props();

	let query = $state('');

	const filteredGames = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return games;
		return games.filter((g) => {
			const name = (g.displayName ?? g.gameId).toLowerCase();
			return name.includes(q) || g.gameId.toLowerCase().includes(q);
		});
	});

	const selectedCount = $derived(store.selectedGameIds.size);

	function fmtRelative(iso: string | null): string {
		if (!iso) return '—';
		try {
			const d = new Date(iso);
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		} catch {
			return iso.slice(0, 10);
		}
	}
</script>

<div class="sb">
	<div class="sb__sticky">
		<div class="sb__search">
			<input
				type="search"
				bind:value={query}
				placeholder="Search games"
				aria-label="Filter games by name or id"
			/>
		</div>

		<div class="sb__chips">
			{#if selectedCount > 0}
				<button class="sb__chip sb__chip--active" type="button" onclick={() => store.clearSelection()}>
					{selectedCount} selected · clear
				</button>
			{:else}
				<span class="sb__chip">All games</span>
			{/if}
			<span class="sb__count">{filteredGames.length} of {games.length}</span>
		</div>
	</div>

	<ul class="sb__list" role="list">
		{#each filteredGames as g (g.gameId)}
			{@const checked = store.isGameSelected(g.gameId)}
			{@const allTagged = g.playerCount > 0 && g.taggedCount === g.playerCount}
			<li>
				<button
					class="sb__row"
					class:sb__row--checked={checked}
					class:sb__row--complete={allTagged}
					type="button"
					onclick={() => store.toggleGame(g.gameId)}
					title={g.gameId}
				>
					<span class="sb__row-marker" aria-hidden="true">{checked ? '✓' : ''}</span>
					<span class="sb__row-body">
						<span class="sb__row-name">
							{g.displayName ?? g.gameId.slice(0, 8)}
							{#if allTagged}
								<span class="sb__row-flag" title="all players tagged">●</span>
							{/if}
						</span>
						<span class="sb__row-meta">
							{fmtRelative(g.endedAt)}
							{#if g.totalRounds}· r{g.totalRounds}{/if}
							· {g.taggedCount}/{g.playerCount} tagged
						</span>
					</span>
				</button>
			</li>
		{:else}
			<li class="sb__empty">No games match.</li>
		{/each}
	</ul>
</div>

<style>
	.sb {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	.sb__sticky {
		position: sticky;
		top: 0;
		padding: 16px 16px 12px;
		background: var(--color-obsidian);
		border-bottom: 1px solid var(--color-mist);
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 1;
	}

	.sb__search input {
		width: 100%;
		padding: 8px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 13px;
	}

	.sb__search input:focus-visible {
		outline: none;
		border-color: var(--brand-cyan);
		box-shadow: 0 0 0 1px var(--brand-cyan);
	}

	.sb__chips {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.sb__chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-family: var(--font-display);
		color: var(--color-fog);
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 9999px;
	}

	button.sb__chip {
		cursor: pointer;
	}

	.sb__chip--active {
		color: var(--color-void);
		background: var(--brand-cyan);
		border-color: var(--brand-cyan);
	}

	.sb__count {
		font-size: 11px;
		color: var(--color-fog);
		font-family: var(--font-mono);
	}

	.sb__list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.sb__row {
		display: grid;
		grid-template-columns: 18px 1fr;
		gap: 8px;
		width: 100%;
		text-align: left;
		padding: 10px 16px;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--color-shadow);
		color: var(--color-parchment);
		cursor: pointer;
		font-family: var(--font-body);
		transition: background-color 120ms ease-in-out;
	}

	.sb__row:hover {
		background: var(--color-shadow);
	}

	.sb__row--checked {
		background: rgba(36, 212, 255, 0.08);
		color: var(--color-bone);
	}

	.sb__row-marker {
		color: var(--brand-cyan);
		font-family: var(--font-mono);
		font-weight: 700;
		text-align: center;
	}

	.sb__row-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.sb__row-name {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sb__row-flag {
		color: var(--brand-teal);
		font-size: 10px;
	}

	.sb__row-meta {
		font-size: 11px;
		color: var(--color-fog);
		font-family: var(--font-mono);
	}

	.sb__empty {
		padding: 24px 16px;
		color: var(--color-fog);
		font-size: 13px;
		text-align: center;
	}

	@media (prefers-reduced-motion: reduce) {
		.sb__row {
			transition: none;
		}
	}
</style>
