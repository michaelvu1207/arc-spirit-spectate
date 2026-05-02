<script lang="ts">
	import type { BagEntrySnapshot, BagSnapshot, BagsData } from '$lib/types';

	interface Props {
		round: number;
		bags: BagsData | null;
		monsterImageUrls?: Map<string, string>;
	}

	let { round, bags, monsterImageUrls = new Map() }: Props = $props();

	let isOpen = $state(false);

	const hexSpirits = $derived(() => (bags?.hexSpirits as BagSnapshot | undefined) ?? undefined);
	const monsters = $derived(() => (bags?.monsters as BagSnapshot | undefined) ?? undefined);
	const abyssFallen = $derived(() => (bags?.abyssFallen as BagSnapshot | undefined) ?? undefined);
	const stageDeck = $derived(() => (bags?.stageDeck as BagSnapshot | undefined) ?? undefined);

	function sample(entries: BagEntrySnapshot[] | undefined, limit = 8): BagEntrySnapshot[] {
		return (entries ?? []).slice(0, limit);
	}
</script>

{#if hexSpirits() || monsters() || abyssFallen() || stageDeck()}
	<section class="px-4 py-4 lg:px-6" style="border-top: 1px solid var(--color-mist)">
		<details bind:open={isOpen} class="group">
			<summary class="summary-row flex cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-3">
				<div class="flex items-center gap-4">
					<span class="eyebrow eyebrow-amber">Bags</span>
					<!-- Inline counts as bold display numerals -->
					<div class="flex items-center gap-3">
						{#if hexSpirits()}
							<span class="bag-count-pill" style="background: rgba(36, 212, 255, 0.15); border-color: var(--brand-cyan)">
								<span style="color: var(--color-whisper); font-size: 0.6rem; letter-spacing: 0.12em">SPR</span>
								<span class="bag-count-num" style="color: var(--brand-cyan)">{hexSpirits()?.count ?? '—'}</span>
							</span>
						{/if}
						{#if monsters()}
							<span class="bag-count-pill" style="background: rgba(255, 77, 109, 0.12); border-color: var(--color-blood)">
								<span style="color: var(--color-whisper); font-size: 0.6rem; letter-spacing: 0.12em">MON</span>
								<span class="bag-count-num" style="color: var(--color-blood)">{monsters()?.count ?? '—'}</span>
							</span>
						{/if}
						{#if abyssFallen()}
							<span class="bag-count-pill" style="background: rgba(123, 29, 255, 0.15); border-color: var(--brand-violet-soft)">
								<span style="color: var(--color-whisper); font-size: 0.6rem; letter-spacing: 0.12em">ABY</span>
								<span class="bag-count-num" style="color: var(--brand-violet-soft)">{abyssFallen()?.count ?? '—'}</span>
							</span>
						{/if}
						{#if stageDeck()}
							<span class="bag-count-pill" style="background: rgba(255, 186, 61, 0.12); border-color: var(--brand-amber)">
								<span style="color: var(--color-whisper); font-size: 0.6rem; letter-spacing: 0.12em">STG</span>
								<span class="bag-count-num" style="color: var(--brand-amber)">{stageDeck()?.count ?? '—'}</span>
							</span>
						{/if}
					</div>
				</div>

				<svg
					class="chevron h-4 w-4 shrink-0"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					style="color: var(--brand-magenta)"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
						clip-rule="evenodd"
					/>
				</svg>
			</summary>

			<div class="mt-3 grid gap-3 lg:grid-cols-2">
				{#if hexSpirits()}
					<div class="bag-card rounded-xl p-4">
						<div class="flex items-center justify-between gap-2 mb-3">
							<span class="bag-card-title">Spirit World</span>
							<span class="bag-card-count" style="color: var(--brand-cyan)">{hexSpirits()?.count ?? '—'}</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each sample(hexSpirits()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
								<span
									class="bag-chip max-w-[14rem] truncate rounded px-2 py-0.5 text-[11px]"
									title={`${entry.name}${entry.cost != null ? ` (Cost ${entry.cost})` : ''}`}
								>
									<span style="color: var(--color-parchment)">{entry.name}</span>
									{#if entry.cost != null}
										<span style="color: var(--color-fog)"> · {entry.cost}</span>
									{/if}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if monsters()}
					<div class="bag-card rounded-xl p-4">
						<div class="flex items-center justify-between gap-2 mb-3">
							<span class="bag-card-title">Monsters</span>
							<span class="bag-card-count" style="color: var(--color-blood)">{monsters()?.count ?? '—'}</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each sample(monsters()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
								{@const iconUrl = entry.id ? (monsterImageUrls.get(entry.id) ?? null) : null}
								<span
									class="bag-chip flex max-w-[14rem] items-center gap-1.5 truncate rounded px-2 py-0.5 text-[11px]"
									title={`${entry.name}${entry.state ? ` — ${entry.state}` : ''}${entry.barrier != null ? ` (Barrier ${entry.barrier})` : ''}${entry.damage != null ? ` (Dmg ${entry.damage})` : ''}`}
								>
									{#if iconUrl}
										<img src={iconUrl} alt="" class="h-4 w-4 shrink-0 rounded-full object-cover" loading="lazy" />
									{/if}
									<span style="color: var(--color-parchment)">{entry.name}</span>
									{#if entry.state}
										<span style="color: var(--color-fog)"> · {entry.state}</span>
									{/if}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if abyssFallen()}
					<div class="bag-card rounded-xl p-4">
						<div class="flex items-center justify-between gap-2 mb-3">
							<span class="bag-card-title">Abyss Fallen</span>
							<span class="bag-card-count" style="color: var(--brand-violet-soft)">{abyssFallen()?.count ?? '—'}</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each sample(abyssFallen()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
								<span
									class="bag-chip max-w-[14rem] truncate rounded px-2 py-0.5 text-[11px]"
									title={`${entry.name}${entry.cost != null ? ` (Cost ${entry.cost})` : ''}`}
								>
									<span style="color: var(--color-parchment)">{entry.name}</span>
									{#if entry.cost != null}
										<span style="color: var(--color-fog)"> · {entry.cost}</span>
									{/if}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if stageDeck()}
					<div class="bag-card rounded-xl p-4">
						<div class="flex items-center justify-between gap-2 mb-3">
							<span class="bag-card-title">Stage Deck</span>
							<span class="bag-card-count" style="color: var(--brand-amber)">{stageDeck()?.count ?? '—'}</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each sample(stageDeck()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
								{@const iconUrl = entry.id ? (monsterImageUrls.get(entry.id) ?? null) : null}
								<span
									class="bag-chip flex max-w-[14rem] items-center gap-1.5 truncate rounded px-2 py-0.5 text-[11px]"
									title={`${entry.name}${entry.state ? ` — ${entry.state}` : ''}${entry.barrier != null ? ` (Barrier ${entry.barrier})` : ''}${entry.damage != null ? ` (Dmg ${entry.damage})` : ''}`}
								>
									{#if iconUrl}
										<img src={iconUrl} alt="" class="h-4 w-4 shrink-0 rounded-full object-cover" loading="lazy" />
									{/if}
									<span style="color: var(--color-parchment)">{entry.name}</span>
									{#if entry.state}
										<span style="color: var(--color-fog)"> · {entry.state}</span>
									{/if}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</details>
	</section>
{/if}

<style>
	summary {
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}

	.summary-row {
		border: 1px solid var(--color-mist);
		background: var(--color-tomb);
		transition: background 160ms ease, border-color 160ms ease;
	}
	.summary-row:hover {
		background: var(--color-crypt);
		border-color: var(--brand-violet);
	}

	/* Inline count pills in the summary bar */
	.bag-count-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid;
		border-radius: 4px;
		padding: 2px 8px;
	}
	.bag-count-num {
		font-family: var(--font-display);
		font-size: 1.1rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	/* Bag card — single solid block */
	.bag-card {
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
	}

	/* Card title in Bebas Neue */
	.bag-card-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-bone);
	}

	/* Card count — big display number */
	.bag-card-count {
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.bag-chip {
		border: 1px solid var(--color-mist);
		background: var(--color-tomb);
	}

	.chevron {
		transition: transform 150ms ease;
	}
	details[open] .chevron {
		transform: rotate(180deg);
	}
</style>
