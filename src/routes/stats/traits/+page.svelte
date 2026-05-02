<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fetchTraitOccurrencesVerified, fetchTraitStatsVerified } from '$lib/supabase';
	import type { TraitOccurrenceRow, TraitStatsRow } from '$lib/types';

	type TraitType = 'class' | 'origin';
	type SortMode =
		| 'avg_victory_points'
		| 'avg_placement'
		| 'players'
		| 'games'
		| 'win_rate'
		| 'trait_count';

	type TraitGameEntry = {
		gameId: string;
		endedAt: string | null;
		navigationCount: number;
		playersWithTrait: number;
		bestPlacement: number | null;
		bestVictoryPoints: number | null;
		examplePlayerColor: string | null;
		examplePlayer: string | null;
		exampleCharacter: string | null;
	};

	let rows = $state<TraitStatsRow[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let traitType = $state<TraitType>('class');
	let minCount = $state(4);
	let sortMode = $state<SortMode>('avg_victory_points');
	let search = $state('');

	let traitGamesByKey = $state<Record<string, TraitGameEntry[]>>({});
	let traitGamesLoading = $state<Record<string, boolean>>({});
	let traitGamesErrors = $state<Record<string, string>>({});

	function getRowKey(row: Pick<TraitStatsRow, 'trait_type' | 'trait_key' | 'trait_count'>): string {
		return `${row.trait_type}:${row.trait_key}:${row.trait_count}`;
	}

	function pluralizeWord(word: string): string {
		const lower = word.toLowerCase();

		if (lower.endsWith('y') && word.length >= 2) {
			const before = lower[lower.length - 2];
			if (!'aeiou'.includes(before)) return `${word.slice(0, -1)}ies`;
		}

		if (
			lower.endsWith('s') ||
			lower.endsWith('x') ||
			lower.endsWith('z') ||
			lower.endsWith('ch') ||
			lower.endsWith('sh')
		) {
			return `${word}es`;
		}

		return `${word}s`;
	}

	function withCountLabel(traitName: string, count: number): string {
		if (!traitName) return String(count);
		if (count === 1) return `1 ${traitName}`;

		const parts = traitName.split(' ').filter(Boolean);
		if (parts.length === 0) return String(count);

		const last = parts[parts.length - 1];
		parts[parts.length - 1] = pluralizeWord(last);
		return `${count} ${parts.join(' ')}`;
	}

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

	function shortenGameId(gameId: string): string {
		if (gameId.length <= 28) return gameId;
		return `${gameId.slice(0, 12)}…${gameId.slice(-10)}`;
	}

	function openExampleGame(row: TraitStatsRow) {
		const gameId = row.example_game_id;
		if (!gameId) return;
		const round = row.example_round;
		const searchParams = new URLSearchParams();
		if (round != null && Number.isFinite(round) && round > 0)
			searchParams.set('round', String(round));
		if (row.example_player_color) searchParams.set('player', row.example_player_color);
		const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
		goto(`/game/${encodeURIComponent(gameId)}${query}`);
	}

	function handleRowClick(event: MouseEvent, row: TraitStatsRow) {
		const target = event.target as HTMLElement | null;
		if (!target) return;
		if (target.closest('a, button, details, summary, select, input')) return;
		openExampleGame(row);
	}

	function handleRowKeydown(event: KeyboardEvent, row: TraitStatsRow) {
		const target = event.target as HTMLElement | null;
		if (target && target.closest('a, button, details, summary, select, input')) return;

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openExampleGame(row);
		}
	}

	function aggregateTraitGames(rows: TraitOccurrenceRow[]): TraitGameEntry[] {
		const byGame = new Map<string, TraitGameEntry>();

		for (const r of rows) {
			const gameId = r.game_id;
			const endedAt = r.ended_at ?? null;
			const navigationCount = Number(r.navigation_count ?? 0) || 0;
			const placement = Number.isFinite(r.placement) ? Number(r.placement) : null;
			const victoryPoints = Number.isFinite(r.victory_points) ? Number(r.victory_points) : null;
			const player = r.username ?? r.raw_username ?? null;
			const character = r.selected_character ?? null;
			const playerColor = r.player_color;

			const existing = byGame.get(gameId);
			if (!existing) {
				byGame.set(gameId, {
					gameId,
					endedAt,
					navigationCount,
					playersWithTrait: 1,
					bestPlacement: placement,
					bestVictoryPoints: victoryPoints,
					examplePlayerColor: playerColor,
					examplePlayer: player,
					exampleCharacter: character
				});
				continue;
			}

			existing.playersWithTrait += 1;
			if (existing.endedAt == null && endedAt != null) existing.endedAt = endedAt;
			existing.navigationCount = Math.max(existing.navigationCount, navigationCount);

			const isBetterPlacement =
				placement != null && (existing.bestPlacement == null || placement < existing.bestPlacement);
			const isBetterVp =
				victoryPoints != null &&
				(existing.bestVictoryPoints == null || victoryPoints > existing.bestVictoryPoints);

			if (isBetterPlacement || (existing.bestPlacement == null && isBetterVp)) {
				existing.bestPlacement = placement;
				existing.bestVictoryPoints = victoryPoints;
				existing.examplePlayerColor = playerColor;
				existing.examplePlayer = player;
				existing.exampleCharacter = character;
			} else if (isBetterVp && existing.bestPlacement == null) {
				existing.bestVictoryPoints = victoryPoints;
				existing.examplePlayerColor = playerColor;
				existing.examplePlayer = player;
				existing.exampleCharacter = character;
			}
		}

		return Array.from(byGame.values()).sort((a, b) => {
			const aMs = a.endedAt ? Date.parse(a.endedAt) : Number.NEGATIVE_INFINITY;
			const bMs = b.endedAt ? Date.parse(b.endedAt) : Number.NEGATIVE_INFINITY;
			if (!Number.isNaN(aMs) && !Number.isNaN(bMs) && aMs !== bMs) return bMs - aMs;
			if (a.navigationCount !== b.navigationCount) return b.navigationCount - a.navigationCount;
			return b.gameId.localeCompare(a.gameId);
		});
	}

	async function ensureTraitGamesLoaded(row: TraitStatsRow) {
		const key = getRowKey(row);
		if (traitGamesByKey[key]) return;
		if (traitGamesLoading[key]) return;

		traitGamesLoading = { ...traitGamesLoading, [key]: true };
		traitGamesErrors = { ...traitGamesErrors, [key]: '' };

		try {
			const occurrences = await fetchTraitOccurrencesVerified({
				traitType: row.trait_type,
				traitKey: row.trait_key,
				traitCount: row.trait_count,
				limit: 75
			});

			traitGamesByKey = { ...traitGamesByKey, [key]: aggregateTraitGames(occurrences) };
		} catch (e) {
			console.error('Failed to load trait games:', e);
			traitGamesErrors = {
				...traitGamesErrors,
				[key]: e instanceof Error ? e.message : 'Failed to load games'
			};
		} finally {
			traitGamesLoading = { ...traitGamesLoading, [key]: false };
		}
	}

	const filteredSorted = $derived(() => {
		const query = search.trim().toLowerCase();

		const filtered = rows.filter((r) => {
			if (r.trait_type !== traitType) return false;
			if (r.trait_count < minCount) return false;
			if (!query) return true;
			return r.trait_name.toLowerCase().includes(query);
		});

		return filtered.sort((a, b) => {
			if (sortMode === 'avg_placement') {
				const byPlace = a.avg_placement - b.avg_placement;
				if (byPlace !== 0) return byPlace;
				const byPoints = b.avg_victory_points - a.avg_victory_points;
				if (byPoints !== 0) return byPoints;
				return b.players - a.players;
			}

			if (sortMode === 'players') {
				const byPlayers = b.players - a.players;
				if (byPlayers !== 0) return byPlayers;
				const byPoints = b.avg_victory_points - a.avg_victory_points;
				if (byPoints !== 0) return byPoints;
				return a.avg_placement - b.avg_placement;
			}

			if (sortMode === 'games') {
				const byGames = b.games - a.games;
				if (byGames !== 0) return byGames;
				const byPoints = b.avg_victory_points - a.avg_victory_points;
				if (byPoints !== 0) return byPoints;
				return a.avg_placement - b.avg_placement;
			}

			if (sortMode === 'win_rate') {
				const aRate = a.players > 0 ? a.wins / a.players : 0;
				const bRate = b.players > 0 ? b.wins / b.players : 0;
				const byRate = bRate - aRate;
				if (byRate !== 0) return byRate;
				const byPlayers = b.players - a.players;
				if (byPlayers !== 0) return byPlayers;
				return b.avg_victory_points - a.avg_victory_points;
			}

			if (sortMode === 'trait_count') {
				const byCount = a.trait_count - b.trait_count;
				if (byCount !== 0) return byCount;
				const byPlayers = b.players - a.players;
				if (byPlayers !== 0) return byPlayers;
				return b.avg_victory_points - a.avg_victory_points;
			}

			const byPoints = b.avg_victory_points - a.avg_victory_points;
			if (byPoints !== 0) return byPoints;
			const byPlace = a.avg_placement - b.avg_placement;
			if (byPlace !== 0) return byPlace;
			return b.players - a.players;
		});
	});

	async function load() {
		loading = true;
		error = null;
		try {
			rows = await fetchTraitStatsVerified();
		} catch (e) {
			console.error('Failed to load trait stats:', e);
			error = e instanceof Error ? e.message : 'Failed to load trait stats';
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>Trait Stats | Arc Spirits Spectate</title>
</svelte:head>

<div class="stats-page">
	<main class="stats-main">
		<a href="/stats" class="back-link">← Stats Index</a>
		<div class="section-marker">
			<div class="sm-num">11</div>
			<div class="sm-label">Trait Convergence</div>
		</div>
		<h1 class="page-title">Trait Stats</h1>
		<p class="subhead-meta">Verified games only (over 10 turns; players with a TTS username and ≥10 VP). Each row represents an exact final board count (e.g. 4 Fighters, 5 Fighters).</p>

		<div class="toolbar">
			<div class="toolbar-controls">
				<div class="ctrl-group">
					<label for="trait-type" class="ctrl-label">Trait Type</label>
					<select id="trait-type" bind:value={traitType} class="ctrl-select">
						<option value="class">Class</option>
						<option value="origin">Origin</option>
					</select>
				</div>
				<div class="ctrl-group">
					<label for="min-count" class="ctrl-label">Minimum Count</label>
					<select id="min-count" bind:value={minCount} class="ctrl-select">
						{#each Array.from({ length: 20 }, (_, i) => i + 1) as n (n)}
							<option value={n}>{n}+</option>
						{/each}
					</select>
				</div>
				<div class="ctrl-group">
					<label for="sort-mode" class="ctrl-label">Sort</label>
					<select id="sort-mode" bind:value={sortMode} class="ctrl-select">
						<option value="avg_victory_points">Avg VP (desc)</option>
						<option value="avg_placement">Avg Placement (asc)</option>
						<option value="win_rate">Win rate (desc)</option>
						<option value="players">Players (desc)</option>
						<option value="games">Games (desc)</option>
						<option value="trait_count">Count (asc)</option>
					</select>
				</div>
				<div class="ctrl-group">
					<label for="trait-search" class="ctrl-label">Search</label>
					<input
						id="trait-search"
						bind:value={search}
						placeholder="Filter traits…"
						class="ctrl-input"
					/>
				</div>
			</div>
			<button onclick={load} disabled={loading} class="btn-ghost" type="button">
				<svg class={loading ? 'spin' : ''} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
				Refresh
			</button>
		</div>

		{#if loading && rows.length === 0}
			<div class="state-msg">
				<div class="spin-ring"></div>
				<p>Loading trait stats…</p>
			</div>
		{:else if error}
			<div class="state-error"><p>{error}</p></div>
		{:else if filteredSorted().length === 0}
			<div class="state-msg">
				{#if rows.length === 0 && search.trim() === ''}
					<p class="state-title">No trait stats yet.</p>
					<p>Verify some games over 10 turns (players need a TTS username and ≥10 VP) to populate this page.</p>
				{:else}
					<p>No traits match this filter.</p>
				{/if}
			</div>
		{:else}
			<div class="table-wrap">
				<div class="table-scroll">
					<table class="data-table">
						<thead>
							<tr class="thead-row">
								<th class="th">Trait</th>
								<th class="th num">Players</th>
								<th class="th num">Games</th>
								<th class="th num">Wins</th>
								<th class="th num">Win Rate</th>
								<th class="th num">Avg VP</th>
								<th class="th num">Avg Place</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredSorted() as r, i (`${r.trait_type}:${r.trait_key}:${r.trait_count}`)}
								{@const key = getRowKey(r)}
								<tr
									role="link"
									tabindex="0"
									onclick={(event) => handleRowClick(event, r)}
									onkeydown={(event) => handleRowKeydown(event, r)}
									class="td-row"
									class:alt={i % 2 === 1}
									title="Open a recent game that played this trait"
								>
									<td class="td">
										<div class="trait-name">{withCountLabel(r.trait_name, r.trait_count)}</div>
										<div class="trait-type-label">{r.trait_type}</div>
									</td>
									<td class="td big-num">{r.players}</td>
									<td class="td">
										<details class="game-details">
											<summary
												onclick={() => void ensureTraitGamesLoaded(r)}
												class="games-summary"
											>
												<span class="big-num">{r.games}</span>
												<span class="games-label">games</span>
											</summary>
											<div class="games-panel">
												{#if traitGamesLoading[key]}
													<div class="panel-msg">Loading games…</div>
												{:else if traitGamesErrors[key]}
													<div class="panel-err">{traitGamesErrors[key]}</div>
												{:else}
													{@const games = traitGamesByKey[key] ?? []}
													{#if games.length === 0}
														<div class="panel-msg">No games found.</div>
													{:else}
														<div class="game-list">
															{#each games as g (g.gameId)}
																<a
																	href={`/game/${encodeURIComponent(g.gameId)}?round=${g.navigationCount}${g.examplePlayerColor ? `&player=${encodeURIComponent(g.examplePlayerColor)}` : ''}`}
																	class="game-link"
																	title="Open game at final round"
																>
																	<div class="game-link-inner">
																		<div>
																			<div class="game-id">{shortenGameId(g.gameId)}</div>
																			<div class="game-meta">Ended {formatTimestamp(g.endedAt)} · {g.navigationCount} rounds</div>
																			{#if g.examplePlayer || g.exampleCharacter}
																				<div class="game-meta">
																					{g.examplePlayer ?? 'Unknown'} · {g.exampleCharacter ?? 'Unknown'}
																					{#if g.bestPlacement != null} · Place {g.bestPlacement}{/if}
																					{#if g.bestVictoryPoints != null} · {g.bestVictoryPoints} VP{/if}
																					{#if g.playersWithTrait > 1} · {g.playersWithTrait} players{/if}
																				</div>
																			{/if}
																		</div>
																		<span class="game-open">Open</span>
																	</div>
																</a>
															{/each}
														</div>
													{/if}
												{/if}
											</div>
										</details>
									</td>
									<td class="td big-num">{r.wins}</td>
									<td class="td big-num">
										{(r.players > 0 ? (r.wins / r.players) * 100 : 0).toFixed(0)}%
									</td>
									<td class="td big-num accent">{r.avg_victory_points.toFixed(1)}</td>
									<td class="td big-num">{r.avg_placement.toFixed(2)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.stats-page { min-height: 100vh; position: relative; z-index: 1; }
	.stats-main { max-width: 1280px; margin: 0 auto; padding: 56px 32px 80px; }

	.back-link {
		display: inline-flex; align-items: center; gap: 6px;
		font-family: var(--font-display); font-size: 0.66rem; font-weight: 700;
		letter-spacing: 0.18em; text-transform: uppercase;
		color: var(--brand-magenta-soft); text-decoration: none; margin-bottom: 24px;
	}
	.back-link:hover { color: var(--brand-magenta); }

	.page-title {
		font-family: var(--font-display);
		font-size: clamp(3rem, 6vw, 5rem);
		font-weight: 400;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 0.95;
		color: var(--color-bone);
		margin: 16px 0 12px;
	}

	.toolbar {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin: 24px 0 20px;
		padding: 16px 20px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
	}
	.toolbar-controls { display: flex; gap: 16px; flex-wrap: wrap; flex: 1; }
	.ctrl-group { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
	.ctrl-label {
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.ctrl-select, .ctrl-input {
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 0.88rem;
		padding: 8px 12px;
		border-radius: 0;
		width: 100%;
		transition: border-color 160ms ease;
	}
	.ctrl-select:focus, .ctrl-input:focus { outline: none; border-color: var(--brand-magenta); }
	.ctrl-input::placeholder { color: var(--color-whisper); }

	.table-wrap { border: 1px solid var(--color-mist); overflow: hidden; }
	.table-scroll { overflow-x: auto; }
	.data-table { width: 100%; min-width: 700px; border-collapse: collapse; }

	.thead-row { background: var(--brand-magenta); }
	.th {
		padding: 14px 16px;
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #fff;
		font-weight: 400;
		text-align: left;
		white-space: nowrap;
	}
	.th.num { text-align: right; }

	.td-row {
		background: var(--color-tomb);
		border-bottom: 1px solid var(--color-mist);
		cursor: pointer;
		transition: background 140ms ease;
	}
	.td-row.alt { background: rgba(34, 20, 64, 0.5); }
	.td-row:hover, .td-row:focus { background: rgba(255, 43, 199, 0.07); outline: none; }

	.td { padding: 12px 16px; color: var(--color-parchment); font-size: 0.9rem; vertical-align: middle; }

	.trait-name { font-weight: 600; color: var(--color-bone); font-size: 0.95rem; }
	.trait-type-label { margin-top: 2px; font-size: 0.72rem; color: var(--color-fog); text-transform: uppercase; letter-spacing: 0.1em; }

	.big-num {
		font-family: var(--font-display);
		font-size: 1.5rem;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.big-num.accent { color: var(--brand-magenta); }

	.game-details { display: inline; }
	.games-summary {
		display: inline-flex; align-items: center; gap: 6px;
		cursor: pointer; list-style: none; color: var(--brand-magenta-soft);
	}
	.games-summary::-webkit-details-marker { display: none; }
	.games-label { font-size: 0.75rem; color: var(--color-fog); }

	.games-panel {
		margin-top: 10px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		padding: 10px;
	}
	.panel-msg { font-size: 0.82rem; color: var(--color-fog); }
	.panel-err { font-size: 0.82rem; color: var(--color-blood); }

	.game-list { display: flex; flex-direction: column; gap: 6px; }
	.game-link {
		display: block;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 8px 10px;
		text-decoration: none;
		color: var(--color-parchment);
		transition: background 140ms ease, border-color 140ms ease;
		font-size: 0.78rem;
	}
	.game-link:hover { background: rgba(255, 43, 199, 0.07); border-color: var(--brand-magenta); }
	.game-link-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
	.game-id { font-weight: 600; color: var(--color-bone); font-size: 0.8rem; }
	.game-meta { margin-top: 2px; font-size: 0.72rem; color: var(--color-fog); }
	.game-open { flex: none; color: var(--brand-magenta-soft); font-size: 0.72rem; }

	.state-msg {
		padding: 60px 24px; text-align: center; color: var(--color-fog);
		display: flex; flex-direction: column; align-items: center; gap: 8px;
	}
	.state-title { font-family: var(--font-display); font-size: 1.4rem; color: var(--color-bone); }
	.state-error {
		border: 1px solid var(--color-blood);
		background: rgba(255, 77, 109, 0.08);
		padding: 16px 20px;
		color: var(--color-blood);
		font-size: 0.88rem;
	}
	.spin-ring {
		width: 36px; height: 36px;
		border: 2px solid var(--color-mist);
		border-top-color: var(--brand-magenta);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	.spin { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 640px) {
		.stats-main { padding: 36px 20px 60px; }
		.toolbar { flex-direction: column; align-items: stretch; }
	}
</style>
