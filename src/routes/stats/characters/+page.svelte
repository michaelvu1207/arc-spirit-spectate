<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchCharacterOccurrencesVerified, fetchCharacterStatsVerified } from '$lib/supabase';
	import { loadAssets, getGuardianAsset } from '$lib/stores/assetStore.svelte';
	import type { CharacterOccurrenceRow, CharacterStatsRow } from '$lib/types';

	type SortMode = 'avg_victory_points' | 'avg_placement' | 'games_played';

	type CharacterGameEntry = {
		gameId: string;
		endedAt: string | null;
		navigationCount: number;
		playersOnCharacter: number;
		bestPlacement: number | null;
		bestVictoryPoints: number | null;
		examplePlayerColor: string | null;
		examplePlayer: string | null;
	};

	let rows = $state<CharacterStatsRow[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let sortMode = $state<SortMode>('avg_victory_points');
	let search = $state('');

	let characterGamesByName = $state<Record<string, CharacterGameEntry[]>>({});
	let characterGamesLoading = $state<Record<string, boolean>>({});
	let characterGamesErrors = $state<Record<string, string>>({});

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

	function aggregateCharacterGames(rows: CharacterOccurrenceRow[]): CharacterGameEntry[] {
		const byGame = new Map<string, CharacterGameEntry>();

		for (const r of rows) {
			const gameId = r.game_id;
			const endedAt = r.ended_at ?? null;
			const navigationCount = Number(r.navigation_count ?? 0) || 0;
			const placement = Number.isFinite(r.placement) ? Number(r.placement) : null;
			const victoryPoints = Number.isFinite(r.victory_points) ? Number(r.victory_points) : null;
			const player = r.username ?? r.raw_username ?? null;
			const playerColor = r.player_color;

			const existing = byGame.get(gameId);
			if (!existing) {
				byGame.set(gameId, {
					gameId,
					endedAt,
					navigationCount,
					playersOnCharacter: 1,
					bestPlacement: placement,
					bestVictoryPoints: victoryPoints,
					examplePlayerColor: playerColor,
					examplePlayer: player
				});
				continue;
			}

			existing.playersOnCharacter += 1;
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
			} else if (isBetterVp && existing.bestPlacement == null) {
				existing.bestVictoryPoints = victoryPoints;
				existing.examplePlayerColor = playerColor;
				existing.examplePlayer = player;
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

	async function ensureCharacterGamesLoaded(row: CharacterStatsRow) {
		const key = row.character;
		if (characterGamesByName[key]) return;
		if (characterGamesLoading[key]) return;

		characterGamesLoading = { ...characterGamesLoading, [key]: true };
		characterGamesErrors = { ...characterGamesErrors, [key]: '' };

		try {
			const occurrences = await fetchCharacterOccurrencesVerified({
				character: row.character,
				limit: 75
			});
			characterGamesByName = {
				...characterGamesByName,
				[key]: aggregateCharacterGames(occurrences)
			};
		} catch (e) {
			console.error('Failed to load character games:', e);
			characterGamesErrors = {
				...characterGamesErrors,
				[key]: e instanceof Error ? e.message : 'Failed to load games'
			};
		} finally {
			characterGamesLoading = { ...characterGamesLoading, [key]: false };
		}
	}

	const filteredSorted = $derived(() => {
		const query = search.trim().toLowerCase();
		const filtered = query
			? rows.filter((r) => r.character.toLowerCase().includes(query))
			: rows.slice();

		return filtered.sort((a, b) => {
			if (sortMode === 'avg_placement') {
				const byPlace = a.avg_placement - b.avg_placement;
				if (byPlace !== 0) return byPlace;
				const byPoints = b.avg_victory_points - a.avg_victory_points;
				if (byPoints !== 0) return byPoints;
				return b.games_played - a.games_played;
			}

			if (sortMode === 'games_played') {
				const byGames = b.games_played - a.games_played;
				if (byGames !== 0) return byGames;
				const byPoints = b.avg_victory_points - a.avg_victory_points;
				if (byPoints !== 0) return byPoints;
				return a.avg_placement - b.avg_placement;
			}

			const byPoints = b.avg_victory_points - a.avg_victory_points;
			if (byPoints !== 0) return byPoints;
			const byPlace = a.avg_placement - b.avg_placement;
			if (byPlace !== 0) return byPlace;
			return b.games_played - a.games_played;
		});
	});

	async function load() {
		loading = true;
		error = null;
		try {
			await loadAssets();
			rows = await fetchCharacterStatsVerified();
		} catch (e) {
			console.error('Failed to load character stats:', e);
			error = e instanceof Error ? e.message : 'Failed to load character stats';
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>Character Stats | Arc Spirits Spectate</title>
</svelte:head>

<div class="stats-page">
	<main class="stats-main">
		<a href="/stats" class="back-link">← Stats Index</a>
		<div class="section-marker">
			<div class="sm-num">13</div>
			<div class="sm-label">Guardian Index</div>
		</div>
		<h1 class="page-title">Character Stats</h1>
		<p class="subhead-meta">Computed from verified games (over 10 turns; players with a TTS username and ≥10 VP).</p>

		<div class="toolbar">
			<div class="toolbar-controls">
				<div class="ctrl-group">
					<label for="character-sort" class="ctrl-label">Sort</label>
					<select id="character-sort" bind:value={sortMode} class="ctrl-select">
						<option value="avg_victory_points">Avg VP (desc)</option>
						<option value="avg_placement">Avg Placement (asc)</option>
						<option value="games_played">Games played (desc)</option>
					</select>
				</div>
				<div class="ctrl-group">
					<label for="character-search" class="ctrl-label">Search</label>
					<input
						id="character-search"
						bind:value={search}
						placeholder="Filter characters…"
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
				<p>Loading character stats…</p>
			</div>
		{:else if error}
			<div class="state-error">
				<p>{error}</p>
			</div>
		{:else if filteredSorted().length === 0}
			<div class="state-msg">
				{#if rows.length === 0 && search.trim() === ''}
					<p class="state-title">No character stats yet.</p>
					<p>Verify at least one game to populate this page.</p>
				{:else}
					<p>No characters match this search.</p>
				{/if}
			</div>
		{:else}
			<div class="table-wrap">
				<div class="table-scroll">
					<table class="data-table">
						<thead>
							<tr class="thead-row">
								<th class="th">Character</th>
								<th class="th">Games</th>
								<th class="th">Wins</th>
								<th class="th num">Avg VP</th>
								<th class="th num">Avg Place</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredSorted() as r, i (r.character)}
								{@const asset = getGuardianAsset(r.character)}
								{@const key = r.character}
								<tr class="td-row" class:alt={i % 2 === 1}>
									<td class="td">
										<div class="char-cell">
											<div class="char-portrait" title={r.character}>
												{#if asset?.iconUrl}
													<img
														src={asset.iconUrl}
														alt={r.character}
														class="char-img"
														loading="lazy"
														decoding="async"
													/>
												{:else}
													<div class="char-initials">{r.character.slice(0, 2)}</div>
												{/if}
											</div>
											<div class="char-meta">
												<div class="char-name">{r.character}</div>
												{#if asset?.origin?.name}
													<div class="char-origin">{asset.origin.name}</div>
												{/if}
											</div>
										</div>
									</td>
									<td class="td">
										<details class="game-details">
											<summary
												onclick={() => void ensureCharacterGamesLoaded(r)}
												class="games-summary"
											>
												<span class="big-num">{r.games_played}</span>
												<span class="games-label">games</span>
											</summary>
											<div class="games-panel">
												{#if characterGamesLoading[key]}
													<div class="panel-msg">Loading games…</div>
												{:else if characterGamesErrors[key]}
													<div class="panel-err">{characterGamesErrors[key]}</div>
												{:else}
													{@const games = characterGamesByName[key] ?? []}
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
																			{#if g.examplePlayer}
																				<div class="game-meta">
																					{g.examplePlayer}
																					{#if g.bestPlacement != null} · Place {g.bestPlacement}{/if}
																					{#if g.bestVictoryPoints != null} · {g.bestVictoryPoints} VP{/if}
																					{#if g.playersOnCharacter > 1} · {g.playersOnCharacter} players{/if}
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

	/* toolbar */
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
	.toolbar-controls { display: flex; gap: 20px; flex-wrap: wrap; flex: 1; }
	.ctrl-group { display: flex; flex-direction: column; gap: 6px; min-width: 160px; }
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
	.ctrl-select:focus, .ctrl-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}
	.ctrl-input::placeholder { color: var(--color-whisper); }

	/* table */
	.table-wrap {
		border: 1px solid var(--color-mist);
		overflow: hidden;
	}
	.table-scroll { overflow-x: auto; }
	.data-table {
		width: 100%;
		min-width: 640px;
		border-collapse: collapse;
	}

	.thead-row {
		background: var(--brand-magenta);
	}
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
		transition: background 140ms ease;
	}
	.td-row.alt { background: rgba(34, 20, 64, 0.5); }
	.td-row:hover { background: rgba(255, 43, 199, 0.07); }

	.td {
		padding: 12px 16px;
		color: var(--color-parchment);
		font-size: 0.9rem;
		vertical-align: middle;
	}

	/* big numbers in cells */
	.big-num {
		font-family: var(--font-display);
		font-size: 1.5rem;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.big-num.accent { color: var(--brand-magenta); }

	/* character cell */
	.char-cell { display: flex; align-items: center; gap: 12px; }
	.char-portrait {
		width: 44px; height: 44px;
		flex: none;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		overflow: hidden;
		display: grid;
		place-items: center;
	}
	.char-img { width: 100%; height: 100%; object-fit: cover; }
	.char-initials {
		font-family: var(--font-display);
		font-size: 0.9rem;
		color: var(--color-fog);
	}
	.char-meta { min-width: 0; }
	.char-name {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--color-bone);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.char-origin { margin-top: 2px; font-size: 0.75rem; color: var(--color-fog); }

	/* games expandable */
	.game-details { display: inline; }
	.games-summary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		list-style: none;
		color: var(--brand-magenta-soft);
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

	/* states */
	.state-msg {
		padding: 60px 24px;
		text-align: center;
		color: var(--color-fog);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
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
