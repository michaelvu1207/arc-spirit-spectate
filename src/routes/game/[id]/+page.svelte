<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, onDestroy } from 'svelte';
	import GameViewer from '$lib/components/GameViewer.svelte';
	import ErrorDisplay from '$lib/components/ErrorDisplay.svelte';
	import ResourceGraph from '$lib/components/ResourceGraph.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import GameNotes from '$lib/components/GameNotes.svelte';
	import RoundBagsPanel from '$lib/components/RoundBagsPanel.svelte';
	import HostNotesEditor from '$lib/components/HostNotesEditor.svelte';
	import PlayerFeedbackForm from '$lib/components/PlayerFeedbackForm.svelte';
	import { toFullReplayCode, toShortReplayCode } from '$lib/replayCodes';
	import {
		loadGame,
		cleanup,
		getGameState,
		goToRound,
		toggleLive,
		acknowledgeNewData,
		getGraphData,
		refreshGameNotes,
		refreshPlayerFeedback
	} from '$lib/stores/gameStore.svelte';
	import { loadAssets, getAssetState } from '$lib/stores/assetStore.svelte';
	import { STORAGE_BASE_URL } from '$lib/supabase';

	interface Props {
		data: {
			gameId: string;
			isAdmin: boolean;
			taggingConfigError: string | null;
			compositionTagsByColor: Record<string, string[]>;
			tagOptions: string[];
		};
		form?: { error?: string } | null;
	}

	let { data, form }: Props = $props();

	const gameState = getGameState();
	const assetState = getAssetState();

	// Derived loading state
	const isLoading = $derived(gameState.isLoading || assetState.isLoading);
	const hasGameError = $derived(gameState.error !== null);
	const hasAssetError = $derived(assetState.error !== null);
	const hasAnyError = $derived(hasGameError || hasAssetError);

	// Build graph data from historical snapshots
	const graphData = $derived(getGraphData());

	// Show graphs section when we have historical data (more than 1 round)
	const showGraphs = $derived(graphData.length > 1);

	let initialSelectedPlayerColor = $state<string | null>(null);

	type TagPlayerRow = {
		playerColor: string;
		username: string | null;
		character: string;
	};

	const tagPlayers = $derived(() => {
		const finalSnapshots = gameState.allRoundSnapshots.get(gameState.maxNavigation) ?? [];
		const source = finalSnapshots.length > 0 ? finalSnapshots : gameState.playerSnapshots;

		const byColor = new Map<string, TagPlayerRow>();
		for (const s of source) {
			if (byColor.has(s.playerColor)) continue;
			byColor.set(s.playerColor, {
				playerColor: s.playerColor,
				username: s.ttsUsername ?? null,
				character: s.selectedCharacter
			});
		}

		return Array.from(byColor.values()).sort((a, b) => a.playerColor.localeCompare(b.playerColor));
	});

	type BarrierChangeRow = {
		playerColor: string;
		username: string | null;
		startBarrier: number | null;
		endBarrier: number | null;
		gained: number;
		lost: number;
		net: number | null;
	};

	function computeBarrierChanges(): BarrierChangeRow[] {
		const byPlayer = new Map<
			string,
			{
				startBarrier: number | null;
				endBarrier: number | null;
				lastBarrier: number | null;
				gained: number;
				lost: number;
			}
		>();

		for (const round of graphData) {
			for (const player of round.players) {
				const key = player.color;
				let entry = byPlayer.get(key);
				if (!entry) {
					entry = {
						startBarrier: player.barrier,
						endBarrier: player.barrier,
						lastBarrier: player.barrier,
						gained: 0,
						lost: 0
					};
					byPlayer.set(key, entry);
					continue;
				}

				const prev = entry.lastBarrier;
				const next = player.barrier;
				if (prev != null) {
					const diff = next - prev;
					if (diff > 0) entry.gained += diff;
					else if (diff < 0) entry.lost += -diff;
				}

				if (entry.startBarrier == null) entry.startBarrier = next;
				entry.endBarrier = next;
				entry.lastBarrier = next;
			}
		}

		const finalSnapshots = gameState.allRoundSnapshots.get(gameState.maxNavigation) ?? [];
		const usernamesByColor = new Map<string, string | null>();
		for (const snapshot of finalSnapshots) {
			usernamesByColor.set(snapshot.playerColor, snapshot.ttsUsername ?? null);
		}

		return Array.from(byPlayer.entries())
			.map(([playerColor, v]) => {
				const startBarrier = v.startBarrier;
				const endBarrier = v.endBarrier;
				return {
					playerColor,
					username: usernamesByColor.get(playerColor) ?? null,
					startBarrier,
					endBarrier,
					gained: v.gained,
					lost: v.lost,
					net: startBarrier != null && endBarrier != null ? endBarrier - startBarrier : null
				};
			})
			.sort((a, b) => a.playerColor.localeCompare(b.playerColor));
	}

	const barrierChanges = $derived(computeBarrierChanges());

	// Compute player stats for summary table (VP, VP/barrier, rune inventory, augments)
	const playerStats = $derived(() => {
		const finalSnapshots = gameState.allRoundSnapshots.get(gameState.maxNavigation) ?? [];
		const barrierData = computeBarrierChanges();
		const barrierGainedByColor = new Map(barrierData.map((b) => [b.playerColor, b.gained]));
		const totalRounds = gameState.maxNavigation;

		return finalSnapshots
			.map((snapshot) => {
				const barrierGained = barrierGainedByColor.get(snapshot.playerColor) ?? 0;
				const isSpiritAugmentSlot = (slot: (typeof snapshot.runes)[number]) => {
					if (!slot?.hasRune) return false;
					const type = typeof slot.type === 'string' ? slot.type.toLowerCase() : null;
					const asset = slot.id ? assetState.runeAssets.get(slot.id) : null;
					return type === 'class' || Boolean(slot.classId) || Boolean(asset?.class_id);
				};
				const runeInventory = (snapshot.runes ?? []).filter(
					(slot) => slot.hasRune && !isSpiritAugmentSlot(slot)
				).length;
				const spiritAugmentsDrawn = (snapshot.runes ?? []).filter(isSpiritAugmentSlot).length;
				const spiritAugmentsOnSpirits = (snapshot.spiritRuneAttachments ?? []).filter(
					(attachment) => {
						const asset = attachment?.runeId ? assetState.runeAssets.get(attachment.runeId) : null;
						return !asset || Boolean(asset.class_id);
					}
				).length;
				const vpPerBarrier = barrierGained > 0 ? snapshot.victoryPoints / barrierGained : null;
				const vpPerRound = totalRounds > 0 ? snapshot.victoryPoints / totalRounds : null;

				return {
					playerColor: snapshot.playerColor,
					username: snapshot.ttsUsername ?? null,
					vp: snapshot.victoryPoints,
					barrierGained,
					vpPerBarrier,
					vpPerRound,
					runeInventory,
					spiritAugmentsDrawn,
					spiritAugmentsOnSpirits
				};
			})
			.sort((a, b) => b.vp - a.vp); // Sort by VP descending
	});

	const totalVictoryPoints = $derived(() => {
		const finalSnapshots = gameState.allRoundSnapshots.get(gameState.maxNavigation) ?? [];
		return finalSnapshots.reduce((sum, snapshot) => sum + snapshot.victoryPoints, 0);
	});

	const totalVictoryPointsPerRound = $derived(() => {
		if (gameState.maxNavigation <= 0) return null;
		return totalVictoryPoints() / gameState.maxNavigation;
	});

	const roundTimestamp = $derived(
		() => gameState.allRoundTimestamps.get(gameState.navigationCount) ?? null
	);

	const roundDeltaMs = $derived(() => {
		const currentRound = gameState.navigationCount;
		if (currentRound <= 1) return null;

		const currentTimestamp = gameState.allRoundTimestamps.get(currentRound);
		const previousTimestamp = gameState.allRoundTimestamps.get(currentRound - 1);
		if (!currentTimestamp || !previousTimestamp) return null;

		const currentMs = Date.parse(currentTimestamp);
		const previousMs = Date.parse(previousTimestamp);
		if (Number.isNaN(currentMs) || Number.isNaN(previousMs)) return null;

		const diff = currentMs - previousMs;
		return diff >= 0 ? diff : null;
	});

	let activeTab = $state<'round' | 'summary'>('round');
	let copiedReplayValue = $state<string | null>(null);
	let copyReplayTimer: ReturnType<typeof setTimeout> | null = null;
	let copiedShareValue = $state<string | null>(null);
	let copyShareTimer: ReturnType<typeof setTimeout> | null = null;
	let shareBaseUrl = $state<string>('');
	let selectedPlayerColorForShare = $state<string | null>(null);

	function formatTimestamp(timestamp: string | null): string {
		if (!timestamp) return '—';
		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return String(timestamp);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function formatDuration(ms: number | null): string {
		if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';

		const totalSeconds = Math.floor(ms / 1000);
		const seconds = totalSeconds % 60;
		const totalMinutes = Math.floor(totalSeconds / 60);
		const minutes = totalMinutes % 60;
		const hours = Math.floor(totalMinutes / 60);

		if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
		if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
		return `${seconds}s`;
	}

	function formatScenarioLabel(
		value: unknown
	): string | null {
		if (!value) return null;
		if (typeof value === 'string') {
			const trimmed = value.trim();
			return trimmed.length > 0 ? trimmed : null;
		}
		if (typeof value === 'object') {
			const anyValue = value as { name?: unknown; requested?: unknown };
			const name = typeof anyValue.name === 'string' ? anyValue.name.trim() : '';
			if (name) return name;
			const requested = typeof anyValue.requested === 'string' ? anyValue.requested.trim() : '';
			return requested ? requested : null;
		}
		return null;
	}

	const replayRounds = $derived(() => {
		const rounds: Array<{
			round: number;
			shortCode: string;
			fullCode: string;
			timestamp: string | null;
		}> = [];
		const maxRound = gameState.maxNavigation;
		const timestamps = gameState.allRoundTimestamps;
		for (let round = maxRound; round >= 1; round -= 1) {
			rounds.push({
				round,
				shortCode: toShortReplayCode(round),
				fullCode: toFullReplayCode(data.gameId, round),
				timestamp: timestamps.get(round) ?? null
			});
		}
		return rounds;
	});

	const currentReplayShort = $derived(() => toShortReplayCode(gameState.navigationCount));
	const currentReplayFull = $derived(() =>
		toFullReplayCode(data.gameId, gameState.navigationCount)
	);

	async function copyReplay(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedReplayValue = value;
			if (copyReplayTimer) clearTimeout(copyReplayTimer);
			copyReplayTimer = setTimeout(() => {
				copiedReplayValue = null;
			}, 2000);
		} catch (e) {
			console.error('Failed to copy replay code:', e);
		}
	}

	async function copyShareLink(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedShareValue = value;
			if (copyShareTimer) clearTimeout(copyShareTimer);
			copyShareTimer = setTimeout(() => {
				copiedShareValue = null;
			}, 2000);
		} catch (e) {
			console.error('Failed to copy share link:', e);
		}
	}

	const currentShareLink = $derived(() => {
		const params = new URLSearchParams();
		if (gameState.navigationCount > 0) params.set('round', String(gameState.navigationCount));
		if (selectedPlayerColorForShare) params.set('player', selectedPlayerColorForShare);
		const query = params.toString();
		const path = `/game/${encodeURIComponent(data.gameId)}${query ? `?${query}` : ''}`;
		return shareBaseUrl ? `${shareBaseUrl}${path}` : path;
	});

	const navigationTiming = $derived(() => {
		const rounds = Array.from(gameState.allRoundTimestamps.entries())
			.map(([round, timestamp]) => ({ round, timestamp, ms: Date.parse(timestamp) }))
			.filter((entry) => !Number.isNaN(entry.ms))
			.sort((a, b) => a.round - b.round);

		const intervals: Array<{ fromRound: number; toRound: number; ms: number }> = [];
		for (let i = 1; i < rounds.length; i += 1) {
			const diff = rounds[i].ms - rounds[i - 1].ms;
			if (diff >= 0) {
				intervals.push({ fromRound: rounds[i - 1].round, toRound: rounds[i].round, ms: diff });
			}
		}

		const totalTimeMs =
			rounds.length >= 2 ? Math.max(0, rounds[rounds.length - 1].ms - rounds[0].ms) : null;

		const avgMs =
			intervals.length > 0
				? Math.round(intervals.reduce((sum, interval) => sum + interval.ms, 0) / intervals.length)
				: null;

		let longest: { fromRound: number; toRound: number; ms: number } | null = null;
		for (const interval of intervals) {
			if (!longest || interval.ms > longest.ms) longest = interval;
		}

		return {
			startedAt: rounds[0]?.timestamp ?? null,
			endedAt: rounds[rounds.length - 1]?.timestamp ?? null,
			totalRoundsWithTimestamps: rounds.length,
			totalIntervals: intervals.length,
			totalTimeMs,
			avgMs,
			longest
		};
	});

	const navigationDestinationDistribution = $derived(() => {
		const counts = new Map<string, number>();
		let total = 0;

		for (const snapshots of gameState.allRoundSnapshots.values()) {
			for (const snapshot of snapshots) {
				const destination = snapshot.navigationDestination?.trim() ?? '';
				if (!destination) continue;
				total += 1;
				counts.set(destination, (counts.get(destination) ?? 0) + 1);
			}
		}

		const sorted = Array.from(counts.entries())
			.map(([destination, count]) => ({ destination, count }))
			.sort((a, b) => b.count - a.count || a.destination.localeCompare(b.destination));

		const maxRows = 10;
		const top = sorted.slice(0, maxRows);
		const otherCount = sorted.slice(maxRows).reduce((sum, row) => sum + row.count, 0);
		const rows = otherCount > 0 ? [...top, { destination: 'Other', count: otherCount }] : top;

		const maxCount = rows.reduce((m, row) => Math.max(m, row.count), 0);

		return {
			total,
			unique: counts.size,
			rows: rows.map((row) => ({
				...row,
				percent: total > 0 ? (row.count / total) * 100 : 0,
				barPercent: maxCount > 0 ? (row.count / maxCount) * 100 : 0
			}))
		};
	});

	const monsterImageMap = $derived(() => {
		const map = new Map<string, string>();
		for (const [id, asset] of assetState.monsterAssets) {
			const path = asset.image_path || asset.card_image_path || asset.icon;
			if (!path) continue;
			const url = path.startsWith('http') ? path : `${STORAGE_BASE_URL}/${path}`;
			map.set(id, url);
		}
		return map;
	});

	// Modal state for host notes editor and player feedback form
	let showHostNotesEditor = $state(false);
	let showPlayerFeedbackForm = $state(false);

	// Handle opening modals
	function handleEditNotes() {
		showHostNotesEditor = true;
	}

	function handleAddFeedback() {
		showPlayerFeedbackForm = true;
	}

	// Handle saving notes
	async function handleNotesSaved() {
		await refreshGameNotes();
	}

	// Handle feedback submitted
	async function handleFeedbackSubmitted() {
		await refreshPlayerFeedback();
	}

	// Determine error type for better messaging
	const errorInfo = $derived(() => {
		if (gameState.error) {
			if (gameState.error.includes('network') || gameState.error.includes('fetch')) {
				return {
					title: 'Connection Error',
					message:
						'Unable to connect to the game server. Please check your internet connection and try again.',
					variant: 'error' as const
				};
			}
			if (gameState.error.includes('not found') || gameState.error.includes('404')) {
				return {
					title: 'Game Not Found',
					message: `The game "${data.gameId}" could not be found. It may have been deleted or the ID is incorrect.`,
					variant: 'warning' as const
				};
			}
			return {
				title: 'Error Loading Game',
				message: gameState.error,
				variant: 'error' as const
			};
		}
		if (assetState.error) {
			return {
				title: 'Error Loading Assets',
				message: 'Failed to load game assets. The game may display without images.',
				variant: 'warning' as const
			};
		}
		return null;
	});

	// Handle round change from navigation or graph click
	function handleRoundChange(round: number) {
		goToRound(round);
	}

	function handleRoundSliderInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const nextRound = Number.parseInt(target.value, 10);
		if (Number.isFinite(nextRound)) handleRoundChange(nextRound);
	}

	// Handle live toggle
	function handleToggleLive() {
		toggleLive();
	}

	// Handle toast dismiss
	function handleToastDismiss() {
		acknowledgeNewData();
	}

	// Handle "Go to latest" action from toast
	function handleGoToLatest() {
		toggleLive(); // This will turn on live mode and navigate to latest
	}

	function handleRetry() {
		loadGame(data.gameId);
		loadAssets();
	}

	onMount(() => {
		shareBaseUrl = window.location.origin;
		const params = new URLSearchParams(window.location.search);
		const roundParam = params.get('round');
		const parsedRound = roundParam ? Number.parseInt(roundParam, 10) : null;
		const initialRound =
			Number.isFinite(parsedRound) && (parsedRound ?? 0) > 0 ? parsedRound : null;
		const playerParam = params.get('player') ?? params.get('playerColor');
		const playerValue = playerParam ? playerParam.trim() : '';
		initialSelectedPlayerColor = playerValue ? playerValue : null;

		(async () => {
			await Promise.all([loadGame(data.gameId), loadAssets()]);
			if (initialRound != null) {
				await goToRound(initialRound);
			}
		})();
	});

	onDestroy(() => {
		if (copyReplayTimer) {
			clearTimeout(copyReplayTimer);
			copyReplayTimer = null;
		}
		if (copyShareTimer) {
			clearTimeout(copyShareTimer);
			copyShareTimer = null;
		}
		cleanup();
	});
