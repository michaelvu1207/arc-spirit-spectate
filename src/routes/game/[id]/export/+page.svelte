<script lang="ts">
	import { onMount, tick } from 'svelte';
	import PrintRoundPage from '$lib/components/PrintRoundPage.svelte';
	import { fetchAllGameSnapshots } from '$lib/supabase';
	import type { BagsData, PlayerSnapshot } from '$lib/types';

	interface Props {
		data: {
			gameId: string;
		};
	}

	type RoundPage = {
		round: number;
		timestamp: string | null;
		players: PlayerSnapshot[];
		bags: BagsData | null;
	};

	let { data }: Props = $props();

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let pages = $state<RoundPage[]>([]);
	let shouldAutoPrint = $state(false);
	let hasTriggeredPrint = $state(false);

	async function loadExportPages(gameId: string) {
		const snapshots = await fetchAllGameSnapshots(gameId);

		const byRound = new Map<number, RoundPage>();

		for (const snapshot of snapshots) {
			const round = snapshot.navigation_count;

			if (!byRound.has(round)) {
				byRound.set(round, {
					round,
					timestamp: snapshot.game_timestamp ?? snapshot.created_at ?? null,
					players: [],
					bags: snapshot.bags ?? null
				});
			}

			const page = byRound.get(round)!;

			page.players.push({
				playerColor: snapshot.player_color,
				ttsUsername: snapshot.tts_username ?? null,
				selectedCharacter: snapshot.selected_character,
				navigationDestination: snapshot.navigation_destination ?? null,
				blood: snapshot.blood,
				victoryPoints: snapshot.victory_points,
				barrier: snapshot.barrier ?? 0,
				statusLevel: snapshot.status_level ?? 1,
				statusToken: snapshot.status_token ?? null,
				spirits: (snapshot.spirits as PlayerSnapshot['spirits']) ?? [],
				runes: (snapshot.runes as PlayerSnapshot['runes']) ?? [],
				handDraws: (snapshot.hand_draws as PlayerSnapshot['handDraws']) ?? [],
				spiritRuneAttachments:
					(snapshot.spirit_rune_attachments as PlayerSnapshot['spiritRuneAttachments']) ?? []
			});

			if (!page.bags && snapshot.bags) {
				page.bags = snapshot.bags;
			}
			if (!page.timestamp && (snapshot.game_timestamp || snapshot.created_at)) {
				page.timestamp = snapshot.game_timestamp ?? snapshot.created_at;
			}
		}

		return Array.from(byRound.values()).sort((a, b) => a.round - b.round);
	}

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const auto = params.get('auto');
		shouldAutoPrint = auto === '1' || auto === 'true';

		isLoading = true;
		error = null;

		try {
			pages = await loadExportPages(data.gameId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load export pages';
		} finally {
			isLoading = false;
		}
	});

	$effect(() => {
		if (shouldAutoPrint && !hasTriggeredPrint && !isLoading && pages.length > 0) {
			hasTriggeredPrint = true;
			tick().then(() => {
				window.print();
			});
		}
	});

	function printNow() {
		window.print();
	}
</script>

<svelte:head>
	<title>Export {data.gameId.slice(0, 8)}… | Arc Spirits</title>
</svelte:head>

<div class="export-root">
	<div class="toolbar screen-only">
		<a class="back" href={`/game/${encodeURIComponent(data.gameId)}`}>← Back</a>
		<div class="spacer"></div>
		<div class="meta">
			<span class="mono">{data.gameId}</span>
			<span class="pill">{pages.length} pages</span>
		</div>
		<button class="print" type="button" onclick={printNow}>Print / Save PDF</button>
	</div>

	{#if isLoading}
		<div class="screen-only loading">Loading export…</div>
	{:else if error}
		<div class="screen-only error">Failed to load export: {error}</div>
	{:else if pages.length === 0}
		<div class="screen-only empty">No snapshots found for this game.</div>
	{:else}
		<div class="pages">
			{#each pages as page, idx (page.round)}
				<div class="page-wrap" class:last={idx === pages.length - 1}>
					<PrintRoundPage
						gameId={data.gameId}
						round={page.round}
						timestamp={page.timestamp}
						players={page.players}
						bags={page.bags}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.export-root {
		padding: 16px;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		background: rgba(17, 24, 39, 0.75);
		backdrop-filter: blur(8px);
		position: sticky;
		top: 12px;
		z-index: 50;
	}

	.back {
		color: #e5e7eb;
		font-weight: 700;
		text-decoration: none;
		padding: 6px 10px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.06);
	}

	.back:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.spacer {
		flex: 1;
	}

	.meta {
		display: flex;
		gap: 10px;
		align-items: center;
		color: #d1d5db;
	}

	.mono {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 12px;
		opacity: 0.9;
	}

	.pill {
		font-size: 12px;
		font-weight: 800;
		padding: 4px 8px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
	}

	.print {
		background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
		color: white;
		font-weight: 800;
		border: none;
		border-radius: 10px;
		padding: 8px 12px;
		cursor: pointer;
	}

	.print:hover {
		filter: brightness(1.06);
	}

	.loading,
	.error,
	.empty {
		margin-top: 14px;
		color: #e5e7eb;
	}

	.pages {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	@page {
		size: 11in 8.5in;
		margin: 0.5in;
	}

	@media print {
		:global(html),
		:global(body) {
			background: white !important;
		}

		:global(.haunted-bg::before) {
			display: none !important;
		}

		.export-root {
			padding: 0;
		}

		.screen-only {
			display: none !important;
		}

		.page-wrap {
			break-after: page;
			page-break-after: always;
		}

		.page-wrap.last {
			break-after: auto;
			page-break-after: auto;
		}
	}
</style>
