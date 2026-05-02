<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import TabletopScene from '$lib/components/play/TabletopScene.svelte';
	import { getAssetState, getCustomDiceAsset, getSpiritAsset, loadAssets } from '$lib/stores/assetStore.svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';
	import {
		claimSeat,
		getPlayState,
		hydratePlayRoom,
		sendPlayCommand,
		startPlayGame
	} from '$lib/stores/playStore.svelte';
	import type { RoomView } from '$lib/play/server/service';
	import type { GameCommand, MatItemKind, SeatColor, SpiritWorldLocation } from '$lib/play/types';
	import { SEAT_COLORS, SPIRIT_WORLD_LOCATIONS } from '$lib/play/types';
	import type { ClassBreakpoint, ClassTrait, EffectEntry, RuneAsset } from '$lib/types';

	interface Props {
		data: {
			initialView: RoomView;
		};
	}

	let { data }: Props = $props();

	const playState = getPlayState();
	const assetState = getAssetState();

	let focusSeat = $state<SeatColor | null>(null);
	let actionError = $state<string | null>(null);
	let pendingAction = $state<string | null>(null);
	let navSelectorOpen = $state(false);
	let classViewMode = $state<'regular' | 'human' | 'special'>('regular');
	let selectedClassId = $state<string | null>(null);
	let diceSpawnerOpen = $state(false);
	let itemPaletteOpen = $state(false);
	let settingsOpen = $state(false);
	let placementEditorEnabled = $state(false);
	let itemPaletteFilter = $state<MatItemKind>('rune');
	let diceCounts = $state<Record<string, number>>({ defense_dice: 1 });
	let placementImportText = $state('');
	let placementImportError = $state<string | null>(null);

	type TableSceneSettings = {
		hexRadius: number;
		spiritSlots: Record<number, { x: number; z: number }>;
		corruptionStatusToken: { x: number; z: number; scale: number };
		lighting: {
			ambientIntensity: number;
			keyIntensity: number;
			fillIntensity: number;
			overheadIntensity: number;
			overheadHeight: number;
			overheadAngle: number;
		};
	};

	const defaultTableSettings: TableSceneSettings = {
		hexRadius: 0.81,
		spiritSlots: {
			1: { x: 1.629, z: 0.519 },
			2: { x: 1.611, z: -0.247 },
			3: { x: 1.047, z: -0.638 },
			4: { x: 0.499, z: -0.26 },
			5: { x: 0.491, z: 0.502 },
			6: { x: 1.049, z: 0.127 },
			7: { x: 1.052, z: 0.908 }
		},
		corruptionStatusToken: { x: 0.05, z: -1.13, scale: 2 },
		lighting: {
			ambientIntensity: 1.35,
			keyIntensity: 0.7,
			fillIntensity: 2.7,
			overheadIntensity: 11,
			overheadHeight: 14,
			overheadAngle: 0.78
		}
	};

	let tableSettings = $state<TableSceneSettings>(structuredClone(defaultTableSettings));

	const room = $derived(playState.room ?? data.initialView.projection);
	const member = $derived(playState.member ?? data.initialView.member);
	const isLobby = $derived(room.status === 'lobby');
	const isHost = $derived(member.role === 'host');

	onMount(() => {
		hydratePlayRoom(data.initialView);
		void loadAssets();

		if (browser) {
			const storedSettings = window.localStorage.getItem('arc-spirits.table-scene-settings');
			if (storedSettings) {
				try {
					tableSettings = normalizeTableSettings(JSON.parse(storedSettings));
				} catch {
					tableSettings = structuredClone(defaultTableSettings);
				}
			}
			placementImportText = tableSettingsJson;
			document.documentElement.classList.add('immersive-play');
			document.body.classList.add('immersive-play');
		}

		return () => {
			playState.disconnect();
			if (browser) {
				document.documentElement.classList.remove('immersive-play');
				document.body.classList.remove('immersive-play');
			}
		};
	});

	$effect(() => {
		if (!browser) return;
		window.localStorage.setItem('arc-spirits.table-scene-settings', JSON.stringify(tableSettings));
	});

	onDestroy(() => {
		if (!browser) {
			playState.disconnect();
		}
	});

	$effect(() => {
		if (!focusSeat && room.activeSeats.length > 0) {
			focusSeat = member.seatColor ?? room.activeSeats[0];
		}
	});

	$effect(() => {
		if (!member.seatColor) {
			navSelectorOpen = false;
			diceSpawnerOpen = false;
			itemPaletteOpen = false;
		}
	});

	async function runAction(label: string, work: () => Promise<unknown>) {
		pendingAction = label;
		actionError = null;
		try {
			await work();
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Action failed.';
		} finally {
			pendingAction = null;
		}
	}

	function currentSeatGuardian(seatColor: SeatColor): string {
		return room.seats[seatColor].selectedGuardian ?? '';
	}

	async function chooseGuardian(guardianName: string) {
		await runAction('guardian', () =>
			sendPlayCommand({ type: 'selectGuardian', guardianName } as GameCommand)
		);
	}

	async function releaseMySeat() {
		await runAction('release', () => sendPlayCommand({ type: 'releaseSeat' }));
	}

	async function chooseDestination(destination: SpiritWorldLocation) {
		navSelectorOpen = false;
		await runAction('destination', () =>
			sendPlayCommand({
				type: 'selectNavigationDestination',
				destination
			})
		);
	}

	function toAssetUrl(path: string | null): string | null {
		if (!path) return null;
		return path.startsWith('http') ? path : `${STORAGE_BASE_URL}/${path}`;
	}

	const classHeader = $derived(
		classViewMode === 'regular'
			? 'CLASSES'
			: classViewMode === 'human'
				? 'HUMAN CLASSES'
				: 'SPECIAL CLASSES'
	);

	const classToggleLabel = $derived(
		classViewMode === 'regular'
			? 'Show Human ▶'
			: classViewMode === 'human'
				? 'Show Special ▶'
				: '◀ Show Regular'
	);

	function toggleClassView() {
		selectedClassId = null;
		if (classViewMode === 'regular') {
			classViewMode = 'human';
			return;
		}
		if (classViewMode === 'human') {
			classViewMode = 'special';
			return;
		}
		classViewMode = 'regular';
	}

	const classGroups = $derived.by(() => {
		void assetState.classTraits;
		const regular: ClassTrait[] = [];
		const human: ClassTrait[] = [];
		const special: ClassTrait[] = [];

		for (const classTrait of assetState.classTraits.values()) {
			if (classTrait.class_type === 'human') {
				human.push(classTrait);
			} else if (classTrait.class_type === 'special' || classTrait.is_special) {
				special.push(classTrait);
			} else {
				regular.push(classTrait);
			}
		}

		const sortByPosition = (left: ClassTrait, right: ClassTrait) =>
			(left.position ?? 999) - (right.position ?? 999) || left.name.localeCompare(right.name);

		regular.sort(sortByPosition);
		human.sort(sortByPosition);
		special.sort(sortByPosition);

		return { regular, human, special };
	});

	const visibleClasses = $derived(
		classViewMode === 'regular'
			? classGroups.regular
			: classViewMode === 'human'
				? classGroups.human
				: classGroups.special
	);

	const selectedClass = $derived.by(() => {
		void assetState.classTraits;
		return selectedClassId ? assetState.classTraits.get(selectedClassId) ?? null : null;
	});

	function toggleClassDetails(classId: string) {
		selectedClassId = selectedClassId === classId ? null : classId;
	}

	function classBreakpoints(classTrait: ClassTrait | null): ClassBreakpoint[] {
		if (!classTrait?.effect_schema) return [];
		return [...classTrait.effect_schema].sort((left, right) => {
			const leftCount = typeof left.count === 'number' ? left.count : Number(left.count) || 0;
			const rightCount = typeof right.count === 'number' ? right.count : Number(right.count) || 0;
			return leftCount - rightCount;
		});
	}

	function breakpointDescription(breakpoint: ClassBreakpoint): string {
		const parts: string[] = [];
		const effects = (breakpoint.effects ?? []) as EffectEntry[];
		for (const effect of effects) {
			const description = (effect?.description ?? '').trim();
			if (description) parts.push(description);
		}
		if (parts.length > 0) return parts.join('   ');
		return (breakpoint.description ?? '').trim();
	}

	const navigationPrimaryLocations = SPIRIT_WORLD_LOCATIONS.filter(
		(location) => location !== 'Arcane Abyss'
	);

	const focusedPlayer = $derived(focusSeat ? room.players[focusSeat] ?? null : null);
	const currentPlayer = $derived(member.seatColor ? room.players[member.seatColor] ?? null : null);
	const trayDraws = $derived(currentPlayer?.handDraws ?? []);
	const pendingDrawMeta = $derived(currentPlayer?.pendingDraw ?? null);
	const defenseDiceUrl = `${STORAGE_BASE_URL}/misc_assets/a3e10c1d-bba0-447e-b10b-45bb7b79d582/D12.png`;
	const availableDice = $derived.by(() => {
		void assetState.customDiceAssets;
		const list: Array<{
			id: string;
			name: string;
			diceType: 'attack' | 'special' | 'defense';
			previewUrl: string | null;
		}> = [];

		for (const die of assetState.customDiceAssets.values()) {
			const previewUrl = die.exported_template_path
				? toAssetUrl(die.exported_template_path)
				: die.background_image_path
					? toAssetUrl(die.background_image_path)
					: null;
			list.push({
				id: die.id,
				name: die.name,
				diceType: die.dice_type,
				previewUrl
			});
		}

		list.sort((left, right) => left.name.localeCompare(right.name));
		list.push({
			id: 'defense_dice',
			name: 'Defense Dice',
			diceType: 'defense',
			previewUrl: defenseDiceUrl
		});
		return list;
	});
	const filteredSpawnItems = $derived.by(() => {
		void assetState.runeAssets;
		const items: Array<RuneAsset & { kind: MatItemKind }> = [];
		for (const rune of assetState.runeAssets.values()) {
			const kind: MatItemKind = rune.class_id ? 'augment' : rune.origin_id ? 'rune' : 'relic';
			if (kind !== itemPaletteFilter) continue;
			items.push({ ...rune, kind });
		}
		return items.sort((left, right) => left.name.localeCompare(right.name));
	});

	function spiritFrontUrl(spiritId: string | undefined): string | null {
		if (!spiritId) return null;
		const asset = getSpiritAsset(spiritId);
		return asset?.imageUrl ?? `${STORAGE_BASE_URL}/hex_spirits/${spiritId}_game_print.png`;
	}

	function spiritBackUrl(spiritId: string | undefined): string | null {
		if (!spiritId) return null;
		return `${STORAGE_BASE_URL}/hex_spirits/${spiritId}_back_side_export.png`;
	}

	function drawPreviewUrl(draw: { id?: string; sourceBag?: string }) {
		return draw.sourceBag === 'Arcane Abyss Bag' ? spiritBackUrl(draw.id) : spiritFrontUrl(draw.id);
	}

	function runePreviewUrl(rune: RuneAsset): string | null {
		if (!rune.icon_path) return null;
		return toAssetUrl(rune.icon_path);
	}

	function categoryLabel(kind: MatItemKind) {
		if (kind === 'augment') return 'Spirit Augments';
		if (kind === 'relic') return 'Relics';
		return 'Runes';
	}

	function adjustDiceCount(diceId: string, delta: number) {
		const current = diceCounts[diceId] ?? (diceId === 'defense_dice' ? 1 : 0);
		const next = Math.max(0, Math.min(12, current + delta));
		diceCounts = { ...diceCounts, [diceId]: next };
	}

	async function drawSpiritWorldSummon() {
		await runAction('draw-spirit-world', () => sendPlayCommand({ type: 'drawSpiritWorld' }));
	}

	async function drawArcaneAbyssSummon() {
		await runAction('draw-arcane-abyss', () => sendPlayCommand({ type: 'drawArcaneAbyss' }));
	}

	async function summonDrawnSpirit(guid: string) {
		await runAction('spawn-hand-spirit', () => sendPlayCommand({ type: 'spawnHandSpirit', guid }));
	}

	async function discardDrawTray() {
		await runAction('discard-hand-draws', () => sendPlayCommand({ type: 'discardHandDraws' }));
	}

	async function requestSpiritFlip(slotIndex: number) {
		await runAction('flip-spirit', () => sendPlayCommand({ type: 'flipSpirit', slotIndex }));
	}

	async function requestPotentialFlip(slotIndex: number) {
		await runAction('flip-potential', () => sendPlayCommand({ type: 'flipPotentialToken', slotIndex }));
	}

	async function requestMoveMatObject(payload: {
		objectType: 'die' | 'item';
		instanceId: string;
		localX: number;
		localZ: number;
	}) {
		await runAction('move-mat-object', () =>
			sendPlayCommand({
				type: 'moveMatObject',
				...payload
			})
		);
	}

	function normalizeTableSettings(value: unknown): TableSceneSettings {
		const source = (value ?? {}) as Partial<TableSceneSettings>;
		const next = structuredClone(defaultTableSettings);
		const numeric = (candidate: unknown, fallback: number, min: number, max: number) => {
			const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
			if (!Number.isFinite(parsed)) return fallback;
			return Math.max(min, Math.min(max, parsed));
		};

		next.hexRadius = numeric(source.hexRadius, next.hexRadius, 0.25, 1.4);

		for (let slotIndex = 1; slotIndex <= 7; slotIndex += 1) {
			const slot = source.spiritSlots?.[slotIndex];
			next.spiritSlots[slotIndex] = {
				x: numeric(slot?.x, next.spiritSlots[slotIndex].x, -4, 4),
				z: numeric(slot?.z, next.spiritSlots[slotIndex].z, -3, 3)
			};
		}

		next.corruptionStatusToken = {
			x: numeric(source.corruptionStatusToken?.x, next.corruptionStatusToken.x, -4, 4),
			z: numeric(source.corruptionStatusToken?.z, next.corruptionStatusToken.z, -3, 3),
			scale: numeric(source.corruptionStatusToken?.scale, next.corruptionStatusToken.scale, 0.35, 4)
		};

		next.lighting = {
			ambientIntensity: numeric(source.lighting?.ambientIntensity, next.lighting.ambientIntensity, 0, 6),
			keyIntensity: numeric(source.lighting?.keyIntensity, next.lighting.keyIntensity, 0, 8),
			fillIntensity: numeric(source.lighting?.fillIntensity, next.lighting.fillIntensity, 0, 8),
			overheadIntensity: numeric(source.lighting?.overheadIntensity, next.lighting.overheadIntensity, 0, 30),
			overheadHeight: numeric(source.lighting?.overheadHeight, next.lighting.overheadHeight, 6, 28),
			overheadAngle: numeric(source.lighting?.overheadAngle, next.lighting.overheadAngle, 0.18, 1.4)
		};

		return next;
	}

	const tableSettingsJson = $derived(JSON.stringify(tableSettings, null, 2));

	function updateHexRadius(value: string) {
		tableSettings = normalizeTableSettings({ ...tableSettings, hexRadius: Number(value) });
	}

	function updateSpiritSlot(slotIndex: number, axis: 'x' | 'z', value: string | number) {
		tableSettings = normalizeTableSettings({
			...tableSettings,
			spiritSlots: {
				...tableSettings.spiritSlots,
				[slotIndex]: {
					...tableSettings.spiritSlots[slotIndex],
					[axis]: Number(value)
				}
			}
		});
	}

	function updateLighting(key: keyof TableSceneSettings['lighting'], value: string) {
		tableSettings = normalizeTableSettings({
			...tableSettings,
			lighting: {
				...tableSettings.lighting,
				[key]: Number(value)
			}
		});
	}

	function updateCorruptionStatusToken(key: keyof TableSceneSettings['corruptionStatusToken'], value: string) {
		tableSettings = normalizeTableSettings({
			...tableSettings,
			corruptionStatusToken: {
				...tableSettings.corruptionStatusToken,
				[key]: Number(value)
			}
		});
	}

	function handleSpiritSlotMoved(payload: { slotIndex: number; localX: number; localZ: number }) {
		const nextSettings = normalizeTableSettings({
			...tableSettings,
			spiritSlots: {
				...tableSettings.spiritSlots,
				[payload.slotIndex]: {
					x: payload.localX,
					z: payload.localZ
				}
			}
		});
		tableSettings = nextSettings;
		placementImportText = JSON.stringify(nextSettings, null, 2);
	}

	function resetTableSettings() {
		tableSettings = structuredClone(defaultTableSettings);
		placementImportText = tableSettingsJson;
		placementImportError = null;
	}

	function applyImportedTableSettings() {
		try {
			tableSettings = normalizeTableSettings(JSON.parse(placementImportText));
			placementImportText = tableSettingsJson;
			placementImportError = null;
		} catch (error) {
			placementImportError = error instanceof Error ? error.message : 'Invalid JSON.';
		}
	}

	async function spawnSelectedDice() {
		const requests = Object.entries(diceCounts)
			.map(([diceId, count]) => ({ diceId, count }))
			.filter((entry) => entry.count > 0);
		if (requests.length === 0) return;

		await runAction('spawn-dice', async () => {
			for (const request of requests) {
				await sendPlayCommand({
					type: 'spawnDiceBatch',
					diceId: request.diceId,
					count: request.count
				});
			}
		});
		diceSpawnerOpen = false;
	}

	async function clearSpawnedDice() {
		await runAction('clear-dice', () => sendPlayCommand({ type: 'clearSpawnedDice' }));
	}

	async function rollSpawnedDice() {
		await runAction('roll-dice', () => sendPlayCommand({ type: 'rollSpawnedDice' }));
	}

	async function spawnMatItem(runeId: string) {
		await runAction('spawn-item', () => sendPlayCommand({ type: 'spawnMatItem', runeId }));
	}

	async function clearSpawnedItems() {
		await runAction('clear-items', () => sendPlayCommand({ type: 'clearSpawnedItems' }));
	}
