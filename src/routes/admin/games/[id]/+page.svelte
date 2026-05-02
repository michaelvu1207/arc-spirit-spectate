<script lang="ts">
	type PlayerRow = {
		game_id: string;
		verified: boolean;
		started_at: string | null;
		ended_at: string | null;
		navigation_count: number;
		player_color: string;
		username: string | null;
		raw_username: string | null;
		selected_character: string;
		victory_points: number;
		placement: number;
		player_count: number;
		tags: string[];
	};

	export let data: {
		gameId: string;
		players: PlayerRow[];
		configError: string | null;
		tagOptions: string[];
	};

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
</script>

<svelte:head>
	<title>Admin Tags | Arc Spirits</title>
</svelte:head>

<main class="admin-main">
	<div class="admin-header">
		<div class="admin-header-text">
			<a href="/admin/games" class="back-link">← Admin Games</a>
			<span class="eyebrow">Admin</span>
			<h1 class="admin-title">Tags</h1>
			<p class="admin-desc">Game <span class="game-id-inline">{data.gameId}</span></p>
		</div>
		<div class="admin-actions">
			<a href={`/game/${encodeURIComponent(data.gameId)}`} class="btn-ghost">View Game</a>
			<a href="/admin/logout" class="btn-ghost">Log out</a>
		</div>
	</div>

	{#if data.configError}
		<div class="alert-warn">{data.configError}</div>
	{/if}

	{#if data.players.length === 0}
		<div class="empty-state">No players found for this game.</div>
	{:else}
		<datalist id="composition-tag-options">
			{#each data.tagOptions ?? [] as option (option)}
				<option value={option}></option>
			{/each}
		</datalist>

		<div class="table-wrap">
			<div class="table-scroll">
				<table class="data-table">
					<thead>
						<tr class="thead-row">
							<th class="th">Player</th>
							<th class="th">Character</th>
							<th class="th">Ended</th>
							<th class="th num">VP</th>
							<th class="th num">Place</th>
							<th class="th">Tags</th>
							<th class="th right">Add Tag</th>
						</tr>
					</thead>
					<tbody>
						{#each data.players as p, i (p.player_color)}
							<tr class="td-row" class:alt={i % 2 === 1}>
								<td class="td">
									<div class="player-name">{p.username ?? p.raw_username ?? 'Unknown'}</div>
									<div class="player-meta">
										{p.player_color} · {p.verified ? 'Verified' : 'Unverified'} · {p.navigation_count} rounds
									</div>
								</td>
								<td class="td td-char">{p.selected_character}</td>
								<td class="td td-muted">{formatTimestamp(p.ended_at)}</td>
								<td class="td big-num accent">{p.victory_points}</td>
								<td class="td big-num">{p.placement} / {p.player_count}</td>
								<td class="td">
									{#if p.tags.length === 0}
										<span class="no-tags">—</span>
									{:else}
										<div class="tag-list">
											{#each p.tags as tag (tag)}
												<form method="POST" action="?/removeTag" class="tag-form">
													<input type="hidden" name="playerColor" value={p.player_color} />
													<input type="hidden" name="tag" value={tag} />
													<button type="submit" class="tag-chip" title="Remove tag">
														<span>{tag}</span>
														<span class="tag-remove">×</span>
													</button>
												</form>
											{/each}
										</div>
									{/if}
								</td>
								<td class="td">
									<form method="POST" action="?/addTag" class="add-tag-form">
										<input type="hidden" name="playerColor" value={p.player_color} />
										<input
											name="tag"
											list="composition-tag-options"
											placeholder="e.g. astral mages"
											class="tag-input"
										/>
										<button type="submit" class="btn-primary btn-sm">Add</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<p class="footnote">Tags are stored lowercased and trimmed, and stats pages use verified games only.</p>
	{/if}
</main>

<style>
	.admin-main {
		max-width: 1280px;
		margin: 0 auto;
		padding: 48px 32px 80px;
		position: relative;
		z-index: 1;
	}

	.admin-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 32px;
	}
	.back-link {
		display: inline-flex; align-items: center; gap: 6px;
		font-family: var(--font-display); font-size: 0.66rem; font-weight: 700;
		letter-spacing: 0.18em; text-transform: uppercase;
		color: var(--brand-magenta-soft); text-decoration: none;
		margin-bottom: 8px; display: block;
	}
	.back-link:hover { color: var(--brand-magenta); }
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}
	.admin-title {
		font-family: var(--font-display);
		font-size: clamp(3rem, 5vw, 4.5rem);
		font-weight: 400;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 0.95;
		color: var(--color-bone);
		margin: 6px 0 8px;
	}
	.admin-desc { color: var(--color-parchment); font-size: 0.88rem; margin: 0; }
	.game-id-inline { font-family: var(--font-mono); color: var(--brand-cyan-soft); font-size: 0.88em; word-break: break-all; }
	.admin-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 28px; }

	.alert-warn {
		border: 1px solid var(--brand-amber);
		background: rgba(255, 186, 61, 0.08);
		padding: 14px 18px;
		color: var(--brand-amber-soft);
		font-size: 0.88rem;
		margin-bottom: 24px;
	}

	.empty-state {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 32px;
		text-align: center;
		color: var(--color-fog);
		font-size: 0.88rem;
	}

	/* table */
	.table-wrap { border: 1px solid var(--color-mist); overflow: hidden; }
	.table-scroll { overflow-x: auto; }
	.data-table { width: 100%; min-width: 980px; border-collapse: collapse; }

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
	.th.right { text-align: right; }

	.td-row {
		background: var(--color-tomb);
		border-bottom: 1px solid var(--color-mist);
		transition: background 140ms ease;
	}
	.td-row.alt { background: rgba(34, 20, 64, 0.5); }
	.td-row:hover { background: rgba(255, 43, 199, 0.05); }

	.td { padding: 12px 16px; color: var(--color-parchment); font-size: 0.88rem; vertical-align: middle; }
	.td-muted { color: var(--color-fog); }
	.td-char { color: var(--color-bone); font-weight: 500; }

	.player-name { font-weight: 600; color: var(--color-bone); }
	.player-meta { margin-top: 2px; font-size: 0.72rem; color: var(--color-fog); }

	.big-num {
		font-family: var(--font-display);
		font-size: 1.5rem;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.big-num.accent { color: var(--brand-magenta); }

	.no-tags { color: var(--color-whisper); }

	.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
	.tag-form { display: inline-flex; }
	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-parchment);
		font-family: var(--font-body);
		font-size: 0.75rem;
		cursor: pointer;
		transition: border-color 160ms ease, color 160ms ease;
	}
	.tag-chip:hover { border-color: var(--brand-coral); color: var(--brand-coral); }
	.tag-remove { color: var(--color-fog); }

	.add-tag-form { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
	.tag-input {
		width: 200px;
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 0.82rem;
		padding: 7px 12px;
		transition: border-color 160ms ease;
	}
	.tag-input::placeholder { color: var(--color-whisper); }
	.tag-input:focus { outline: none; border-color: var(--brand-magenta); }

	.btn-sm {
		padding: 8px 14px !important;
		font-size: 0.66rem !important;
	}

	.footnote {
		margin-top: 16px;
		font-size: 0.75rem;
		color: var(--color-whisper);
	}

	@media (max-width: 640px) {
		.admin-main { padding: 32px 20px 60px; }
		.admin-header { flex-direction: column; }
		.admin-actions { padding-top: 0; }
	}
</style>
