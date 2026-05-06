<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import HexGrid from '$lib/components/HexGrid.svelte';
	import EmptyState from '$lib/components/composition-analysis/EmptyState.svelte';
	import { compositionAnalysisStore as store } from '$lib/stores/compositionAnalysis.svelte';
	import { PLAYER_COLOR_HEX, type PlayerColor } from '$lib/types';
	import type { Composition } from '$lib/compositions/schema';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();

	const playerHex = $derived(
		PLAYER_COLOR_HEX[data.playerColor as PlayerColor] ?? '#24d4ff'
	);

	let roundIndex = $state(data.snapshots.length > 0 ? data.snapshots.length - 1 : 0);
	const currentSnapshot = $derived(data.snapshots[roundIndex] ?? null);

	let pickerQuery = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let saveOk = $state(false);

	const visibleComps = $derived.by(() => {
		const list = data.compositions.filter((c) => !c.is_reference && (store.showArchived || c.is_active));
		const q = pickerQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter((c) => {
			const name = c.name.toLowerCase();
			if (name.startsWith(q)) return true;
			return name.includes(q);
		});
	});

	let highlightedIdx = $state(0);

	function selectComp(idx: number): void {
		highlightedIdx = Math.max(0, Math.min(visibleComps.length - 1, idx));
	}

	async function saveTag(comp: Composition, advance: boolean): Promise<void> {
		saving = true;
		saveError = null;
		saveOk = false;
		try {
			const res = await fetch('/api/player-compositions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game_id: data.gameId,
					player_color: data.playerColor,
					composition_id: comp.id
				})
			});
			if (!res.ok) {
				throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
			}
			saveOk = true;
			if (advance) {
				// Re-load the queue to pick the next untagged player.
				const queueRes = await fetch('/admin/composition-analysis/tagging/__data.json').catch(
					() => null
				);
				const next = await pickNextUntagged(queueRes).catch(() => null);
				if (next) {
					await goto(
						`/admin/composition-analysis/tagging/${encodeURIComponent(
							next.gameId
						)}/${encodeURIComponent(next.playerColor)}`,
						{ invalidateAll: true }
					);
				} else {
					await goto('/admin/composition-analysis/tagging', { invalidateAll: true });
				}
			} else {
				await invalidateAll();
			}
		} catch (err) {
			saveError = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function pickNextUntagged(
		_response: Response | null
	): Promise<{ gameId: string; playerColor: string } | null> {
		// SvelteKit __data.json varies by version; fall back to a fresh fetch through
		// our queue page server load by hitting the route's raw URL via fetch.
		// Simpler: fetch a JSON endpoint listing untagged. We don't have a dedicated
		// API, so fall back to navigating to the queue page (caller handles that).
		return null;
	}

	function onPickerKey(evt: KeyboardEvent): void {
		if (evt.key === 'ArrowDown') {
			evt.preventDefault();
			selectComp(highlightedIdx + 1);
		} else if (evt.key === 'ArrowUp') {
			evt.preventDefault();
			selectComp(highlightedIdx - 1);
		} else if (evt.key === 'Enter') {
			evt.preventDefault();
			const comp = visibleComps[highlightedIdx];
			if (comp) void saveTag(comp, true);
		} else if (evt.key === 'Escape') {
			pickerQuery = '';
		}
	}

	function fmtTimestamp(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}
</script>

<div class="tag">
	<header class="tag__head">
		<div>
			<a href="/admin/composition-analysis/tagging" class="tag__back">← Back to queue</a>
			<h2 class="brand-flame-text">
				<span class="tag__color-dot" style="background:{playerHex}" aria-hidden="true"></span>
				{data.playerColor} · {data.gameId.slice(0, 12)}
			</h2>
			{#if data.existingTag}
				<p class="tag__meta tag__meta--warn">
					Already tagged as <strong>{data.existingTag.tag}</strong>. Re-tagging will overwrite.
				</p>
			{:else}
				<p class="tag__meta">{data.snapshots.length} snapshots · ready to tag</p>
			{/if}
		</div>
	</header>

	{#if data.snapshots.length === 0}
		<div class="tag__empty brand-panel">
			<EmptyState
				title="No snapshots for this player"
				description="The TTS sync didn't capture any rounds for {data.playerColor} in this game."
				variant="amber"
			/>
		</div>
	{:else}
		<section class="tag__board brand-panel">
			<header class="tag__board-head">
				<span class="eyebrow">ROUND {currentSnapshot?.round ?? 0} / {data.snapshots.at(-1)?.round ?? 0}</span>
				<span class="tag__board-meta">
					VP: {currentSnapshot?.victoryPoints ?? 0} · {fmtTimestamp(currentSnapshot?.timestamp ?? null)}
				</span>
			</header>

			<div class="tag__hex-wrap">
				{#if currentSnapshot}
					{#key currentSnapshot.round}
						<HexGrid spirits={currentSnapshot.spirits} />
					{/key}
				{/if}
			</div>

			<div class="tag__slider">
				<input
					type="range"
					min="0"
					max={data.snapshots.length - 1}
					bind:value={roundIndex}
					aria-label="Round slider"
				/>
				<div class="tag__slider-rounds" aria-hidden="true">
					{#each data.snapshots as s, i (s.round)}
						<button
							class="tag__slider-tick"
							class:tag__slider-tick--active={i === roundIndex}
							type="button"
							onclick={() => (roundIndex = i)}
							title="Round {s.round}"
							aria-label="Jump to round {s.round}"
						>
							{s.round}
						</button>
					{/each}
				</div>
			</div>
		</section>

		<aside class="tag__picker brand-panel">
			<header class="tag__picker-head">
				<span class="eyebrow">PICK COMPOSITION</span>
				<label class="tag__archived-toggle">
					<input
						type="checkbox"
						checked={store.showArchived}
						onchange={(e) =>
							store.setShowArchived((e.currentTarget as HTMLInputElement).checked)}
					/>
					Show archived
				</label>
			</header>

			<input
				type="search"
				class="tag__picker-search"
				bind:value={pickerQuery}
				oninput={() => (highlightedIdx = 0)}
				onkeydown={onPickerKey}
				placeholder="Type to filter, ↑/↓ navigate, Enter to assign + advance"
				aria-label="Filter compositions"
			/>

			<ul class="tag__picker-list" role="listbox" aria-label="Compositions">
				{#each visibleComps as c, i (c.id)}
					<li>
						<button
							class="tag__picker-row"
							class:tag__picker-row--highlight={i === highlightedIdx}
							class:tag__picker-row--archived={!c.is_active}
							type="button"
							role="option"
							aria-selected={i === highlightedIdx}
							onmouseenter={() => (highlightedIdx = i)}
							onclick={() => void saveTag(c, true)}
						>
							<span class="tag__picker-swatch" style="background:{c.color}"></span>
							<span class="tag__picker-name">{c.name}</span>
							{#if c.category}<span class="tag__picker-cat">{c.category}</span>{/if}
							{#if !c.is_active}<span class="tag__picker-warn">archived</span>{/if}
						</button>
					</li>
				{:else}
					<li class="tag__picker-empty">
						No compositions match. Create one in the Library tab first.
					</li>
				{/each}
			</ul>

			<footer class="tag__picker-foot">
				{#if saving}
					<span class="tag__status tag__status--saving">Saving…</span>
				{:else if saveError}
					<span class="tag__status tag__status--error">{saveError}</span>
				{:else if saveOk}
					<span class="tag__status tag__status--ok">Saved</span>
				{:else}
					<span class="tag__status">Pick to tag, then go back to queue.</span>
				{/if}
			</footer>
		</aside>
	{/if}
</div>

<style>
	.tag {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		grid-template-areas:
			'head head'
			'board picker';
		gap: 24px;
	}

	.tag__head {
		grid-area: head;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--color-mist);
	}

	.tag__back {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--brand-cyan);
		text-decoration: none;
		margin-bottom: 8px;
	}

	.tag__back:hover {
		text-decoration: underline;
	}

	.tag__head h2 {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-display);
		font-size: 24px;
		margin: 0;
	}

	.tag__color-dot {
		width: 16px;
		height: 16px;
		border-radius: 9999px;
	}

	.tag__meta {
		margin: 6px 0 0;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--color-fog);
	}

	.tag__meta--warn {
		color: var(--brand-amber);
	}

	.eyebrow {
		display: inline-block;
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.tag__empty {
		grid-column: 1 / -1;
		padding: 24px;
		min-height: 50vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tag__board {
		grid-area: board;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.tag__board-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.tag__board-meta {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-fog);
	}

	.tag__hex-wrap {
		flex: 1;
		min-height: 420px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-obsidian);
		border-radius: 6px;
		padding: 12px;
	}

	.tag__hex-wrap :global(svg) {
		max-height: 480px;
		max-width: 100%;
	}

	.tag__slider {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tag__slider input[type='range'] {
		width: 100%;
		accent-color: var(--brand-cyan);
	}

	.tag__slider-rounds {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tag__slider-tick {
		min-width: 28px;
		padding: 4px 6px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-fog);
		font-family: var(--font-mono);
		font-size: 10px;
		cursor: pointer;
	}

	.tag__slider-tick:hover {
		color: var(--color-bone);
		border-color: var(--brand-cyan);
	}

	.tag__slider-tick--active {
		background: var(--brand-cyan);
		color: var(--color-void);
		border-color: var(--brand-cyan);
	}

	.tag__picker {
		grid-area: picker;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}

	.tag__picker-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tag__archived-toggle {
		display: inline-flex;
		gap: 4px;
		align-items: center;
		font-size: 11px;
		color: var(--color-fog);
	}

	.tag__picker-search {
		padding: 8px 12px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 13px;
	}

	.tag__picker-search:focus-visible {
		outline: none;
		border-color: var(--brand-cyan);
		box-shadow: 0 0 0 1px var(--brand-cyan);
	}

	.tag__picker-list {
		list-style: none;
		padding: 0;
		margin: 0;
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tag__picker-row {
		display: grid;
		grid-template-columns: 12px 1fr auto;
		gap: 8px;
		align-items: center;
		width: 100%;
		text-align: left;
		padding: 8px 12px;
		background: transparent;
		border: 0;
		border-radius: 4px;
		color: var(--color-parchment);
		font-family: var(--font-body);
		font-size: 13px;
		cursor: pointer;
	}

	.tag__picker-row--highlight {
		background: rgba(36, 212, 255, 0.1);
		color: var(--color-bone);
	}

	.tag__picker-row--archived {
		opacity: 0.55;
	}

	.tag__picker-swatch {
		width: 10px;
		height: 10px;
		border-radius: 9999px;
	}

	.tag__picker-name {
		font-family: var(--font-display);
	}

	.tag__picker-cat {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-fog);
	}

	.tag__picker-warn {
		font-family: var(--font-mono);
		font-size: 10px;
		text-transform: uppercase;
		color: var(--brand-amber);
	}

	.tag__picker-empty {
		padding: 12px;
		font-size: 12px;
		color: var(--color-fog);
		text-align: center;
	}

	.tag__picker-foot {
		padding-top: 8px;
		border-top: 1px solid var(--color-mist);
	}

	.tag__status {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-fog);
	}

	.tag__status--saving {
		color: var(--brand-amber);
	}

	.tag__status--ok {
		color: var(--brand-teal);
	}

	.tag__status--error {
		color: var(--brand-coral);
	}
</style>
