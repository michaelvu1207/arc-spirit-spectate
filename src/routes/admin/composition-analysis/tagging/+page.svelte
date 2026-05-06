<script lang="ts">
	import type { PageData } from './$types';
	import EmptyState from '$lib/components/composition-analysis/EmptyState.svelte';
	import { PLAYER_COLOR_HEX, type PlayerColor } from '$lib/types';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();

	let query = $state('');

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.untagged;
		return data.untagged.filter(
			(r) =>
				r.gameId.toLowerCase().includes(q) ||
				r.playerColor.toLowerCase().includes(q) ||
				(r.displayName ?? '').toLowerCase().includes(q)
		);
	});

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString();
		} catch {
			return iso.slice(0, 10);
		}
	}
</script>

{#if data.untagged.length === 0}
	<div class="tq-empty brand-panel">
		<EmptyState
			title="All caught up 🎉"
			description="Every (game, player) slot has a composition tag. New games sync from TTS will land here."
			variant="teal"
		/>
	</div>
{:else}
	<div class="tq">
		<header class="tq__head">
			<div>
				<span class="eyebrow">04 · UNTAGGED QUEUE</span>
				<h2 class="brand-flame-text">{data.untagged.length} need tagging</h2>
			</div>
			<input
				type="search"
				class="tq__search"
				bind:value={query}
				placeholder="Filter by game or player"
				aria-label="Filter untagged queue"
			/>
		</header>

		<ul class="tq__list" role="list">
			{#each filtered as r (r.gameId + r.playerColor)}
				{@const playerHex =
					PLAYER_COLOR_HEX[r.playerColor as PlayerColor] ?? 'var(--brand-cyan)'}
				<li>
					<a
						class="tq__row brand-panel"
						href="/admin/composition-analysis/tagging/{encodeURIComponent(
							r.gameId
						)}/{encodeURIComponent(r.playerColor)}"
					>
						<span class="tq__row-color" style="background:{playerHex}" aria-hidden="true"></span>
						<span class="tq__row-body">
							<span class="tq__row-name">{r.displayName ?? r.gameId.slice(0, 12)}</span>
							<span class="tq__row-meta">
								{r.playerColor} · {fmtDate(r.endedAt)}
								{#if r.totalRounds}· {r.totalRounds} rounds{/if}
							</span>
						</span>
						<span class="tq__row-go" aria-hidden="true">→</span>
					</a>
				</li>
			{:else}
				<li class="tq__empty-msg">No matches.</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.tq-empty {
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	.tq {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.tq__head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--color-mist);
	}

	.eyebrow {
		display: block;
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 4px;
	}

	.tq__head h2 {
		font-family: var(--font-display);
		font-size: 24px;
		margin: 0;
	}

	.tq__search {
		min-width: 280px;
		padding: 8px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 13px;
	}

	.tq__search:focus-visible {
		outline: none;
		border-color: var(--brand-cyan);
		box-shadow: 0 0 0 1px var(--brand-cyan);
	}

	.tq__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tq__row {
		display: grid;
		grid-template-columns: 16px 1fr 24px;
		gap: 14px;
		align-items: center;
		padding: 12px 16px;
		text-decoration: none;
		color: var(--color-parchment);
		transition: background-color 120ms ease-in-out;
	}

	.tq__row:hover {
		background: rgba(36, 212, 255, 0.06);
		color: var(--color-bone);
	}

	.tq__row:focus-visible {
		outline: none;
		box-shadow: 0 0 0 1px var(--brand-cyan);
	}

	.tq__row-color {
		width: 14px;
		height: 14px;
		border-radius: 9999px;
	}

	.tq__row-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.tq__row-name {
		font-family: var(--font-display);
		font-size: 14px;
	}

	.tq__row-meta {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-fog);
	}

	.tq__row-go {
		color: var(--brand-cyan);
		font-family: var(--font-display);
	}

	.tq__empty-msg {
		text-align: center;
		padding: 24px;
		color: var(--color-fog);
	}

	@media (prefers-reduced-motion: reduce) {
		.tq__row {
			transition: none;
		}
	}
</style>
