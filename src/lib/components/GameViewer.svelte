<script lang="ts">
	import HexGrid from '$lib/components/HexGrid.svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';
	import type {
		GuardianAsset,
		HexSpiritAsset,
		IconPoolEntry,
		PlayerSnapshot,
		RuneAsset
	} from '$lib/types';

	interface Props {
		playerSnapshots: PlayerSnapshot[];
		spiritAssets: Map<string, HexSpiritAsset>;
		runeAssets: Map<string, RuneAsset>;
		statusIcons: Map<string, IconPoolEntry>; // key: normalized status token
		guardianAssets: Map<string, GuardianAsset>;
		initialSelectedPlayerColor?: string | null;
		onPlayerSelect?: (playerColor: string | null) => void;
	}

	let {
		playerSnapshots,
		spiritAssets,
		runeAssets,
		statusIcons,
		guardianAssets,
		initialSelectedPlayerColor = null,
		onPlayerSelect
	}: Props = $props();

	let selectedPlayerColor = $state<string | null>(null);
	let didUserSelectPlayerColor = $state(false);

	const sortedPlayers = $derived(() =>
		[...playerSnapshots].sort((a, b) => {
			const byVp = b.victoryPoints - a.victoryPoints;
			if (byVp !== 0) return byVp;
			return a.playerColor.localeCompare(b.playerColor);
		})
	);

	$effect(() => {
		if (sortedPlayers().length === 0) {
			selectedPlayerColor = null;
			didUserSelectPlayerColor = false;
			return;
		}

		if (!didUserSelectPlayerColor) {
			const desired = initialSelectedPlayerColor?.trim().toLowerCase() ?? null;
			if (desired) {
				const match =
					playerSnapshots.find((p) => p.playerColor.toLowerCase() === desired) ??
					playerSnapshots.find((p) => (p.ttsUsername ?? '').trim().toLowerCase() === desired) ??
					null;

				if (match && selectedPlayerColor !== match.playerColor) {
					selectedPlayerColor = match.playerColor;
					return;
				}
			}
		}

		if (selectedPlayerColor && playerSnapshots.some((p) => p.playerColor === selectedPlayerColor)) {
			return;
		}

		selectedPlayerColor = sortedPlayers()[0].playerColor;
	});

	$effect(() => {
		onPlayerSelect?.(selectedPlayerColor);
	});

	const selectedPlayer = $derived(
		() =>
			playerSnapshots.find((p) => p.playerColor === selectedPlayerColor) ??
			sortedPlayers()[0] ??
			null
	);

	function getStorageUrl(path: string | null): string | null {
		if (!path) return null;
		return path.startsWith('http') ? path : `${STORAGE_BASE_URL}/${path}`;
	}

	// Build spirit image URL map from spiritAssets
	const spiritImageMap = $derived(() => {
		const map = new Map<string, string>();
		for (const [id, asset] of spiritAssets) {
			const imagePath = asset.game_print_image_path || asset.art_raw_image_path;
			if (imagePath) {
				// Build full storage URL
				const url = imagePath.startsWith('http') ? imagePath : `${STORAGE_BASE_URL}/${imagePath}`;
				map.set(id, url);
			}
		}
		return map;
	});

	// Build guardian icon URL map from guardianAssets
	const guardianIconMap = $derived(() => {
		const map = new Map<string, string>();
		for (const [name, asset] of guardianAssets) {
			if (asset.icon_image_path) {
				const url = asset.icon_image_path.startsWith('http')
					? asset.icon_image_path
					: `${STORAGE_BASE_URL}/${asset.icon_image_path}`;
				map.set(name, url);
			}
		}
		return map;
	});

	const runeIconMap = $derived(() => {
		const map = new Map<string, string>();
		for (const [id, asset] of runeAssets) {
			if (asset.icon_path) {
				const url = getStorageUrl(asset.icon_path);
				if (url) map.set(id, url);
			}
		}
		return map;
	});

	const statusIconMap = $derived(() => {
		const map = new Map<string, string>();
		for (const [key, icon] of statusIcons) {
			const url = getStorageUrl(icon.file_path);
			if (url) map.set(key, url);
		}
		return map;
	});

	function statusDisplay(token: string | null, level: number): string {
		if (!token) return '—';
		return `${token} (${level})`;
	}

	function statusIconUrl(token: string | null): string | null {
		if (!token) return null;
		return statusIconMap().get(token.toLowerCase()) ?? null;
	}

	function isSpiritAugmentAsset(asset: RuneAsset | null | undefined): boolean {
		return typeof asset?.class_id === 'string' && asset.class_id.trim() !== '';
	}

	function isSpiritAugmentSlot(slot: PlayerSnapshot['runes'][number]): boolean {
		if (!slot?.hasRune) return false;
		const asset = slot.id ? runeAssets.get(slot.id) : null;
		const type = typeof slot.type === 'string' ? slot.type.toLowerCase() : null;
		return type === 'class' || Boolean(slot.classId) || isSpiritAugmentAsset(asset);
	}

	const runeInventory = $derived(() => {
		const player = selectedPlayer();
		if (!player) return [];

		return (player.runes ?? [])
			.filter((slot) => slot.hasRune && !isSpiritAugmentSlot(slot))
			.map((slot) => ({
				slotIndex: slot.slotIndex,
				id: slot.id ?? null,
				name: slot.name ?? (slot.id ? (runeAssets.get(slot.id)?.name ?? 'Rune') : 'Rune'),
				iconUrl: slot.id ? (runeIconMap().get(slot.id) ?? null) : null
			}));
	});

	const spiritAugmentsDrawn = $derived(() => {
		const player = selectedPlayer();
		if (!player) return [];

		return (player.runes ?? [])
			.filter(isSpiritAugmentSlot)
			.map((slot) => ({
				slotIndex: slot.slotIndex,
				id: slot.id ?? null,
				name: slot.name ?? (slot.id ? (runeAssets.get(slot.id)?.name ?? 'Spirit Augment') : 'Spirit Augment'),
				iconUrl: slot.id ? (runeIconMap().get(slot.id) ?? null) : null
			}));
	});

	const spiritAugmentsOnSpirits = $derived(() => {
		const player = selectedPlayer();
		if (!player) return [];

		const spiritsBySlot = new Map(player.spirits.map((s) => [s.slotIndex, s]));
		const bySlot = new Map<
			number,
			Array<{
				runeId: string;
				name: string;
				iconUrl: string | null;
			}>
		>();

		for (const attachment of player.spiritRuneAttachments ?? []) {
			if (!attachment || !attachment.runeId || !Number.isFinite(attachment.spiritSlotIndex))
				continue;

			const rune = runeAssets.get(attachment.runeId);
			if (rune && !isSpiritAugmentAsset(rune)) continue;

			const list = bySlot.get(attachment.spiritSlotIndex) ?? [];
			list.push({
				runeId: attachment.runeId,
				name: rune?.name ?? attachment.runeId,
				iconUrl: runeIconMap().get(attachment.runeId) ?? null
			});
			bySlot.set(attachment.spiritSlotIndex, list);
		}

		return Array.from(bySlot.entries())
			.sort(([a], [b]) => a - b)
			.map(([slotIndex, runes]) => ({
				slotIndex,
				spiritName: spiritsBySlot.get(slotIndex)?.name ?? null,
				runes
			}));
	});

	const totalSpiritAugmentsOnSpirits = $derived(() =>
		spiritAugmentsOnSpirits().reduce((total, group) => total + group.runes.length, 0)
	);

	type TraitEntry = { name: string; count: number };

	function normalizeTraitName(value: unknown): string | null {
		if (typeof value !== 'string') return null;
		const trimmed = value.trim();
		return trimmed ? trimmed : null;
	}

	function addTraitCount(map: Map<string, number>, name: string, amount: number) {
		if (!name) return;
		if (!Number.isFinite(amount) || amount <= 0) return;
		map.set(name, (map.get(name) ?? 0) + amount);
	}

	function sortedTraitEntries(map: Map<string, number>): TraitEntry[] {
		return Array.from(map.entries())
			.filter(([, count]) => Number.isFinite(count) && count > 0)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	}

	function addTraitsFromSpirit(
		classCounts: Map<string, number>,
		originCounts: Map<string, number>,
		spirit: PlayerSnapshot['spirits'][number]
	) {
		for (const [name, count] of Object.entries(spirit.classes ?? {})) {
			addTraitCount(classCounts, name, count);
		}
		for (const [name, count] of Object.entries(spirit.origins ?? {})) {
			addTraitCount(originCounts, name, count);
		}
	}

	function addTraitRuneFromSlot(
		classCounts: Map<string, number>,
		originCounts: Map<string, number>,
		slot: PlayerSnapshot['runes'][number]
	) {
		if (!slot?.hasRune) return;

		const type = typeof slot.type === 'string' ? slot.type.toLowerCase() : null;
		const asset = slot.id ? runeAssets.get(slot.id) : null;
		const name = normalizeTraitName(slot.name) ?? asset?.name ?? null;
		if (!name) return;

		if (type === 'class' || slot.classId || asset?.class_id) {
			addTraitCount(classCounts, name, 1);
			return;
		}
	}

	const activeTraits = $derived(() => {
		const player = selectedPlayer();
		if (!player) return { classes: [] as TraitEntry[], origins: [] as TraitEntry[] };

		const classCounts = new Map<string, number>();
		const originCounts = new Map<string, number>();

		for (const spirit of player.spirits ?? []) {
			addTraitsFromSpirit(classCounts, originCounts, spirit);
		}

		for (const slot of player.runes ?? []) {
			addTraitRuneFromSlot(classCounts, originCounts, slot);
		}

		for (const attachment of player.spiritRuneAttachments ?? []) {
			if (!attachment?.runeId) continue;
			const asset = runeAssets.get(attachment.runeId);
			if (!asset) continue;
			const name = normalizeTraitName(asset.name);
			if (!name) continue;

			if (asset.class_id) {
				addTraitCount(classCounts, name, 1);
			}
		}

		return {
			classes: sortedTraitEntries(classCounts),
			origins: sortedTraitEntries(originCounts)
		};
	});
