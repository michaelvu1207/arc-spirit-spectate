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
	<section class="border-t border-gray-800 bg-gray-900 px-4 py-3 lg:px-6">
		<details bind:open={isOpen} class="group">
			<summary
				class="flex cursor-pointer flex-col gap-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 hover:bg-gray-950/80 lg:flex-row lg:items-center lg:justify-between"
			>
				<div>
					<h2 class="text-sm font-semibold tracking-wide text-gray-400 uppercase">
						Round {round} — Bags
					</h2>
					<p class="text-xs text-gray-500">
						Snapshot of shared bag state for this navigation round.
					</p>
				</div>

				<div class="flex items-center gap-3 text-xs text-gray-400">
					{#if hexSpirits()}
						<span class="whitespace-nowrap">
							<span class="text-gray-500">Spirits</span>
							<span class="ml-1 font-semibold text-gray-200 tabular-nums"
								>{hexSpirits()?.count ?? '—'}</span
							>
						</span>
					{/if}
					{#if monsters()}
						<span class="whitespace-nowrap">
							<span class="text-gray-500">Monsters</span>
							<span class="ml-1 font-semibold text-gray-200 tabular-nums"
								>{monsters()?.count ?? '—'}</span
							>
						</span>
					{/if}
					{#if abyssFallen()}
						<span class="whitespace-nowrap">
							<span class="text-gray-500">Abyss</span>
							<span class="ml-1 font-semibold text-gray-200 tabular-nums"
								>{abyssFallen()?.count ?? '—'}</span
							>
						</span>
					{/if}
					{#if stageDeck()}
						<span class="whitespace-nowrap">
							<span class="text-gray-500">Stage</span>
							<span class="ml-1 font-semibold text-gray-200 tabular-nums"
								>{stageDeck()?.count ?? '—'}</span
							>
						</span>
					{/if}
					<svg
						class="chevron h-4 w-4 shrink-0"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
			</summary>

			<div class="mt-3 grid gap-3 lg:grid-cols-2">
				{#if hexSpirits()}
					<div class="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-gray-200">Spirit World Bag</span>
							<span class="text-sm font-bold text-white tabular-nums"
								>{hexSpirits()?.count ?? '—'}</span
							>
						</div>

						<div class="mt-2 space-y-1">
							<div class="text-[11px] text-gray-500">
								Sample (first {sample(hexSpirits()?.contents).length})
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each sample(hexSpirits()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
									<span
										class="max-w-[14rem] truncate rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] text-gray-200"
										title={`${entry.name}${entry.cost != null ? ` (Cost ${entry.cost})` : ''}`}
									>
										{entry.name}
										{#if entry.cost != null}
											<span class="text-gray-400"> · {entry.cost}</span>
										{/if}
									</span>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				{#if monsters()}
					<div class="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-gray-200">Monsters Bag</span>
							<span class="text-sm font-bold text-white tabular-nums"
								>{monsters()?.count ?? '—'}</span
							>
						</div>

						<div class="mt-2 space-y-1">
							<div class="text-[11px] text-gray-500">
								Sample (first {sample(monsters()?.contents).length})
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each sample(monsters()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
									{@const iconUrl = entry.id ? (monsterImageUrls.get(entry.id) ?? null) : null}
									<span
										class="flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] text-gray-200"
										title={`${entry.name}${entry.state ? ` — ${entry.state}` : ''}${entry.barrier != null ? ` (Barrier ${entry.barrier})` : ''}${entry.damage != null ? ` (Dmg ${entry.damage})` : ''}`}
									>
										{#if iconUrl}
											<img
												src={iconUrl}
												alt=""
												class="h-4 w-4 shrink-0 rounded-full object-cover"
												loading="lazy"
											/>
										{/if}
										{entry.name}
										{#if entry.state}
											<span class="text-gray-400"> · {entry.state}</span>
										{/if}
									</span>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				{#if abyssFallen()}
					<div class="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-gray-200">Abyss Fallen Spirits</span>
							<span class="text-sm font-bold text-white tabular-nums"
								>{abyssFallen()?.count ?? '—'}</span
							>
						</div>

						<div class="mt-2 space-y-1">
							<div class="text-[11px] text-gray-500">
								Sample (first {sample(abyssFallen()?.contents).length})
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each sample(abyssFallen()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
									<span
										class="max-w-[14rem] truncate rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] text-gray-200"
										title={`${entry.name}${entry.cost != null ? ` (Cost ${entry.cost})` : ''}`}
									>
										{entry.name}
										{#if entry.cost != null}
											<span class="text-gray-400"> · {entry.cost}</span>
										{/if}
									</span>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				{#if stageDeck()}
					<div class="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-gray-200">Stage Deck</span>
							<span class="text-sm font-bold text-white tabular-nums"
								>{stageDeck()?.count ?? '—'}</span
							>
						</div>

						<div class="mt-2 space-y-1">
							<div class="text-[11px] text-gray-500">
								Sample (first {sample(stageDeck()?.contents).length})
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each sample(stageDeck()?.contents) as entry, i (`${entry.guid || entry.id || entry.name}:${i}`)}
									{@const iconUrl = entry.id ? (monsterImageUrls.get(entry.id) ?? null) : null}
									<span
										class="flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] text-gray-200"
										title={`${entry.name}${entry.state ? ` — ${entry.state}` : ''}${entry.barrier != null ? ` (Barrier ${entry.barrier})` : ''}${entry.damage != null ? ` (Dmg ${entry.damage})` : ''}`}
									>
										{#if iconUrl}
											<img
												src={iconUrl}
												alt=""
												class="h-4 w-4 shrink-0 rounded-full object-cover"
												loading="lazy"
											/>
										{/if}
										{entry.name}
										{#if entry.state}
											<span class="text-gray-400"> · {entry.state}</span>
										{/if}
									</span>
								{/each}
							</div>
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

	.chevron {
		transition: transform 150ms ease;
	}

	details[open] .chevron {
		transform: rotate(180deg);
	}
</style>
