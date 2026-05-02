<script lang="ts">
	import HexGrid from '$lib/components/HexGrid.svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';
	import type {
		CustomDiceAsset,
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
		customDiceAssets?: Map<string, CustomDiceAsset>;
		initialSelectedPlayerColor?: string | null;
		onPlayerSelect?: (playerColor: string | null) => void;
	}

	let {
		playerSnapshots,
		spiritAssets,
		runeAssets,
		statusIcons,
		guardianAssets,
		customDiceAssets = new Map<string, CustomDiceAsset>(),
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

	type DicePoolEntry = {
		diceId: string;
		count: number;
		name: string;
		firstFaceUrl: string | null;
		avgFace: number | null;
	};

	// Numeric value of a face (e.g. "0", "1", "2"); non-numeric reward strings
	// (e.g. "crit") contribute nothing to the average attack.
	function faceNumericValue(rewardValue: string | null | undefined): number | null {
		if (typeof rewardValue !== 'string') return null;
		const n = Number.parseFloat(rewardValue.trim());
		return Number.isFinite(n) ? n : null;
	}

	function isAttackDie(asset: CustomDiceAsset | undefined): boolean {
		// `defense_dice` is a TTS-side sentinel and doesn't appear in custom_dice.
		// Anything else with dice_type === 'attack' counts toward expected damage.
		return !!asset && asset.dice_type === 'attack';
	}

	const playerDicePool = $derived((): DicePoolEntry[] => {
		const player = selectedPlayer();
		if (!player) return [];

		return (player.dice ?? [])
			.filter((entry) => entry && entry.diceId && entry.count > 0)
			.map((entry) => {
				const asset = customDiceAssets.get(entry.diceId);
				const sides = (asset?.sides ?? []).slice().sort((a, b) => a.side_number - b.side_number);
				const firstFace = sides[0] ?? null;
				const numericFaces = sides
					.map((s) => faceNumericValue(s.reward_value))
					.filter((v): v is number => v !== null);
				const avgFace =
					numericFaces.length > 0
						? numericFaces.reduce((sum, v) => sum + v, 0) / numericFaces.length
						: null;

				return {
					diceId: entry.diceId,
					count: entry.count,
					name: asset?.name ?? entry.diceId,
					firstFaceUrl: getStorageUrl(firstFace?.image_path ?? asset?.background_image_path ?? null),
					avgFace: isAttackDie(asset) ? avgFace : null
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	const totalDiceCount = $derived(() =>
		playerDicePool().reduce((sum, entry) => sum + entry.count, 0)
	);

	// Expected attack per roll: sum of (count * avg face value) across attack dice.
	// `null` when no attack dice are configured so the UI can render a dash.
	const expectedAttack = $derived((): number | null => {
		const pool = playerDicePool();
		let total = 0;
		let contributors = 0;
		for (const entry of pool) {
			if (entry.avgFace == null) continue;
			total += entry.count * entry.avgFace;
			contributors += entry.count;
		}
		return contributors > 0 ? total : null;
	});

	function formatExpected(value: number | null): string {
		if (value == null) return '—';
		return value.toFixed(2).replace(/\.?0+$/, '');
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
	<aside class="brand-panel p-5 lg:w-80 lg:shrink-0">
		<div class="mb-4">
			<span class="eyebrow eyebrow-violet">Players</span>
		</div>
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
					class="player-card group w-[18rem] shrink-0 rounded-xl border p-4 text-left transition-colors lg:w-auto lg:shrink"
					class:selected={isSelected}
					class:border-gray-800={!isSelected}
					aria-current={isSelected ? 'true' : undefined}
				>
					<div class="flex items-start gap-3">
						<div
							class="hex-frame flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden"
						>
							{#if guardianIconUrl}
								<img
									src={guardianIconUrl}
									alt={player.selectedCharacter}
									class="hex-clip h-full w-full object-cover"
									loading="lazy"
									decoding="async"
								/>
							{:else}
								<div class="hex-clip flex h-full w-full items-center justify-center bg-[var(--color-crypt)]" style="font-family: var(--font-display); font-size: 1.4rem; color: var(--color-bone)">
									{player.selectedCharacter.slice(0, 1).toUpperCase()}
								</div>
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<div class="player-name truncate" style="color: var(--color-bone)">
								{player.ttsUsername ?? 'Unknown'}
							</div>
							<div class="truncate text-xs" style="color: var(--color-fog); margin-top: 1px">{player.selectedCharacter}</div>

							<!-- Big stats row -->
							<div class="mt-3 flex items-end gap-3">
								<div class="stat-hero" title="Victory Points">
									<span class="stat-hero-num" style="color: var(--brand-amber)">{player.victoryPoints}</span>
									<span class="stat-hero-label">VP</span>
								</div>
								<div class="stat-hero" title="Blood">
									<span class="stat-hero-num" style="color: var(--color-blood)">{player.blood}</span>
									<span class="stat-hero-label">BLD</span>
								</div>
								<div class="stat-hero" title="Barrier">
									<span class="stat-hero-num" style="color: var(--brand-cyan)">{player.barrier}</span>
									<span class="stat-hero-label">BAR</span>
								</div>
								<div class="ml-auto">
									<span class="rank-badge">#{rank}</span>
								</div>
							</div>

							<!-- Chips row -->
							<div class="mt-2 flex flex-wrap items-center gap-1.5">
								<div
									class="stat-chip flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
									title="Potential Tokens"
								>
									<span style="color: var(--brand-teal)">⬡</span>
									<span class="tabular-nums" style="color: var(--color-parchment)">{player.maxTokens ?? 4}</span>
								</div>
								<div
									class="stat-chip flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
									title={`Status: ${statusDisplay(player.statusToken, player.statusLevel)}`}
								>
									{#if statusIcon}
										<img
											src={statusIcon}
											alt={player.statusToken ?? 'Status'}
											class="h-3 w-3 rounded-full object-contain"
											loading="lazy"
											decoding="async"
										/>
									{:else}
										<span style="color: var(--brand-magenta-soft)">✦</span>
									{/if}
									<span class="truncate" style="color: var(--color-parchment)"
										>{statusDisplay(player.statusToken, player.statusLevel)}</span
									>
								</div>
								{#if player.navigationDestination}
									<div
										class="stat-chip flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
										title={`Navigation: ${player.navigationDestination}`}
									>
										<span style="color: var(--color-fog)">🧭</span>
										<span class="truncate" style="color: var(--color-parchment)">{player.navigationDestination}</span>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</button>
			{/each}

			{#if playerSnapshots.length === 0}
				<div class="rounded-xl border border-dashed p-8 text-center" style="border-color: var(--color-mist)">
					<div class="text-sm" style="color: var(--color-fog)">Waiting for players…</div>
				</div>
			{/if}
		</div>
	</aside>

	<section class="brand-panel min-w-0 flex-1 p-4 lg:p-5">
		{#if selectedPlayer()}
			{@const player = selectedPlayer()}

			<div class="space-y-4">
				<!-- Spirits Section -->
				<section class="rounded-xl border p-5" style="border-color: var(--color-mist); background: var(--color-shadow)">
					<span class="eyebrow eyebrow-magenta">Spirits</span>
					<div class="mt-4 flex flex-col items-start gap-4 sm:flex-row">
						<!-- Traits sidebar -->
						<div class="w-full space-y-3 sm:w-44 sm:shrink-0">
							<div class="sidebar-block rounded-lg p-3">
								<span class="eyebrow" style="font-size: 0.65rem">Classes</span>
								{#if activeTraits().classes.length === 0}
									<div class="mt-2 text-xs" style="color: var(--color-whisper)">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each activeTraits().classes as trait (trait.name)}
											<span
												class="trait-chip inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
											>
												<span class="max-w-[6rem] truncate" style="color: var(--color-parchment)">{trait.name}</span>
												<span class="tabular-nums font-bold" style="color: var(--brand-violet-soft)">{trait.count}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="sidebar-block rounded-lg p-3">
								<span class="eyebrow" style="font-size: 0.65rem">Origins</span>
								{#if activeTraits().origins.length === 0}
									<div class="mt-2 text-xs" style="color: var(--color-whisper)">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each activeTraits().origins as trait (trait.name)}
											<span
												class="origin-chip inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
											>
												<span class="max-w-[6rem] truncate" style="color: var(--color-parchment)">{trait.name}</span>
												<span class="tabular-nums font-bold" style="color: var(--brand-magenta-soft)">{trait.count}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="sidebar-block rounded-lg p-3">
								<div class="flex items-center justify-between gap-2">
									<span class="eyebrow" style="font-size: 0.65rem">Augments</span>
									<span class="tabular-nums text-xs font-bold" style="color: var(--brand-cyan); font-family: var(--font-display)">
										{totalSpiritAugmentsOnSpirits()}
									</span>
								</div>
								{#if spiritAugmentsOnSpirits().length === 0}
									<div class="mt-2 text-xs" style="color: var(--color-whisper)">None on spirits</div>
								{:else}
									<div class="mt-2 space-y-1.5">
										{#each spiritAugmentsOnSpirits() as group (group.slotIndex)}
											<div class="flex items-center gap-2 text-xs" style="color: var(--color-parchment)">
												<span style="color: var(--color-fog)">{group.spiritName ?? `Slot ${group.slotIndex}`}</span>
												<span style="color: var(--color-mist)">—</span>
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
																class="flex h-5 w-5 items-center justify-center rounded-full text-[9px]"
																style="background: var(--color-tomb); color: var(--brand-violet-soft)"
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

						<!-- Hex Grid + Dice Pool -->
						<div class="flex flex-1 flex-col items-center gap-3">
							<HexGrid spirits={player.spirits} spiritAssets={spiritImageMap()} />

							<!-- Configured attack-dice pool, synced from the TTS dice spawner panel. -->
							<div
								class="dice-strip w-full max-w-md rounded-xl p-4"
								aria-label="Attack dice pool"
							>
								<div class="flex items-center justify-between gap-2 mb-3">
									<div class="flex items-center gap-3">
										<span class="eyebrow">Dice Pool</span>
										<span class="dice-count-badge tabular-nums">{totalDiceCount()}</span>
									</div>
									<div
										class="avg-attack-badge flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold"
										title="Expected total attack value per roll: sum of (count × avg face) across attack dice"
									>
										<span style="color: var(--brand-amber)">⚔</span>
										<span class="brand-flame-text tabular-nums font-bold" style="font-family: var(--font-display); font-size: 1rem">avg {formatExpected(expectedAttack())}</span>
									</div>
								</div>

								{#if playerDicePool().length === 0}
									<div class="text-xs" style="color: var(--color-whisper)">No dice configured.</div>
								{:else}
									<div class="flex flex-wrap items-center gap-2">
										{#each playerDicePool() as die (die.diceId)}
											<div
												class="dice-chip flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
												title={`${die.name} ×${die.count}${die.avgFace != null ? ` · avg ${die.avgFace.toFixed(2).replace(/\.?0+$/, '')}` : ''}`}
											>
												{#if die.firstFaceUrl}
													<img
														src={die.firstFaceUrl}
														alt={die.name}
														class="h-8 w-8 rounded-sm object-contain"
														loading="lazy"
														decoding="async"
													/>
												{:else}
													<div
														class="flex h-8 w-8 items-center justify-center rounded-sm"
														style="background: var(--color-crypt); color: var(--color-parchment); font-family: var(--font-display); font-size: 1.1rem"
													>
														{die.name.slice(0, 1)}
													</div>
												{/if}
												<span class="tabular-nums font-bold" style="color: var(--color-bone); font-family: var(--font-display); font-size: 1rem"
													>×{die.count}</span
												>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>

						<!-- Drawn Spirits -->
						<div class="w-full space-y-3 sm:w-44 sm:shrink-0">
							<div class="sidebar-block rounded-lg p-3">
								<div class="flex items-center justify-between gap-2">
									<span class="eyebrow" style="font-size: 0.65rem">Runes</span>
									<span class="tabular-nums text-xs font-bold" style="color: var(--brand-cyan); font-family: var(--font-display)">{runeInventory().length}</span>
								</div>
								{#if runeInventory().length === 0}
									<div class="mt-2 text-xs" style="color: var(--color-whisper)">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each runeInventory() as rune, i (`${rune.id ?? 'rune'}-${rune.slotIndex}-${i}`)}
											<span
												class="rune-chip inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-xs"
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
												<span class="truncate" style="color: var(--color-parchment)">{rune.name}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="sidebar-block rounded-lg p-3">
								<div class="flex items-center justify-between gap-2">
									<span class="eyebrow" style="font-size: 0.65rem">Augments</span>
									<span class="tabular-nums text-xs font-bold" style="color: var(--brand-magenta); font-family: var(--font-display)">
										{spiritAugmentsDrawn().length}
									</span>
								</div>
								{#if spiritAugmentsDrawn().length === 0}
									<div class="mt-2 text-xs" style="color: var(--color-whisper)">None</div>
								{:else}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each spiritAugmentsDrawn() as augment, i (`${augment.id ?? 'augment'}-${augment.slotIndex}-${i}`)}
											<span
												class="augment-chip inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-xs"
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
												<span class="truncate" style="color: var(--brand-magenta-soft)">{augment.name}</span>
											</span>
										{/each}
									</div>
								{/if}
							</div>

							<div class="sidebar-block rounded-lg p-3">
								<span class="eyebrow" style="font-size: 0.65rem">Drawn This Turn</span>
								{#if (player.handDraws ?? []).length === 0}
									<div class="mt-2 text-xs" style="color: var(--color-whisper)">None</div>
								{:else}
									<div class="mt-2 space-y-1">
										{#each player.handDraws as draw, i (`${draw.guid ?? 'draw'}-${i}`)}
											<div class="flex items-center justify-between gap-2 text-xs">
												<span class="truncate" style="color: var(--color-parchment)">{draw.name ?? 'Unknown'}</span>
												{#if draw.cost != null}
													<span class="shrink-0 tabular-nums" style="color: var(--color-whisper)">{draw.cost}</span>
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
			<div class="flex items-center justify-center py-16 text-sm" style="color: var(--color-fog)">
				No player data for this round yet.
			</div>
		{/if}
	</section>
</div>

<style>
	/* Player name — Bebas Neue, big and bold */
	.player-name {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 2vw, 1.4rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1;
	}

	/* Stat hero group: big number + tiny label */
	.stat-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}
	.stat-hero-num {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 3vw, 1.8rem);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.stat-hero-label {
		font-family: var(--font-display);
		font-size: 0.55rem;
		letter-spacing: 0.2em;
		color: var(--color-whisper);
		text-transform: uppercase;
	}

	/* Rank badge — solid magenta fill */
	.rank-badge {
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		color: var(--color-void);
		background: var(--brand-magenta);
		padding: 2px 8px;
		border-radius: 4px;
	}

	/* Player card */
	.player-card {
		background: var(--color-tomb);
		transition: background 160ms ease, border-color 160ms ease;
	}
	.player-card:hover {
		background: var(--color-crypt);
		border-color: var(--brand-violet) !important;
	}
	.player-card.selected {
		background: var(--color-crypt);
		border-color: var(--brand-magenta) !important;
	}

	.stat-chip {
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
	}

	/* Sidebar info blocks — single solid fill, 1px border */
	.sidebar-block {
		border: 1px solid var(--color-mist);
		background: var(--color-tomb);
	}

	.trait-chip {
		border: 1px solid var(--brand-violet);
		background: rgba(123, 29, 255, 0.2);
	}

	.origin-chip {
		border: 1px solid var(--brand-magenta);
		background: rgba(255, 43, 199, 0.12);
	}

	.rune-chip {
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
	}

	.augment-chip {
		border: 1px solid var(--brand-magenta);
		background: rgba(255, 43, 199, 0.12);
	}

	/* Dice strip — single solid block */
	.dice-strip {
		border: 1px solid var(--color-mist);
		background: var(--color-tomb);
	}

	/* Dice count badge — solid cyan */
	.dice-count-badge {
		font-family: var(--font-display);
		font-size: 0.9rem;
		color: var(--color-void);
		background: var(--brand-cyan);
		padding: 1px 8px;
		border-radius: 4px;
	}

	.avg-attack-badge {
		border: 1px solid var(--brand-amber);
		background: rgba(255, 186, 61, 0.12);
	}

	.dice-chip {
		border: 1px solid var(--color-aether);
		background: var(--color-crypt);
		transition: border-color 160ms ease;
	}
	.dice-chip:hover {
		border-color: var(--brand-violet-soft);
	}
</style>
