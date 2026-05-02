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
					(snapshot.spirit_rune_attachments as PlayerSnapshot['spiritRuneAttachments']) ?? [],
				dice: (snapshot.dice as PlayerSnapshot['dice']) ?? []
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
		padding: 20px;
		max-width: 1240px;
		margin: 0 auto;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px;
		border: 1px solid rgba(123, 29, 255, 0.3);
		border-radius: 16px;
		background: linear-gradient(180deg, rgba(34, 20, 64, 0.85), rgba(17, 9, 31, 0.75));
		backdrop-filter: blur(14px);
		position: sticky;
		top: 12px;
		z-index: 50;
		box-shadow: 0 12px 40px -16px rgba(255, 43, 199, 0.3);
	}

	.toolbar::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 16px;
		background: linear-gradient(90deg, rgba(255, 43, 199, 0.05), transparent 50%, rgba(36, 212, 255, 0.05));
		pointer-events: none;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: 'Unbounded', system-ui, sans-serif;
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #f5f0ff;
		text-decoration: none;
		padding: 8px 14px;
		border-radius: 999px;
		background: rgba(5, 3, 16, 0.6);
		border: 1px solid rgba(123, 29, 255, 0.3);
		transition: all 180ms ease;
		position: relative;
	}

	.back:hover {
		border-color: #ff2bc7;
		color: #ff5dd1;
		background: rgba(255, 43, 199, 0.08);
	}

	.spacer { flex: 1; }

	.meta {
		display: flex;
		gap: 12px;
		align-items: center;
		color: #d8cfee;
		position: relative;
	}

	.mono {
		font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		letter-spacing: 0.04em;
		color: #f5f0ff;
	}

	.pill {
		font-family: 'Unbounded', system-ui, sans-serif;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		padding: 5px 12px;
		border-radius: 999px;
		background: rgba(36, 212, 255, 0.12);
		border: 1px solid rgba(36, 212, 255, 0.4);
		color: #24d4ff;
	}

	.print {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: linear-gradient(135deg, #ff2bc7 0%, #7b1dff 50%, #5a2bff 100%);
		color: white;
		font-family: 'Unbounded', system-ui, sans-serif;
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		border: none;
		border-radius: 999px;
		padding: 10px 18px;
		cursor: pointer;
		box-shadow: 0 8px 24px -8px rgba(255, 43, 199, 0.55);
		transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
		position: relative;
	}

	.print:hover {
		transform: translateY(-1px);
		box-shadow: 0 12px 32px -8px rgba(255, 43, 199, 0.7);
		filter: brightness(1.08);
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