</script>

<svelte:head>
	<title>Game {data.gameId.slice(0, 8)}... | Arc Spirits Spectate</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-950">
	<!-- Main Content -->
	<main class="flex flex-1 flex-col">
		{#if isLoading && gameState.playerSnapshots.length === 0}
			<!-- Loading State -->
			<div class="flex flex-1 items-center justify-center">
				<div class="loading-container flex flex-col items-center gap-4">
					<div class="relative">
						<div
							class="h-16 w-16 animate-spin rounded-full border-4 border-gray-700 border-t-purple-500"
						></div>
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="h-8 w-8 animate-pulse rounded-full bg-purple-500/20"></div>
						</div>
					</div>
					<div class="text-center">
						<p class="text-lg font-medium text-gray-300">Loading game data...</p>
						<p class="mt-1 text-sm text-gray-500">
							Connecting to {data.gameId.slice(0, 8)}...
						</p>
					</div>
				</div>
			</div>
		{:else if hasAnyError && gameState.playerSnapshots.length === 0}
			<!-- Error State -->
			{@const info = errorInfo()}
			<div class="flex flex-1 items-center justify-center p-8">
				{#if info}
					<ErrorDisplay
						title={info.title}
						message={info.message}
						variant={info.variant}
						onRetry={handleRetry}
					/>
				{/if}
			</div>
		{:else if gameState.playerSnapshots.length === 0}
			<!-- Empty State -->
			<div class="flex flex-1 items-center justify-center p-8">
				<div class="empty-state flex max-w-md flex-col items-center gap-6 text-center">
					<div class="relative">
						<div class="flex h-20 w-20 items-center justify-center rounded-full bg-gray-800">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="h-10 w-10 text-gray-600"
							>
								<path
									fill-rule="evenodd"
									d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z"
									clip-rule="evenodd"
								/>
								<path
									d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z"
								/>
							</svg>
						</div>
						<div
							class="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-700"
						>
							<div class="h-2 w-2 animate-pulse rounded-full bg-yellow-500"></div>
						</div>
					</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-200">Waiting for Players</h2>
						<p class="mt-2 text-gray-400">
							No game data available yet. Players will appear here once they join and sync from
							Tabletop Simulator.
						</p>
					</div>
					{#if gameState.isLive}
						<div
							class="flex items-center gap-2 rounded-lg bg-gray-800/50 px-4 py-2 text-sm text-green-400"
						>
							<span class="relative flex h-2 w-2">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
								></span>
								<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
							</span>
							Listening for updates...
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Game Content -->
			<div class="flex flex-1 flex-col">
				<!-- Asset warning banner (non-blocking) -->
				{#if hasAssetError && !hasGameError}
					<div class="border-b border-yellow-800 bg-yellow-950/50 px-4 py-2">
						<div class="flex items-center justify-center gap-2 text-sm text-yellow-400">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									fill-rule="evenodd"
									d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
									clip-rule="evenodd"
								/>
							</svg>
							<span
								>Some images may not display correctly. Asset loading error: {assetState.error}</span
							>
						</div>
					</div>
				{/if}

				<!-- Round / Summary Bar -->
				<div
					class="sticky top-[var(--app-topbar-height)] z-40 border-b border-gray-800 bg-gray-900/90 px-4 py-2 backdrop-blur-sm lg:px-6"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center gap-2">
							<a
								href="/"
								class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-800 bg-gray-950/60 text-gray-200 transition-colors hover:bg-gray-950/80"
								aria-label="Back to Game Records"
								title="Back to Game Records"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-4 w-4"
									aria-hidden="true"
								>
									<path
										fill-rule="evenodd"
										d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H16a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z"
										clip-rule="evenodd"
									/>
								</svg>
							</a>
							<button
								type="button"
								onclick={() => (activeTab = 'round')}
								class={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
									activeTab === 'round'
										? 'bg-purple-600 text-white'
										: 'bg-gray-800 text-gray-300 hover:bg-gray-700'
								}`}
							>
								Round
							</button>
							<button
								type="button"
								onclick={() => (activeTab = 'summary')}
								class={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
									activeTab === 'summary'
										? 'bg-purple-600 text-white'
										: 'bg-gray-800 text-gray-300 hover:bg-gray-700'
								}`}
							>
								Summary
							</button>
						</div>

						<div class="flex flex-wrap items-center justify-end gap-2">
							<button
								type="button"
								onclick={handleToggleLive}
								class={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
									gameState.isLive
										? 'border-green-800 bg-green-950/70 text-green-200'
										: 'border-gray-800 bg-gray-950/60 text-gray-200 hover:bg-gray-950/80'
								}`}
								aria-pressed={gameState.isLive}
								title={gameState.isLive ? 'Disable live mode' : 'Enable live mode'}
							>
								<span class="relative flex h-2 w-2">
									{#if gameState.isLive}
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
										></span>
										<span class="relative inline-flex h-2 w-2 rounded-full bg-green-400"></span>
									{:else}
										<span class="relative inline-flex h-2 w-2 rounded-full bg-gray-500"></span>
									{/if}
								</span>
								Live
							</button>

							<div
								class="flex items-center gap-2 rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5"
							>
								<span class="font-mono text-[11px] font-semibold text-gray-200 tabular-nums">
									R{gameState.navigationCount}/{gameState.maxNavigation}
								</span>
								{#if gameState.maxNavigation > 1}
									<input
										type="range"
										min="1"
										max={gameState.maxNavigation}
										value={gameState.navigationCount}
										oninput={handleRoundSliderInput}
										class="round-slider w-32 sm:w-44 md:w-56 lg:w-64"
										aria-label="Round slider"
									/>
								{/if}
							</div>

							<a
								href={`/game/${encodeURIComponent(data.gameId)}/export?auto=1`}
								target="_blank"
								rel="noopener noreferrer"
								class="rounded-md border border-purple-800 bg-purple-950/50 px-2.5 py-1.5 text-xs font-semibold text-purple-200 transition-colors hover:bg-purple-950/80"
								title="Export game history as PDF (one page per round)"
							>
								PDF
							</a>

							<button
								type="button"
								onclick={() => copyReplay(currentReplayFull())}
								class="rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-950/80"
								title={`Copy replay code: ${currentReplayFull()}`}
							>
								{#if copiedReplayValue === currentReplayFull()}
									Copied
								{:else}
									Replay {currentReplayShort()}
								{/if}
							</button>

								<button
									type="button"
									onclick={() => copyShareLink(currentShareLink())}
									class="rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-950/80"
									title={`Copy share link: ${currentShareLink()}`}
								>
									{#if copiedShareValue === currentShareLink()}
										Copied
									{:else}
										Share
									{/if}
								</button>

								{#if formatScenarioLabel(gameState.roundScenario)}
									<div
										class="flex items-center gap-1.5 rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5 text-[11px] text-gray-300"
										title="Scenario"
									>
										<span class="text-gray-500">Scenario</span>
										<span class="font-mono text-gray-200">{formatScenarioLabel(gameState.roundScenario)}</span>
									</div>
								{/if}

								<div
									class="flex items-center gap-1.5 rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5 text-[11px] text-gray-300"
								>
									<span class="text-gray-500">Timestamp</span>
								<span class="font-mono text-gray-200">{formatTimestamp(roundTimestamp())}</span>
							</div>

							<div
								class="flex items-center gap-1.5 rounded-md border border-gray-800 bg-gray-950/60 px-2.5 py-1.5 text-[11px] text-gray-300"
							>
								<span class="text-gray-500">Round time</span>
								<span class="font-mono text-gray-200">{formatDuration(roundDeltaMs())}</span>
							</div>
						</div>
					</div>
				</div>

				{#if activeTab === 'round'}
					<div class="flex flex-col xl:flex-row xl:items-start xl:gap-4">
						<div class="min-w-0 flex-1">
							<!-- Game Viewer (Players Grid) -->
							<GameViewer
								playerSnapshots={gameState.playerSnapshots}
								spiritAssets={assetState.spiritAssets}
								runeAssets={assetState.runeAssets}
								statusIcons={assetState.statusIcons}
								guardianAssets={assetState.guardianAssets}
								{initialSelectedPlayerColor}
								onPlayerSelect={(playerColor) => {
									selectedPlayerColorForShare = playerColor;
								}}
							/>

							<RoundBagsPanel
								round={gameState.navigationCount}
								bags={gameState.roundBags}
								monsterImageUrls={monsterImageMap()}
							/>
						</div>

						{#if data.isAdmin}
							<aside class="mt-4 shrink-0 xl:sticky xl:top-20 xl:mt-0 xl:w-80">
								<div class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
									<div class="border-b border-gray-800 px-4 py-3">
										<div class="flex items-center justify-between gap-3">
											<h2 class="text-sm font-semibold text-gray-200">Admin · Tags</h2>
											<a
												href="/stats/tags"
												class="text-xs font-semibold text-purple-300 hover:text-purple-200"
											>
												Tag stats
											</a>
										</div>
										<p class="mt-1 text-xs text-gray-500">
											Tag compositions while viewing boards. Stats count verified games only.
										</p>
									</div>

									<datalist id="composition-tag-options">
										{#each data.tagOptions ?? [] as option (option)}
											<option value={option}></option>
										{/each}
									</datalist>

									{#if data.taggingConfigError}
										<div
											class="border-b border-gray-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-200"
										>
											{data.taggingConfigError}
										</div>
									{/if}

									{#if form?.error}
										<div
											class="border-b border-gray-800 bg-red-900/20 px-4 py-3 text-xs text-red-300"
										>
											{form.error}
										</div>
									{/if}

									<div class="space-y-4 p-4">
										{#if tagPlayers().length === 0}
											<div class="text-sm text-gray-400">Load the game to tag players.</div>
										{:else}
											{#each tagPlayers() as p (p.playerColor)}
												{@const tags = data.compositionTagsByColor?.[p.playerColor] ?? []}
												<div class="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
													<div class="min-w-0">
														<div class="truncate font-semibold text-gray-100">
															{p.username ?? 'Unknown'}
														</div>
														<div class="mt-0.5 text-xs text-gray-500">
															{p.playerColor} • {p.character}
														</div>
													</div>

													<div class="mt-2 flex flex-wrap gap-2">
														{#if tags.length === 0}
															<span class="text-xs text-gray-500">No tags</span>
														{:else}
															{#each tags as tag (tag)}
																<form
																	method="POST"
																	action="?/removeTag"
																	use:enhance
																	class="inline-flex"
																>
																	<input type="hidden" name="playerColor" value={p.playerColor} />
																	<input type="hidden" name="tag" value={tag} />
																	<button
																		type="submit"
																		disabled={Boolean(data.taggingConfigError)}
																		class="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/50 px-2.5 py-1 text-xs font-semibold text-gray-200 hover:border-red-600/60 hover:text-red-200 disabled:opacity-50"
																		title="Remove tag"
																	>
																		<span class="max-w-[160px] truncate">{tag}</span>
																		<span class="text-gray-500">×</span>
																	</button>
																</form>
															{/each}
														{/if}
													</div>

													<form
														method="POST"
														action="?/addTag"
														use:enhance
														class="mt-3 flex items-center gap-2"
													>
														<input type="hidden" name="playerColor" value={p.playerColor} />
														<input
															name="tag"
															list="composition-tag-options"
															placeholder="e.g. astral mages"
															disabled={Boolean(data.taggingConfigError)}
															class="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none disabled:opacity-50"
														/>
														<button
															type="submit"
															disabled={Boolean(data.taggingConfigError)}
															class="rounded-md bg-purple-700 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
														>
															Add
														</button>
													</form>
												</div>
											{/each}
										{/if}
									</div>

									<div class="border-t border-gray-800 px-4 py-3 text-[11px] text-gray-500">
										Tags are stored lowercased and trimmed.
									</div>
								</div>
							</aside>
						{/if}
					</div>
				{:else}
					{@const timing = navigationTiming()}
					{@const navDest = navigationDestinationDistribution()}
					{@const summaryVpPerRound = totalVictoryPointsPerRound()}
					{@const summaryTotalVp = totalVictoryPoints()}
					<!-- Summary Layout: Main + Graphs Sidebar -->
					<div class="flex flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
						<!-- Main Content -->
						<div class="min-w-0 flex-1 space-y-4">
							<!-- Game Summary -->
							<section class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
								<h2 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
									Game Summary
								</h2>
								<div class="grid gap-3 sm:grid-cols-2">
									<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
										<div class="text-xs text-gray-500">Navigations</div>
										<div class="mt-1 text-lg font-semibold text-gray-100 tabular-nums">
											{gameState.maxNavigation}
										</div>
									</div>
									<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
										<div class="text-xs text-gray-500">VP / round</div>
										<div class="mt-1 text-lg font-semibold text-gray-100 tabular-nums">
											{#if summaryVpPerRound != null}
												{summaryVpPerRound.toFixed(2)}
											{:else}
												—
											{/if}
										</div>
										<div class="mt-1 text-xs text-gray-500">
											Total VP <span class="tabular-nums">{summaryTotalVp}</span>
										</div>
									</div>
									<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
										<div class="text-xs text-gray-500">Avg navigation</div>
										<div class="mt-1 text-lg font-semibold text-gray-100 tabular-nums">
											{formatDuration(timing.avgMs)}
										</div>
									</div>
									<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
										<div class="text-xs text-gray-500">Longest navigation</div>
										<div class="mt-1 text-lg font-semibold text-gray-100 tabular-nums">
											{formatDuration(timing.longest?.ms ?? null)}
										</div>
										{#if timing.longest}
											<div class="mt-1 text-xs text-gray-500">
												R{timing.longest.fromRound} → R{timing.longest.toRound}
											</div>
										{/if}
									</div>
									<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
										<div class="text-xs text-gray-500">Total time</div>
										<div class="mt-1 text-lg font-semibold text-gray-100 tabular-nums">
											{formatDuration(timing.totalTimeMs)}
										</div>
										{#if timing.startedAt}
											<div class="mt-1 text-xs text-gray-500">
												{formatTimestamp(timing.startedAt)} → {formatTimestamp(timing.endedAt)}
											</div>
										{/if}
									</div>
								</div>
							</section>

							<!-- Navigation Destinations -->
							<section class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
								<h2 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
									Navigation Destinations
								</h2>
								{#if navDest.total > 0}
									<div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-gray-500">
										<div>
											<span class="font-semibold text-gray-200 tabular-nums">{navDest.total}</span>
											navigations
										</div>
										<div>
											<span class="font-semibold text-gray-200 tabular-nums">{navDest.unique}</span>
											locations
										</div>
									</div>

									<div class="space-y-2">
										{#each navDest.rows as row (row.destination)}
											<div class="flex items-center gap-3">
												<div
													class="w-40 shrink-0 truncate text-xs text-gray-200"
													title={row.destination}
												>
													{row.destination}
												</div>
												<div class="relative h-2 flex-1 rounded-full bg-gray-800">
													<div
														class="h-2 rounded-full bg-purple-600"
														style={`width: ${row.barPercent}%;`}
													></div>
												</div>
												<div class="w-20 shrink-0 text-right text-xs text-gray-400 tabular-nums">
													{row.count} ({row.percent.toFixed(0)}%)
												</div>
											</div>
										{/each}
									</div>
								{:else}
									<div class="text-xs text-gray-500">
										No navigation destination data recorded for this game.
									</div>
								{/if}
							</section>

							<!-- Player Stats -->
							{#if playerStats().length > 0}
								<section class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
									<h2 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
										Player Stats
									</h2>
									<div class="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40">
										<table class="w-full text-left text-sm">
											<thead
												class="border-b border-gray-800 text-xs tracking-wide text-gray-500 uppercase"
											>
												<tr>
													<th class="px-3 py-2">Player</th>
													<th class="px-3 py-2 text-right">VP</th>
													<th class="px-3 py-2 text-right">VP/Round</th>
													<th class="px-3 py-2 text-right">Total Barriers</th>
													<th class="px-3 py-2 text-right">VP/Barrier</th>
													<th class="px-3 py-2 text-right">Rune Inv.</th>
													<th class="px-3 py-2 text-right">Augments Drawn</th>
													<th class="px-3 py-2 text-right">Augments On Spirits</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-gray-800">
												{#each playerStats() as row, i (row.playerColor)}
													<tr class="hover:bg-gray-900/60">
														<td class="px-3 py-2">
															<div class="flex items-center gap-2">
																{#if i === 0}
																	<span class="text-yellow-400">👑</span>
																{/if}
																<div>
																	<div class="font-semibold text-gray-100">
																		{row.username ?? 'Unknown'}
																	</div>
																	<div class="mt-0.5 text-xs text-gray-500">{row.playerColor}</div>
																</div>
															</div>
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															<span class="font-semibold text-yellow-300">{row.vp}</span>
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															{#if row.vpPerRound != null}
																{row.vpPerRound.toFixed(2)}
															{:else}
																—
															{/if}
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															{row.barrierGained}
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															{#if row.vpPerBarrier != null}
																{row.vpPerBarrier.toFixed(2)}
															{:else}
																—
															{/if}
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															{row.runeInventory}
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															{row.spiritAugmentsDrawn}
														</td>
														<td class="px-3 py-2 text-right text-gray-200 tabular-nums">
															{row.spiritAugmentsOnSpirits}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								</section>
							{/if}

							<!-- Replay Codes -->
							{#if gameState.maxNavigation > 0}
								<section class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
									<details class="group">
										<summary
											class="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 hover:bg-gray-900/60"
										>
											<div>
												<h2 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
													Replay Codes
												</h2>
												<p class="mt-0.5 text-xs text-gray-500">
													Use in TTS <span class="font-semibold text-gray-300">Replay Load</span> to restore
													a navigation snapshot.
												</p>
											</div>

											<div class="flex items-center gap-3 text-xs text-gray-400">
												<span class="whitespace-nowrap">
													<span class="text-gray-500">Latest</span>
													<span class="ml-1 font-mono font-semibold text-gray-200"
														>{toShortReplayCode(gameState.maxNavigation)}</span
													>
												</span>
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

										<div class="mt-3 grid gap-3 sm:grid-cols-2">
											{#each replayRounds() as entry (entry.round)}
												<div class="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
													<div class="flex items-start justify-between gap-3">
														<div class="min-w-0">
															<div class="text-xs text-gray-500">Round {entry.round}</div>
															<button
																type="button"
																onclick={() => copyReplay(entry.shortCode)}
																class="mt-1 font-mono text-lg font-semibold text-gray-100 transition-colors hover:text-purple-300"
																title="Copy 4-digit code"
															>
																{entry.shortCode}
															</button>
															<div class="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
																<span class="truncate font-mono" title={entry.fullCode}
																	>{entry.fullCode}</span
																>
															</div>
															{#if entry.timestamp}
																<div class="mt-1 text-[11px] text-gray-500">
																	{formatTimestamp(entry.timestamp)}
																</div>
															{/if}
														</div>

														<button
															type="button"
															onclick={() => copyReplay(entry.fullCode)}
															class="shrink-0 rounded-md bg-gray-900/70 px-2 py-1 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-900"
															title="Copy full replay code"
														>
															{#if copiedReplayValue === entry.fullCode}
																Copied
															{:else}
																Copy
															{/if}
														</button>
													</div>
												</div>
											{/each}
										</div>
									</details>
								</section>
							{/if}
						</div>

						<!-- Graphs Sidebar -->
						{#if showGraphs}
							<aside class="w-full space-y-4 lg:w-[420px] lg:shrink-0">
								<div class="rounded-xl border border-gray-800 bg-gray-950/30 p-4">
									<h2 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
										Game Progress
									</h2>
									<div class="space-y-4">
										<ResourceGraph
											type="blood"
											data={graphData}
											currentRound={gameState.navigationCount}
											onRoundClick={handleRoundChange}
										/>
										<ResourceGraph
											type="barrierGained"
											data={graphData}
											currentRound={gameState.navigationCount}
											onRoundClick={handleRoundChange}
										/>
										<ResourceGraph
											type="victoryPoints"
											data={graphData}
											currentRound={gameState.navigationCount}
											onRoundClick={handleRoundChange}
										/>
									</div>
								</div>
							</aside>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</main>

	<!-- Toast notification for new data when not in live mode -->
	<Toast
		show={gameState.hasNewData && !gameState.isLive}
		message="New game data available"
		type="info"
		onDismiss={handleToastDismiss}
		onAction={handleGoToLatest}
		actionLabel="Go Live"
		autoDismiss={true}
		dismissAfter={8000}
	/>

	<!-- Host Notes Editor Modal -->
	{#if showHostNotesEditor}
		<HostNotesEditor
			gameId={data.gameId}
			existingNotes={gameState.gameNotes}
			onClose={() => (showHostNotesEditor = false)}
			onSave={handleNotesSaved}
		/>
	{/if}

	<!-- Player Feedback Form Modal -->
	{#if showPlayerFeedbackForm}
		<PlayerFeedbackForm
			gameId={data.gameId}
			onClose={() => (showPlayerFeedbackForm = false)}
			onSubmit={handleFeedbackSubmitted}
		/>
	{/if}
</div>

<style>
	.loading-container {
		animation: fade-in 0.3s ease-out;
	}

	.empty-state {
		animation: fade-in 0.4s ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

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

	.round-slider {
		height: 0.25rem;
		border-radius: 9999px;
		background-color: rgb(55 65 81); /* gray-700 */
		appearance: none;
		cursor: pointer;
		accent-color: rgb(168 85 247); /* purple-500 */
	}

	.round-slider::-webkit-slider-thumb {
		appearance: none;
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 9999px;
		background-color: rgb(168 85 247); /* purple-500 */
		border: 2px solid rgb(17 24 39); /* gray-900 */
	}

	.round-slider::-moz-range-thumb {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 9999px;
		background-color: rgb(168 85 247); /* purple-500 */
		border: 2px solid rgb(17 24 39); /* gray-900 */
	}
</style>
