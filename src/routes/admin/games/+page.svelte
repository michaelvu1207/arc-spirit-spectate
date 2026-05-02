<script lang="ts">
	type GameSummaryRow = {
		game_id: string;
		verified: boolean;
		verified_at: string | null;
		verified_by: string | null;
		started_at: string | null;
		ended_at: string | null;
		navigation_count: number;
		player_count: number;
		avg_navigation_ms: number | null;
		winner_guardian: string | null;
		winner_vp: number;
	};

	export let data: { games: GameSummaryRow[]; configError: string | null };

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
</script>

<svelte:head>
	<title>Admin Games | Arc Spirits</title>
</svelte:head>

<main class="admin-main">
	<div class="admin-header">
		<div class="admin-header-text">
			<span class="eyebrow">Admin</span>
			<h1 class="admin-title">Games</h1>
			<p class="admin-desc">Showing games over 10 turns. Verify games to make them show up by default and on the leaderboard.</p>
		</div>
		<div class="admin-actions">
			<form method="POST" action="?/recompute">
				<button
					type="submit"
					disabled={Boolean(data.configError)}
					class="btn-secondary"
					title="Recompute verified stats + ratings"
				>
					Recompute Stats
				</button>
			</form>
			<a href="/admin/logout" class="btn-ghost">Log out</a>
		</div>
	</div>

	{#if data.configError}
		<div class="alert-warn">{data.configError}</div>
	{/if}

	<div class="table-wrap">
		<div class="table-scroll">
			<table class="data-table">
				<thead>
					<tr class="thead-row">
						<th class="th">Status</th>
						<th class="th">Game</th>
						<th class="th">Ended</th>
						<th class="th num">Rounds</th>
						<th class="th num">Players</th>
						<th class="th">Median Turn</th>
						<th class="th">Winner</th>
						<th class="th right">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.games as g, i (g.game_id)}
						<tr class="td-row" class:alt={i % 2 === 1}>
							<td class="td">
								{#if g.verified}
									<span class="badge badge-verified">Verified</span>
								{:else}
									<span class="badge badge-pending">Unverified</span>
								{/if}
							</td>
							<td class="td">
								<div class="game-id">{g.game_id}</div>
								<div class="game-meta">Started {formatTimestamp(g.started_at)}</div>
							</td>
							<td class="td td-muted">{formatTimestamp(g.ended_at)}</td>
							<td class="td big-num">{g.navigation_count}</td>
							<td class="td big-num">{g.player_count}</td>
							<td class="td td-muted">{formatDuration(g.avg_navigation_ms)}</td>
							<td class="td">
								{#if g.winner_guardian}
									<span class="winner-name">{g.winner_guardian}</span>
									<span class="winner-vp">{g.winner_vp} VP</span>
								{:else}
									<span class="td-muted">—</span>
								{/if}
							</td>
							<td class="td">
								<div class="row-actions">
									<a class="btn-ghost btn-sm" href={`/game/${encodeURIComponent(g.game_id)}`}>View</a>
									<a class="btn-ghost btn-sm" href={`/admin/games/${encodeURIComponent(g.game_id)}`}>Tags</a>
									{#if g.verified}
										<form method="POST" action="?/unverify">
											<input type="hidden" name="gameId" value={g.game_id} />
											<button type="submit" class="btn-warn btn-sm">Unverify</button>
										</form>
									{:else}
										<form method="POST" action="?/verify">
											<input type="hidden" name="gameId" value={g.game_id} />
											<button type="submit" class="btn-primary btn-sm">Verify</button>
										</form>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- stats panel -->
	<div class="stats-panel">
		<div class="stats-panel-head">
			<div>
				<h2 class="stats-panel-title">Stats</h2>
				<p class="stats-panel-desc">Derived from verified games (and tags you add). Links support deep-linking to a round + player view.</p>
			</div>
			<a href="/stats" class="btn-primary">Open Stats</a>
		</div>

		<div class="stats-links">
			<a href="/stats/tags" class="stats-link">
				<div class="stats-link-name">Composition Tags</div>
				<div class="stats-link-desc">Ranked by average VP / placement.</div>
			</a>
			<a href="/stats/characters" class="stats-link">
				<div class="stats-link-name">Characters</div>
				<div class="stats-link-desc">Average VP / placement by character.</div>
			</a>
			<a href="/stats/traits" class="stats-link">
				<div class="stats-link-name">Trait Stats</div>
				<div class="stats-link-desc">Exact class/origin counts (e.g. 4 Fighters).</div>
			</a>
		</div>
	</div>
</main>

<style>
	.admin-main {
		max-width: 1280px;
		margin: 0 auto;
		padding: 48px 32px 80px;
		position: relative;
		z-index: 1;
	}

	/* header */
	.admin-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 32px;
	}
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
	.admin-desc { color: var(--color-parchment); font-size: 0.88rem; max-width: 56ch; margin: 0; }
	.admin-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 28px; }

	/* alert */
	.alert-warn {
		border: 1px solid var(--brand-amber);
		background: rgba(255, 186, 61, 0.08);
		padding: 14px 18px;
		color: var(--brand-amber-soft);
		font-size: 0.88rem;
		margin-bottom: 24px;
	}

	/* table */
	.table-wrap { border: 1px solid var(--color-mist); overflow: hidden; margin-bottom: 32px; }
	.table-scroll { overflow-x: auto; }
	.data-table { width: 100%; min-width: 880px; border-collapse: collapse; }

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

	.game-id { font-weight: 600; color: var(--color-bone); font-size: 0.88rem; word-break: break-all; }
	.game-meta { margin-top: 2px; font-size: 0.72rem; color: var(--color-fog); }

	.big-num {
		font-family: var(--font-display);
		font-size: 1.5rem;
		letter-spacing: 0.01em;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.winner-name { font-weight: 600; color: var(--color-bone); display: block; }
	.winner-vp { font-size: 0.75rem; color: var(--brand-amber-soft); }

	/* badges */
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 3px 10px;
		font-family: var(--font-display);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.badge-verified {
		background: rgba(32, 224, 193, 0.12);
		border: 1px solid rgba(32, 224, 193, 0.4);
		color: var(--brand-teal);
	}
	.badge-pending {
		background: rgba(255, 186, 61, 0.08);
		border: 1px solid rgba(255, 186, 61, 0.35);
		color: var(--brand-amber-soft);
	}

	/* row actions */
	.row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }

	.btn-sm {
		padding: 6px 12px !important;
		font-size: 0.66rem !important;
	}

	.btn-warn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 12px 24px;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-void);
		background: var(--brand-amber);
		border: none;
		cursor: pointer;
		transition: background 180ms ease;
	}
	.btn-warn:hover { background: var(--brand-amber-soft); }

	/* stats panel */
	.stats-panel {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		padding: 24px 28px;
	}
	.stats-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	.stats-panel-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		color: var(--color-bone);
		margin: 0 0 4px;
	}
	.stats-panel-desc { font-size: 0.8rem; color: var(--color-fog); margin: 0; max-width: 52ch; }

	.stats-links {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1px;
		background: var(--color-mist);
	}
	.stats-link {
		background: var(--color-shadow);
		padding: 18px 20px;
		text-decoration: none;
		color: inherit;
		transition: background 160ms ease;
	}
	.stats-link:hover { background: rgba(255, 43, 199, 0.06); }
	.stats-link-name { font-family: var(--font-display); font-size: 1.1rem; color: var(--color-bone); }
	.stats-link-desc { margin-top: 4px; font-size: 0.78rem; color: var(--color-fog); }

	@media (max-width: 640px) {
		.admin-main { padding: 32px 20px 60px; }
		.admin-header { flex-direction: column; }
		.admin-actions { padding-top: 0; }
	}
</style>