</script>

<div class="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
	<aside class="rounded-xl border border-gray-800 bg-gray-900/40 p-3 lg:w-80 lg:shrink-0">
		<div class="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">Players</div>
		<div class="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-y-auto lg:pb-0">
			{#each sortedPlayers() as player, idx (player.playerColor)}
				{@const rank = idx + 1}
				{@const guardianIconUrl = guardianIconMap().get(player.selectedCharacter) ?? null}
				{@const isSelected = selectedPlayerColor === player.playerColor}
				{@const statusIcon = statusIconUrl(player.statusToken)}
				<button
					type="button"
					onclick={() => {
						didUserSelectPlayerColor = true;
						selectedPlayerColor = player.playerColor;
					}}
					class="group w-[16rem] shrink-0 rounded-xl border bg-gray-950/40 p-3 text-left transition-colors hover:bg-gray-950/60 lg:w-auto lg:shrink"
					class:border-purple-500={isSelected}
					class:border-gray-800={!isSelected}
					aria-current={isSelected ? 'true' : undefined}
				>
					<div class="flex items-start gap-3">
						<div
							class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-purple-500 to-blue-600"
						>
							{#if guardianIconUrl}
								<img
									src={guardianIconUrl}
									alt={player.selectedCharacter}
									class="h-full w-full object-cover"
									loading="lazy"
									decoding="async"
								/>
							{:else}
								<div class="text-sm font-bold text-white">
									{player.selectedCharacter.slice(0, 1).toUpperCase()}
								</div>
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-semibold text-gray-100">
								{player.ttsUsername ?? 'Unknown'}
							</div>
							<div class="truncate text-xs text-gray-400">{player.selectedCharacter}</div>
							<div class="mt-2 flex flex-wrap items-center gap-1.5">
								<div
									class="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
									title="Rank by victory points"
								>
									<span class="text-gray-500">#</span>
									<span class="tabular-nums">{rank}</span>
								</div>
								<div
									class="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
									title="Blood"
								>
									<span class="text-red-400">♥</span>
									<span class="tabular-nums">{player.blood}</span>
								</div>
								<div
									class="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
									title="Barrier"
								>
									<span class="text-sky-400">⛨</span>
									<span class="tabular-nums">{player.barrier}</span>
								</div>
								<div
									class="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
									title={`Status: ${statusDisplay(player.statusToken, player.statusLevel)}`}
								>
									{#if statusIcon}
										<img
											src={statusIcon}
											alt={player.statusToken ?? 'Status'}
											class="h-3.5 w-3.5 rounded-full object-contain"
											loading="lazy"
											decoding="async"
										/>
									{:else}
										<span class="text-purple-300">✦</span>
									{/if}
									<span class="truncate"
										>{statusDisplay(player.statusToken, player.statusLevel)}</span
									>
								</div>
								<div
									class="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
									title="Victory Points"
								>
									<span class="text-yellow-400">★</span>
									<span class="tabular-nums">{player.victoryPoints}</span>
								</div>
								{#if player.navigationDestination}
									<div
										class="flex max-w-full items-center gap-1 rounded-full border border-gray-800 bg-gray-900/50 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
										title={`Navigation: ${player.navigationDestination}`}
									>
										<span class="text-gray-400">🧭</span>
										<span class="truncate">{player.navigationDestination}</span>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</button>
			{/each}

			{#if playerSnapshots.length === 0}
				<div class="rounded-lg border border-dashed border-gray-800 bg-gray-950/40 p-6 text-center">
					<div class="text-sm text-gray-400">Waiting for players…</div>
				</div>
			{/if}
		</div>
	</aside>

	<section class="min-w-0 flex-1 rounded-xl border border-gray-800 bg-gray-900/40 p-4 lg:p-5">
		{#if selectedPlayer()}
			{@const player = selectedPlayer()}

			<div class="space-y-4">
				<!-- Spirits Section -->
				<section class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
					<h3 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Spirits</h3>
					<div class="mt-3 flex flex-col items-start gap-4 sm:flex-row">
						<!-- Traits sidebar -->
						<div class="w-full space-y-3 sm:w-44 sm:shrink-0">
							<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
								<div class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
									Classes
								</div>
								{#if activeTraits().classes.length === 0}
									<div class="mt-2 text-xs text-gray-500">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each activeTraits().classes as trait (trait.name)}
											<span
												class="inline-flex items-center gap-1 rounded-full border border-gray-800 bg-gray-950/40 px-2 py-0.5 text-xs text-gray-200"
											>
												<span class="max-w-[6rem] truncate">{trait.name}</span>
												<span class="text-gray-500 tabular-nums">{trait.count}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
								<div class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
									Origins
								</div>
								{#if activeTraits().origins.length === 0}
									<div class="mt-2 text-xs text-gray-500">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each activeTraits().origins as trait (trait.name)}
											<span
												class="inline-flex items-center gap-1 rounded-full border border-gray-800 bg-gray-950/40 px-2 py-0.5 text-xs text-gray-200"
											>
												<span class="max-w-[6rem] truncate">{trait.name}</span>
												<span class="text-gray-500 tabular-nums">{trait.count}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
								<div class="flex items-center justify-between gap-2">
									<div class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
										Spirit Augments
									</div>
									<span class="text-xs text-gray-400 tabular-nums">
										{totalSpiritAugmentsOnSpirits()}
									</span>
								</div>
								{#if spiritAugmentsOnSpirits().length === 0}
									<div class="mt-2 text-xs text-gray-500">None on spirits</div>
								{:else}
									<div class="mt-2 space-y-1.5">
										{#each spiritAugmentsOnSpirits() as group (group.slotIndex)}
											<div class="flex items-center gap-2 text-xs text-gray-200">
												<span class="text-gray-400">{group.spiritName ?? `Slot ${group.slotIndex}`}</span>
												<span class="text-gray-600">-</span>
												<div class="flex items-center gap-1">
													{#each group.runes as rune, i (`${rune.runeId}-${i}`)}
														{#if rune.iconUrl}
															<img
																src={rune.iconUrl}
																alt={rune.name}
																title={rune.name}
																class="h-5 w-5 rounded-full object-contain"
																loading="lazy"
																decoding="async"
															/>
														{:else}
															<span
																class="flex h-5 w-5 items-center justify-center rounded-full bg-purple-900/50 text-[9px] text-purple-300"
																title={rune.name}
															>
																{rune.name.slice(0, 1)}
															</span>
														{/if}
													{/each}
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>

						<!-- Hex Grid -->
						<div class="flex flex-1 items-center justify-center">
							<HexGrid spirits={player.spirits} spiritAssets={spiritImageMap()} />
						</div>

						<!-- Drawn Spirits -->
						<div class="w-full space-y-3 sm:w-44 sm:shrink-0">
							<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
								<div class="flex items-center justify-between gap-2">
									<div class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
										Rune Inventory
									</div>
									<span class="text-xs text-gray-400 tabular-nums">{runeInventory().length}</span>
								</div>
								{#if runeInventory().length === 0}
									<div class="mt-2 text-xs text-gray-500">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each runeInventory() as rune, i (`${rune.id ?? 'rune'}-${rune.slotIndex}-${i}`)}
											<span
												class="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-800 bg-gray-950/40 px-2 py-0.5 text-xs text-gray-200"
												title={`Slot ${rune.slotIndex}: ${rune.name}`}
											>
												{#if rune.iconUrl}
													<img
														src={rune.iconUrl}
														alt={rune.name}
														class="h-4 w-4 rounded-full object-contain"
														loading="lazy"
														decoding="async"
													/>
												{/if}
												<span class="truncate">{rune.name}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
								<div class="flex items-center justify-between gap-2">
									<div class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
										Spirit Augments Drawn
									</div>
									<span class="text-xs text-gray-400 tabular-nums">
										{spiritAugmentsDrawn().length}
									</span>
								</div>
								{#if spiritAugmentsDrawn().length === 0}
									<div class="mt-2 text-xs text-gray-500">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each spiritAugmentsDrawn() as augment, i (`${augment.id ?? 'augment'}-${augment.slotIndex}-${i}`)}
											<span
												class="inline-flex max-w-full items-center gap-1 rounded-full border border-purple-900/60 bg-purple-950/30 px-2 py-0.5 text-xs text-purple-100"
												title={`Slot ${augment.slotIndex}: ${augment.name}`}
											>
												{#if augment.iconUrl}
													<img
														src={augment.iconUrl}
														alt={augment.name}
														class="h-4 w-4 rounded-full object-contain"
														loading="lazy"
														decoding="async"
													/>
												{/if}
												<span class="truncate">{augment.name}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
								<div class="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
									Drawn This Turn
								</div>
								{#if (player.handDraws ?? []).length === 0}
									<div class="mt-2 text-xs text-gray-500">None</div>
								{:else}
									<div class="mt-2 space-y-1">
										{#each player.handDraws as draw, i (`${draw.guid ?? 'draw'}-${i}`)}
											<div class="flex items-center justify-between gap-2 text-xs">
												<span class="truncate text-gray-200">{draw.name ?? 'Unknown'}</span>
												{#if draw.cost != null}
													<span class="shrink-0 text-gray-500 tabular-nums">{draw.cost}</span>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>
				</section>
			</div>
		{:else}
			<div class="flex items-center justify-center py-16 text-sm text-gray-400">
				No player data for this round yet.
			</div>
		{/if}
	</section>
</div>