</script>

<svelte:head>
	<title>{room.roomCode} | Arc Spirits Play</title>
</svelte:head>

<div class:immersive-route={!isLobby} class="play-room">
	{#if isLobby}
		<section class="room-header">
			<div>
				<div class="eyebrow">Live Room</div>
				<h1>{room.roomCode}</h1>
				<p>Seat players, assign guardians, then start the session.</p>
			</div>
			<div class="status-stack">
				<div class="pill">{room.status}</div>
				<div class="pill subtle">rev {room.revision}</div>
				<div class:offline={!playState.isConnected} class="pill subtle">
					{playState.isConnected ? 'stream live' : 'stream reconnecting'}
				</div>
			</div>
		</section>

		{#if actionError}
			<div class="action-error">{actionError}</div>
		{/if}

		<section class="identity-panel">
			<div>
				<div class="label">Viewer</div>
				<div class="identity">
					<strong>{member.displayName ?? 'Spectator'}</strong>
					<span>{member.role}</span>
					{#if member.seatColor}
						<span>{member.seatColor}</span>
					{/if}
				</div>
			</div>
			{#if isHost}
				<button
					type="button"
					class="btn-primary"
					disabled={pendingAction !== null}
					onclick={() => runAction('start', () => startPlayGame())}
				>
					{pendingAction === 'start' ? 'Starting…' : 'Start game'}
				</button>
			{/if}
		</section>

		<section class="seat-grid">
			{#each SEAT_COLORS as seatColor (seatColor)}
				{@const seat = room.seats[seatColor]}
				<article class="seat-card">
					<div class="seat-head">
						<h2>{seatColor}</h2>
						{#if seat.memberId}
							<span class="occupied">claimed</span>
						{:else}
							<span class="vacant">open</span>
						{/if}
					</div>

					<div class="seat-body">
						<div class="seat-meta">
							<div>{seat.displayName ?? 'No player'}</div>
							<div>{seat.selectedGuardian ?? 'No guardian selected'}</div>
						</div>

						{#if !seat.memberId && member.id}
							<button
								type="button"
								class="btn-secondary"
								disabled={pendingAction !== null}
								onclick={() => runAction(`claim-${seatColor}`, () => claimSeat(seatColor))}
							>
								Claim seat
							</button>
						{/if}

						{#if seat.memberId === member.id}
							<div class="seat-actions">
								<select
									value={currentSeatGuardian(seatColor)}
									onchange={(event) =>
										chooseGuardian((event.currentTarget as HTMLSelectElement).value)}
								>
									<option value="">Choose guardian</option>
									{#each room.guardianPool ?? [] as guardianName (guardianName)}
										<option value={guardianName}>{guardianName}</option>
									{/each}
								</select>
								<button
									type="button"
									class="btn-secondary"
									disabled={pendingAction !== null}
									onclick={releaseMySeat}
								>
									Release seat
								</button>
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</section>
	{:else}
		<div class="game-viewport">
			<TabletopScene
				projection={room}
				focusSeatColor={focusSeat}
				immersive={true}
				tableSettings={tableSettings}
				placementEditorEnabled={placementEditorEnabled}
				onFlipSpirit={requestSpiritFlip}
				onFlipPotentialToken={requestPotentialFlip}
				onSpiritSlotMoved={handleSpiritSlotMoved}
				onMoveMatObject={requestMoveMatObject}
			/>

				<div class="hud-layer">
					{#if actionError}
						<section class="hud-panel hud-error">{actionError}</section>
					{/if}

						<section class="hud-panel hud-left hud-actions">
							<div class="hud-kicker">Summon Spirits</div>
							<div class="action-stack">
								<button
									type="button"
									class="action-button"
									disabled={!member.seatColor || trayDraws.length > 0 || pendingAction !== null}
									onclick={drawSpiritWorldSummon}
								>
									Spirit World Draw 4 Pick 2
								</button>
								<button
									type="button"
									class="action-button abyss"
									disabled={!member.seatColor || trayDraws.length > 0 || pendingAction !== null}
									onclick={drawArcaneAbyssSummon}
								>
									Arcane Abyss Draw 3 Pick 1
								</button>
							</div>
							<div class="action-hint">Click a tray spirit to spawn it. Press <kbd>F</kbd> on a selected spirit to flip it.</div>

							<div class="action-divider"></div>
							<div class="hud-kicker">Mat Tools</div>
							<div class="tool-buttons">
									<button
										type="button"
										class="action-button muted"
										disabled={!member.seatColor || pendingAction !== null}
										onclick={() => (diceSpawnerOpen = !diceSpawnerOpen)}
									>
										{diceSpawnerOpen ? 'Hide Dice Spawner' : 'Spawn Dice'}
									</button>
									<button
										type="button"
										class="action-button muted"
										disabled={!member.seatColor || pendingAction !== null}
										onclick={rollSpawnedDice}
									>
										Roll Dice
									</button>
									<button
									type="button"
									class="action-button muted"
									disabled={!member.seatColor || pendingAction !== null}
									onclick={() => (itemPaletteOpen = !itemPaletteOpen)}
								>
									{itemPaletteOpen ? 'Hide Items' : 'Spawn Runes / Relics / Augments'}
								</button>
							</div>

							{#if diceSpawnerOpen}
								<div class="tool-panel">
									<div class="tool-panel-title">Dice Spawner</div>
									<div class="dice-list">
										{#each availableDice as die (die.id)}
											<div class="dice-row">
												<div class="dice-meta">
													{#if die.previewUrl}
														<img src={die.previewUrl} alt={die.name} />
													{/if}
													<div>
														<strong>{die.name}</strong>
														<span>{die.diceType === 'attack' ? 'Attack Dice' : die.diceType === 'special' ? 'Special Dice' : 'Defense Dice'}</span>
													</div>
												</div>
												<div class="dice-controls">
													<button type="button" class="mini-btn" onclick={() => adjustDiceCount(die.id, -1)}>-</button>
													<span>{diceCounts[die.id] ?? (die.id === 'defense_dice' ? 1 : 0)}</span>
													<button type="button" class="mini-btn" onclick={() => adjustDiceCount(die.id, 1)}>+</button>
												</div>
											</div>
										{/each}
									</div>
									<div class="tool-action-row">
										<button type="button" class="action-button small" onclick={spawnSelectedDice}>Spawn Selected</button>
										<button type="button" class="action-button small muted" onclick={clearSpawnedDice}>Clear Dice</button>
									</div>
								</div>
							{/if}

							{#if itemPaletteOpen}
								<div class="tool-panel">
									<div class="tool-panel-title">{categoryLabel(itemPaletteFilter)}</div>
									<div class="filter-tabs">
										{#each ['rune', 'augment', 'relic'] as kind}
											<button
												type="button"
												class:active={itemPaletteFilter === kind}
												class="filter-tab"
												onclick={() => (itemPaletteFilter = kind as MatItemKind)}
											>
												{categoryLabel(kind as MatItemKind)}
											</button>
										{/each}
									</div>
									<div class="item-grid">
										{#each filteredSpawnItems as rune (rune.id)}
											<button type="button" class="item-card" onclick={() => spawnMatItem(rune.id)}>
												{#if runePreviewUrl(rune)}
													<img src={runePreviewUrl(rune) ?? ''} alt={rune.name} />
												{/if}
												<span>{rune.name}</span>
											</button>
										{/each}
									</div>
									<div class="tool-action-row">
										<button type="button" class="action-button small muted" onclick={clearSpawnedItems}>Clear Items</button>
									</div>
								</div>
							{/if}
						</section>

						<section class="hud-panel hud-settings-toggle">
							<button
								type="button"
								class:active={settingsOpen}
								class="settings-button"
								onclick={() => (settingsOpen = !settingsOpen)}
							>
								Table Settings
							</button>
						</section>

						{#if settingsOpen}
							<section class="hud-panel hud-settings">
								<div class="settings-header">
									<div>
										<div class="hud-kicker">Table Editor</div>
										<div class="settings-title">Placement</div>
									</div>
									<button
										type="button"
										class:active={placementEditorEnabled}
										class="editor-toggle"
										onclick={() => (placementEditorEnabled = !placementEditorEnabled)}
									>
										{placementEditorEnabled ? 'Dragging On' : 'Dragging Off'}
									</button>
								</div>

								<div class="settings-section">
									<label class="range-row">
										<span>Hex scale</span>
										<input
											type="range"
											min="0.35"
											max="1.15"
											step="0.01"
											value={tableSettings.hexRadius}
											oninput={(event) => updateHexRadius(event.currentTarget.value)}
										/>
										<output>{tableSettings.hexRadius.toFixed(2)}</output>
									</label>
								</div>

									<div class="settings-section">
										<div class="settings-subtitle">Spirit Slots</div>
										<div class="slot-editor-grid">
											{#each [1, 2, 3, 4, 5, 6, 7] as slotIndex}
											<div class="slot-row">
												<span class="slot-label">{slotIndex}</span>
												<label>
													<span>X</span>
													<input
														type="number"
														step="0.01"
														value={tableSettings.spiritSlots[slotIndex].x}
														oninput={(event) => updateSpiritSlot(slotIndex, 'x', event.currentTarget.value)}
													/>
												</label>
												<label>
													<span>Z</span>
													<input
														type="number"
														step="0.01"
														value={tableSettings.spiritSlots[slotIndex].z}
														oninput={(event) => updateSpiritSlot(slotIndex, 'z', event.currentTarget.value)}
													/>
												</label>
											</div>
										{/each}
										</div>
									</div>

									<div class="settings-section">
										<div class="settings-subtitle">Corruption Status Token</div>
										<div class="slot-row">
											<span class="slot-label">Status</span>
											<label>
												<span>X</span>
												<input
													type="number"
													step="0.01"
													value={tableSettings.corruptionStatusToken.x}
													oninput={(event) => updateCorruptionStatusToken('x', event.currentTarget.value)}
												/>
											</label>
											<label>
												<span>Z</span>
												<input
													type="number"
													step="0.01"
													value={tableSettings.corruptionStatusToken.z}
													oninput={(event) => updateCorruptionStatusToken('z', event.currentTarget.value)}
												/>
											</label>
										</div>
										<label class="range-row">
											<span>Status scale</span>
											<input
												type="range"
												min="0.5"
												max="4"
												step="0.05"
												value={tableSettings.corruptionStatusToken.scale}
												oninput={(event) => updateCorruptionStatusToken('scale', event.currentTarget.value)}
											/>
											<output>{tableSettings.corruptionStatusToken.scale.toFixed(2)}</output>
										</label>
									</div>

									<div class="settings-section">
										<div class="settings-subtitle">Lighting</div>
									<label class="range-row">
										<span>Ambient</span>
										<input type="range" min="0" max="4" step="0.05" value={tableSettings.lighting.ambientIntensity} oninput={(event) => updateLighting('ambientIntensity', event.currentTarget.value)} />
										<output>{tableSettings.lighting.ambientIntensity.toFixed(2)}</output>
									</label>
									<label class="range-row">
										<span>Key</span>
										<input type="range" min="0" max="6" step="0.05" value={tableSettings.lighting.keyIntensity} oninput={(event) => updateLighting('keyIntensity', event.currentTarget.value)} />
										<output>{tableSettings.lighting.keyIntensity.toFixed(2)}</output>
									</label>
									<label class="range-row">
										<span>Fill</span>
										<input type="range" min="0" max="6" step="0.05" value={tableSettings.lighting.fillIntensity} oninput={(event) => updateLighting('fillIntensity', event.currentTarget.value)} />
										<output>{tableSettings.lighting.fillIntensity.toFixed(2)}</output>
									</label>
									<label class="range-row">
										<span>Overhead</span>
										<input type="range" min="0" max="24" step="0.1" value={tableSettings.lighting.overheadIntensity} oninput={(event) => updateLighting('overheadIntensity', event.currentTarget.value)} />
										<output>{tableSettings.lighting.overheadIntensity.toFixed(1)}</output>
									</label>
									<label class="range-row">
										<span>Height</span>
										<input type="range" min="6" max="24" step="0.25" value={tableSettings.lighting.overheadHeight} oninput={(event) => updateLighting('overheadHeight', event.currentTarget.value)} />
										<output>{tableSettings.lighting.overheadHeight.toFixed(1)}</output>
									</label>
									<label class="range-row">
										<span>Cone</span>
										<input type="range" min="0.2" max="1.3" step="0.01" value={tableSettings.lighting.overheadAngle} oninput={(event) => updateLighting('overheadAngle', event.currentTarget.value)} />
										<output>{tableSettings.lighting.overheadAngle.toFixed(2)}</output>
									</label>
								</div>

								<div class="settings-section">
									<div class="settings-subtitle">JSON</div>
									<textarea
										class="settings-json"
										spellcheck="false"
										value={placementImportText || tableSettingsJson}
										oninput={(event) => (placementImportText = event.currentTarget.value)}
									></textarea>
									{#if placementImportError}
										<div class="settings-error">{placementImportError}</div>
									{/if}
									<div class="settings-actions">
										<button type="button" class="action-button small" onclick={applyImportedTableSettings}>Apply JSON</button>
										<button type="button" class="action-button small muted" onclick={resetTableSettings}>Reset</button>
									</div>
								</div>
							</section>
						{/if}

					<section class="hud-panel hud-right hud-navigator">
						<div class="hud-kicker">Realm Navigator</div>
						<div class="navigator-list">
						{#each room.activeSeats as seatColor (seatColor)}
							{@const player = room.players[seatColor] ?? null}
							{@const seat = room.seats[seatColor]}
							<div class:chosen={!!player?.navigationDestination} class="navigator-row">
								<div class="navigator-main">
									<strong>{seat.displayName ?? seatColor}</strong>
									<span>{player?.navigationDestination ?? 'Waiting for destination'}</span>
								</div>
								<div class="navigator-vp">{player?.victoryPoints ?? 0} VP</div>
							</div>
						{/each}
					</div>

					<button
						type="button"
						class="navigator-button"
						disabled={!member.seatColor || pendingAction !== null}
						onclick={() => (navSelectorOpen = !navSelectorOpen)}
					>
						Choose Destination
					</button>

					{#if navSelectorOpen}
						<div class="navigator-selector">
							<div class="navigator-selector-title">Choose Destination</div>

							<div class="navigator-option-group">
								{#each navigationPrimaryLocations as location (location)}
									<button
										type="button"
										class:active={focusedPlayer?.navigationDestination === location}
										class="navigator-option priority"
										disabled={!member.seatColor || pendingAction !== null}
										onclick={() => chooseDestination(location)}
									>
										{location}
									</button>
								{/each}
							</div>

							<div class="navigator-option-gap"></div>

							<div class="navigator-option-group">
								<button
									type="button"
									class:active={focusedPlayer?.navigationDestination === 'Arcane Abyss'}
									class="navigator-option"
									disabled={!member.seatColor || pendingAction !== null}
									onclick={() => chooseDestination('Arcane Abyss')}
								>
									Arcane Abyss
								</button>
							</div>

							<button
								type="button"
								class="navigator-cancel"
								onclick={() => (navSelectorOpen = false)}
							>
								Cancel
							</button>
						</div>
						{/if}
					</section>

					<section class="hud-panel hud-bottom-right hud-class-sidebar">
					<div class="class-sidebar-header">
						<div class:human={classViewMode === 'human'} class:special={classViewMode === 'special'} class="class-sidebar-title">
							{classHeader}
						</div>
						<button type="button" class="class-toggle" onclick={toggleClassView}>
							{classToggleLabel}
						</button>
					</div>

					<div class="class-list">
						{#each visibleClasses as classTrait (classTrait.id)}
							<button
								type="button"
								class:active={selectedClassId === classTrait.id}
								class="class-row"
								onclick={() => toggleClassDetails(classTrait.id)}
							>
								{#if toAssetUrl(classTrait.icon_png)}
									<img src={toAssetUrl(classTrait.icon_png) ?? ''} alt={classTrait.name} />
								{/if}
								<span>{classTrait.name}</span>
							</button>
						{/each}
					</div>
				</section>

				{#if selectedClass}
					<section class="hud-panel hud-class-detail">
						<div class="class-detail-header">
							{#if toAssetUrl(selectedClass.icon_png)}
								<img src={toAssetUrl(selectedClass.icon_png) ?? ''} alt={selectedClass.name} />
							{/if}
							<div>
								<div class="class-detail-name">{selectedClass.name}</div>
								{#if selectedClass.description}
									<div class="class-detail-desc">{selectedClass.description}</div>
								{/if}
							</div>
						</div>

						<div class="class-detail-breakpoints">
							{#each classBreakpoints(selectedClass) as breakpoint (`${selectedClass.id}:${String(breakpoint.count)}`)}
								<div class="breakpoint-row">
									<div class="breakpoint-count">({breakpoint.count})</div>
									<div class="breakpoint-text">{breakpointDescription(breakpoint)}</div>
								</div>
							{/each}
						</div>

						{#if selectedClass.footer}
							<div class="class-detail-footer">{selectedClass.footer}</div>
						{/if}
					</section>
				{/if}

				{#if trayDraws.length > 0 && pendingDrawMeta}
					<section class="hud-panel hud-draw-tray">
						<div class="draw-tray-header">
							<div>
								<div class="draw-tray-title">{pendingDrawMeta.sourceBag}</div>
								<div class="draw-tray-subtitle">
									Picks left:
									{Math.max(0, pendingDrawMeta.summonLimit - pendingDrawMeta.summonedCount)}
								</div>
							</div>
							<button
								type="button"
								class="draw-tray-discard"
								disabled={pendingAction !== null}
								onclick={discardDrawTray}
							>
								Return Unchosen
							</button>
						</div>

						<div class="draw-tray-cards">
							{#each trayDraws as draw (draw.guid)}
								<button
									type="button"
									class="draw-card"
									disabled={pendingAction !== null}
									onclick={() => summonDrawnSpirit(draw.guid)}
								>
									{#if drawPreviewUrl(draw)}
										<img src={drawPreviewUrl(draw) ?? ''} alt={draw.name ?? 'Spirit'} />
									{:else}
										<div class="draw-card-fallback">{draw.name ?? 'Spirit'}</div>
									{/if}
									<div class="draw-card-meta">
										<strong>{draw.name ?? 'Unknown Spirit'}</strong>
										<span>
											{draw.sourceBag === 'Arcane Abyss Bag' ? 'Face-down abyss summon' : 'Face-up spirit world summon'}
										</span>
									</div>
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<a class="hud-exit" href="/play">Exit room</a>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(html.immersive-play),
	:global(body.immersive-play) {
		height: 100%;
		overflow: hidden;
	}

	:global(body.immersive-play .topbar) {
		display: none !important;
	}

	:global(body.immersive-play .app),
	:global(body.immersive-play .app > .flex-1) {
		height: 100vh;
		overflow: hidden;
	}

	.play-room {
		max-width: 1320px;
		margin: 0 auto;
		padding: 32px 24px 80px;
	}

	.play-room.immersive-route {
		position: fixed;
		inset: 0;
		max-width: none;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	/* ── Lobby header ─────────────────────────────────────── */
	.room-header {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		padding: 32px 36px;
		background: var(--color-tomb);
		border: 1px solid var(--brand-violet);
		border-radius: 4px;
		position: relative;
	}

	/* Single magenta underline accent */
	.room-header::after {
		content: '';
		position: absolute;
		left: 36px;
		bottom: 0;
		width: 56px;
		height: 3px;
		background: var(--brand-magenta);
	}

	.identity-panel {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin-top: 16px;
		padding: 20px 24px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		border-radius: 4px;
	}

	.seat-card,
	.action-error {
		border: 1px solid var(--color-mist);
		background: var(--color-tomb);
	}

	.action-error {
		margin-top: 16px;
		padding: 14px 20px;
		border-left: 3px solid var(--color-blood);
		color: var(--color-parchment);
		background: rgba(110, 18, 35, 0.3);
	}

	.eyebrow,
	.label {
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}

	h1,
	h2 {
		font-family: var(--font-display);
		color: #fff;
	}

	/* Room code: enormous Bebas Neue magenta */
	h1 {
		margin: 6px 0 10px;
		font-size: clamp(3.5rem, 6vw, 5.5rem);
		color: var(--brand-magenta);
		font-variant-numeric: tabular-nums;
		line-height: 0.92;
	}

	.room-header p,
	.identity,
	.seat-meta {
		color: var(--color-fog);
	}

	.status-stack {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: flex-end;
		gap: 8px;
	}

	/* Flat pill badges — no gradient backgrounds */
	.pill {
		padding: 6px 12px;
		border-radius: 2px;
		background: transparent;
		border: 1px solid var(--brand-magenta);
		color: var(--brand-magenta);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.pill.subtle {
		border-color: var(--brand-cyan);
		color: var(--brand-cyan);
	}

	.pill.offline {
		border-color: var(--color-blood);
		color: var(--color-blood);
	}

	.identity {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 8px;
	}

	/* Solid buttons — no gradients */
	.btn-primary,
	.btn-secondary {
		cursor: pointer;
		font-family: var(--font-display);
		border-radius: 0;
	}

	.btn-primary,
	.btn-secondary {
		padding: 12px 20px;
		font-size: 0.85rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		border: none;
	}

	.btn-primary {
		background: var(--brand-magenta);
		color: #fff;
		transition: background 150ms ease;
	}

	.btn-primary:hover {
		background: var(--brand-magenta-soft);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: transparent;
		color: var(--brand-cyan);
		border: 1px solid var(--brand-cyan);
		transition: background 150ms ease, color 150ms ease;
	}

	.btn-secondary:hover {
		background: rgba(36, 212, 255, 0.1);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.seat-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		margin-top: 22px;
	}

	.seat-card {
		padding: 20px;
		border-radius: 4px;
	}

	.seat-head,
	.seat-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	/* Seat color names: large Bebas Neue */
	.seat-head h2 {
		margin: 0;
		font-size: 2rem;
		letter-spacing: 0.06em;
		color: #fff;
	}

	.seat-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-top: 12px;
	}

	.occupied {
		color: var(--brand-amber);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.vacant {
		color: var(--brand-teal);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select {
		width: 100%;
		padding: 12px 14px;
		border-radius: 0;
		border: 1px solid var(--color-aether);
		background: var(--color-shadow);
		color: #fff;
		font-family: var(--font-body);
		transition: border-color 150ms ease;
	}

	select:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	.game-viewport {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--color-void);
	}

	.game-viewport :global(.scene-shell) {
		position: absolute;
		inset: 0;
	}

	.hud-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.hud-panel,
	.hud-exit {
		pointer-events: auto;
	}

	/* HUD panels: solid dark block, single 1px violet border, blur for legibility */
	.hud-panel {
		position: absolute;
		padding: 14px 16px;
		border-radius: 2px;
		background: rgba(10, 7, 20, 0.84);
		border: 1px solid var(--brand-violet);
		backdrop-filter: blur(10px);
	}

	.hud-left {
		top: 20px;
		left: 20px;
		width: 286px;
	}

	.hud-right {
		top: 20px;
		right: 20px;
		width: 220px;
	}

	.hud-navigator {
		width: 286px;
		overflow: visible;
	}

	.hud-bottom-right {
		right: 20px;
		bottom: 20px;
		width: 240px;
	}

	.hud-settings-toggle {
		top: 20px;
		left: 326px;
		padding: 6px;
		border-radius: 2px;
	}

	.settings-button,
	.editor-toggle {
		border: 1px solid var(--color-mist);
		background: transparent;
		color: var(--color-parchment);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: border-color 150ms ease, color 150ms ease;
	}

	.settings-button {
		padding: 10px 14px;
		border-radius: 2px;
	}

	.settings-button.active,
	.editor-toggle.active {
		border-color: var(--brand-cyan);
		color: var(--brand-cyan);
	}

	.hud-settings {
		top: 72px;
		left: 326px;
		width: 386px;
		max-height: calc(100vh - 112px);
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.settings-header,
	.settings-actions,
	.range-row,
	.slot-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.settings-header {
		justify-content: space-between;
	}

	.settings-title,
	.settings-subtitle {
		font-family: var(--font-display);
		text-transform: uppercase;
		color: #fff;
	}

	.settings-title {
		margin-top: 4px;
		font-size: 1rem;
		letter-spacing: 0.08em;
	}

	.settings-subtitle {
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		color: var(--brand-cyan);
	}

	.editor-toggle {
		padding: 8px 10px;
		border-radius: 2px;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 9px;
		padding: 10px;
		border-radius: 2px;
		background: rgba(8, 6, 17, 0.92);
		border: 1px solid var(--color-mist);
	}

	.range-row {
		display: grid;
		grid-template-columns: 74px minmax(0, 1fr) 46px;
	}

	.range-row span,
	.slot-row label span {
		font-size: 0.68rem;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.range-row input[type='range'] {
		width: 100%;
		accent-color: var(--brand-magenta);
	}

	.range-row output {
		font-variant-numeric: tabular-nums;
		color: #fff;
		font-size: 0.72rem;
		text-align: right;
	}

	.slot-editor-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.slot-row {
		display: grid;
		grid-template-columns: 22px 1fr 1fr;
	}

	.slot-label {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: rgba(36, 212, 255, 0.14);
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 0.7rem;
	}

	.slot-row label {
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr);
		align-items: center;
		gap: 5px;
	}

	.slot-row input {
		width: 100%;
		min-width: 0;
		padding: 6px 7px;
		border-radius: 0;
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
		color: #fff;
		font-size: 0.74rem;
	}

	.settings-json {
		width: 100%;
		min-height: 156px;
		resize: vertical;
		padding: 9px;
		border-radius: 0;
		border: 1px solid var(--color-mist);
		background: var(--color-void);
		color: var(--color-parchment);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.settings-error {
		color: var(--color-blood);
		font-size: 0.74rem;
	}

	.hud-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Exit: ghost button, bottom-left */
	.hud-exit {
		position: absolute;
		left: 20px;
		bottom: 20px;
		padding: 10px 18px;
		border-radius: 2px;
		background: rgba(10, 7, 20, 0.84);
		border: 1px solid var(--color-mist);
		color: var(--color-parchment);
		text-decoration: none;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		backdrop-filter: blur(8px);
		transition: border-color 150ms ease, color 150ms ease;
	}

	.hud-exit:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta-soft);
	}

	.hud-kicker {
		font-family: var(--font-display);
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}

	.action-stack {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.action-button {
		width: 100%;
		padding: 11px 12px;
		border-radius: 2px;
		border: 1px solid var(--color-aether);
		background: var(--color-crypt);
		color: #fff;
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition: border-color 150ms ease, background 150ms ease;
	}

	.action-button:hover:not(:disabled) {
		border-color: var(--brand-magenta);
		background: rgba(255, 43, 199, 0.08);
	}

	/* Abyss draw: magenta-tinted */
	.action-button.abyss {
		background: rgba(54, 8, 30, 0.9);
		border-color: var(--brand-magenta);
		color: var(--brand-magenta-soft);
	}

	.action-button.abyss:hover:not(:disabled) {
		background: rgba(255, 43, 199, 0.12);
	}

	.action-hint {
		color: var(--color-fog);
		font-size: 0.74rem;
		line-height: 1.45;
	}

	/* Single cyan rule divider — no gradient */
	.action-divider {
		height: 1px;
		margin: 2px 0;
		background: var(--brand-cyan);
		opacity: 0.22;
	}

	.tool-buttons,
	.tool-action-row {
		display: flex;
		gap: 8px;
	}

	.action-button.muted {
		background: var(--color-shadow);
		border-color: var(--color-mist);
		color: var(--color-parchment);
	}

	.action-button.small {
		padding: 9px 10px;
		font-size: 0.7rem;
	}

	.tool-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px;
		border-radius: 2px;
		background: var(--color-void);
		border: 1px solid var(--brand-violet);
	}

	.tool-panel-title {
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fff;
	}

	.dice-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 280px;
		overflow: auto;
	}

	.dice-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px;
		border-radius: 2px;
		background: var(--color-crypt);
		border: 1px solid var(--color-mist);
	}

	.dice-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.dice-meta img {
		width: 28px;
		height: 28px;
		object-fit: contain;
		flex: none;
	}

	.dice-meta strong,
	.item-card span {
		display: block;
		color: #fff;
		font-size: 0.78rem;
	}

	.dice-meta span {
		display: block;
		color: var(--color-fog);
		font-size: 0.7rem;
	}

	.dice-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #fff;
		font-family: var(--font-display);
	}

	.mini-btn {
		width: 24px;
		height: 24px;
		border-radius: 2px;
		border: 1px solid var(--color-aether);
		background: var(--color-shadow);
		color: #fff;
		cursor: pointer;
		transition: border-color 150ms ease;
	}

	.mini-btn:hover {
		border-color: var(--brand-magenta);
	}

	.filter-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.filter-tab {
		padding: 6px 10px;
		border-radius: 2px;
		border: 1px solid var(--color-mist);
		background: transparent;
		color: var(--color-parchment);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 150ms ease;
	}

	/* Selected filter tab: solid magenta */
	.filter-tab.active {
		background: var(--brand-magenta);
		border-color: var(--brand-magenta);
		color: #fff;
	}

	.item-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		max-height: 300px;
		overflow: auto;
	}

	.item-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border-radius: 2px;
		border: 1px solid var(--color-mist);
		background: var(--color-crypt);
		cursor: pointer;
		text-align: left;
		transition: border-color 150ms ease;
	}

	.item-card:hover {
		border-color: var(--brand-magenta);
	}

	.item-card img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: contain;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.04);
	}

	kbd {
		padding: 1px 6px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid var(--color-mist);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: #fff;
	}

	.navigator-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 12px;
	}

	/* Navigator rows: flat solid backgrounds, saturated borders */
	.navigator-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 7px 10px;
		border-radius: 2px;
		background: rgba(80, 12, 24, 0.7);
		border-left: 3px solid var(--color-blood);
	}

	.navigator-row.chosen {
		background: rgba(14, 80, 52, 0.7);
		border-left-color: var(--brand-teal);
	}

	.navigator-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.navigator-main strong {
		font-size: 0.86rem;
		color: #fff;
		font-family: var(--font-display);
		letter-spacing: 0.06em;
	}

	.navigator-main span,
	.navigator-vp {
		font-size: 0.72rem;
		color: var(--color-fog);
	}

	.navigator-vp {
		font-family: var(--font-display);
		letter-spacing: 0.1em;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.navigator-button,
	.navigator-option,
	.navigator-cancel,
	.class-toggle,
	.class-row {
		cursor: pointer;
	}

	.navigator-button {
		width: 100%;
		margin-top: 10px;
		padding: 10px 12px;
		border-radius: 2px;
		border: 1px solid var(--brand-magenta);
		background: rgba(255, 43, 199, 0.08);
		color: var(--brand-magenta-soft);
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		transition: background 150ms ease;
	}

	.navigator-button:hover:not(:disabled) {
		background: rgba(255, 43, 199, 0.16);
	}

	.navigator-selector {
		margin-top: 10px;
		padding: 10px;
		border-radius: 2px;
		background: var(--color-void);
		border: 1px solid var(--brand-violet);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.navigator-selector-title {
		font-family: var(--font-display);
		font-size: 0.88rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.navigator-option-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.navigator-option-gap {
		height: 10px;
	}

	.navigator-option,
	.navigator-cancel {
		width: 100%;
		padding: 8px 10px;
		border-radius: 2px;
		border: 1px solid var(--color-mist);
		background: var(--color-crypt);
		color: #fff;
		text-align: left;
		font-size: 0.84rem;
		transition: border-color 150ms ease, background 150ms ease;
	}

	.navigator-option.priority {
		color: var(--color-blood);
		border-color: rgba(255, 77, 109, 0.4);
	}

	.navigator-option.active {
		border-color: var(--brand-magenta);
		background: rgba(255, 43, 199, 0.1);
		color: var(--brand-magenta-soft);
	}

	.navigator-cancel {
		margin-top: 4px;
		text-align: center;
		color: var(--color-parchment);
		background: transparent;
		border-color: var(--color-mist);
	}

	.class-sidebar-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.class-sidebar-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #fff;
	}

	.class-sidebar-title.human {
		color: var(--brand-cyan);
	}

	.class-sidebar-title.special {
		color: var(--brand-amber);
	}

	.class-toggle {
		padding: 7px 10px;
		border-radius: 2px;
		border: 1px solid var(--brand-amber);
		background: transparent;
		color: var(--brand-amber);
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		transition: background 150ms ease;
	}

	.class-toggle:hover {
		background: rgba(255, 186, 61, 0.1);
	}

	.class-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 12px;
		max-height: 420px;
		overflow: auto;
	}

	.class-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 8px;
		border-radius: 2px;
		border: 1px solid var(--color-mist);
		background: var(--color-crypt);
		color: #fff;
		text-align: left;
		font-size: 0.8rem;
		transition: border-color 150ms ease;
	}

	.class-row:hover {
		border-color: var(--brand-violet);
	}

	.class-row.active {
		border-color: var(--brand-magenta);
		background: rgba(255, 43, 199, 0.08);
	}

	.class-row img,
	.class-detail-header img {
		width: 20px;
		height: 20px;
		object-fit: contain;
		flex: none;
	}

	.hud-class-detail {
		right: 276px;
		bottom: 20px;
		width: 350px;
		max-height: min(696px, calc(100vh - 40px));
		overflow: auto;
	}

	.class-detail-header {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.class-detail-name {
		font-family: var(--font-display);
		font-size: 1.4rem;
		letter-spacing: 0.06em;
		color: #fff;
	}

	.class-detail-desc,
	.class-detail-footer {
		margin-top: 8px;
		color: var(--color-fog);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.class-detail-breakpoints {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 14px;
	}

	.breakpoint-row {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		gap: 8px;
	}

	.breakpoint-count {
		font-family: var(--font-display);
		color: var(--brand-magenta);
		font-size: 1rem;
	}

	.breakpoint-text {
		color: var(--color-parchment);
		font-size: 0.86rem;
		line-height: 1.45;
	}

	.hud-error {
		top: 20px;
		left: 326px;
		max-width: 420px;
		color: var(--color-parchment);
		border-left: 3px solid var(--color-blood);
	}

	.hud-draw-tray {
		left: 50%;
		bottom: 20px;
		width: min(900px, calc(100vw - 360px));
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.draw-tray-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.draw-tray-title {
		font-family: var(--font-display);
		font-size: 1.2rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fff;
	}

	.draw-tray-subtitle {
		margin-top: 4px;
		font-size: 0.76rem;
		color: var(--color-fog);
	}

	.draw-tray-discard {
		padding: 9px 14px;
		border-radius: 2px;
		border: 1px solid var(--color-blood);
		background: rgba(93, 21, 37, 0.6);
		color: var(--color-blood);
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.draw-tray-discard:hover {
		background: rgba(255, 77, 109, 0.15);
	}

	.draw-tray-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 12px;
	}

	.draw-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border-radius: 2px;
		border: 1px solid var(--color-mist);
		background: var(--color-crypt);
		cursor: pointer;
		color: #fff;
		text-align: left;
		transition: border-color 150ms ease;
	}

	.draw-card:hover:not(:disabled) {
		border-color: var(--brand-magenta);
	}

	.draw-card img,
	.draw-card-fallback {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 2px;
		object-fit: cover;
		background: rgba(255, 255, 255, 0.04);
	}

	.draw-card-fallback {
		display: grid;
		place-items: center;
		padding: 12px;
		font-family: var(--font-display);
	}

	.draw-card-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.draw-card-meta strong {
		font-size: 0.84rem;
		font-family: var(--font-display);
		letter-spacing: 0.06em;
	}

	.draw-card-meta span {
		font-size: 0.72rem;
		color: var(--color-fog);
		line-height: 1.35;
	}

	@media (max-width: 820px) {
		.seat-grid {
			grid-template-columns: 1fr;
		}

		.identity-panel,
		.room-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.hud-right,
		.hud-left {
			width: calc(100vw - 40px);
			right: 20px;
			left: 20px;
		}

		.hud-left {
			top: 20px;
		}

		.hud-right {
			top: auto;
			bottom: 208px;
		}

		.hud-error {
			left: 20px;
			top: 220px;
			max-width: calc(100vw - 40px);
		}

		.hud-draw-tray {
			left: 20px;
			right: 20px;
			bottom: 68px;
			width: auto;
			transform: none;
		}
	}
</style>
