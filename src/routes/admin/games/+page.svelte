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

<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8 text-white">
	<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0">
			<h1 class="text-xl font-bold text-gray-100">Admin · Games</h1>
			<p class="mt-1 text-sm text-gray-400">
				Showing games over 10 turns. Verify games to make them show up by default and on the
				leaderboard.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<form method="POST" action="?/recompute">
				<button
					type="submit"
					disabled={Boolean(data.configError)}
					class="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-semibold text-gray-100 hover:bg-gray-700 disabled:opacity-50"
					title="Recompute verified stats + ratings"
				>
					Recompute stats
				</button>
			</form>
			<a
				href="/admin/logout"
				class="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-semibold text-gray-100 hover:bg-gray-700"
			>
				Log out
			</a>
		</div>
	</div>

	{#if data.configError}
		<div
			class="mb-6 rounded-lg border border-yellow-800 bg-yellow-900/20 p-4 text-sm text-yellow-200"
		>
			{data.configError}
		</div>
	{/if}

	<div class="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40">
		<table class="w-full min-w-[880px] text-left text-sm">
			<thead class="border-b border-gray-800 text-xs tracking-wide text-gray-400 uppercase">
				<tr>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Game</th>
					<th class="px-4 py-3">Ended</th>
					<th class="px-4 py-3">Rounds</th>
					<th class="px-4 py-3">Players</th>
					<th class="px-4 py-3">Median Turn</th>
					<th class="px-4 py-3">Winner</th>
					<th class="px-4 py-3 text-right">Actions</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-800">
				{#each data.games as g (g.game_id)}
					<tr class="hover:bg-gray-900/60">
						<td class="px-4 py-3">
							{#if g.verified}
								<span
									class="inline-flex items-center rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-200"
								>
									Verified
								</span>
							{:else}
								<span
									class="inline-flex items-center rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs font-semibold text-yellow-200"
								>
									Unverified
								</span>
							{/if}
						</td>
						<td class="px-4 py-3">
							<div class="font-semibold text-gray-100">{g.game_id}</div>
							<div class="mt-1 text-xs text-gray-500">Started {formatTimestamp(g.started_at)}</div>
						</td>
						<td class="px-4 py-3 text-gray-300">{formatTimestamp(g.ended_at)}</td>
						<td class="px-4 py-3 text-gray-300">{g.navigation_count}</td>
						<td class="px-4 py-3 text-gray-300">{g.player_count}</td>
						<td class="px-4 py-3 text-gray-300">{formatDuration(g.avg_navigation_ms)}</td>
						<td class="px-4 py-3 text-gray-300">
							{#if g.winner_guardian}
								<span class="font-semibold text-gray-100">{g.winner_guardian}</span>
								<span class="text-gray-400">({g.winner_vp} VP)</span>
							{:else}
								—
							{/if}
						</td>
						<td class="px-4 py-3">
							<div class="flex items-center justify-end gap-2">
								<a
									class="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-700"
									href={`/game/${encodeURIComponent(g.game_id)}`}
								>
									View
								</a>
								<a
									class="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-700"
									href={`/admin/games/${encodeURIComponent(g.game_id)}`}
								>
									Tags
								</a>
								{#if g.verified}
									<form method="POST" action="?/unverify">
										<input type="hidden" name="gameId" value={g.game_id} />
										<button
											type="submit"
											class="rounded-md bg-yellow-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600"
										>
											Unverify
										</button>
									</form>
								{:else}
									<form method="POST" action="?/verify">
										<input type="hidden" name="gameId" value={g.game_id} />
										<button
											type="submit"
											class="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
										>
											Verify
										</button>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="mt-8 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-gray-200">Stats</h2>
				<p class="mt-1 text-xs text-gray-500">
					Derived from verified games (and tags you add). Links support deep-linking to a round +
					player view.
				</p>
			</div>
			<a
				href="/stats"
				class="inline-flex items-center justify-center rounded-md bg-gray-800 px-3 py-1.5 text-sm font-semibold text-gray-100 hover:bg-gray-700"
			>
				Open stats
			</a>
		</div>

		<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<a
				href="/stats/tags"
				class="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:bg-gray-900/60"
			>
				<div class="text-sm font-semibold text-gray-100">Composition Tags</div>
				<div class="mt-1 text-xs text-gray-500">Ranked by average VP / placement.</div>
			</a>

			<a
				href="/stats/characters"
				class="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:bg-gray-900/60"
			>
				<div class="text-sm font-semibold text-gray-100">Characters</div>
				<div class="mt-1 text-xs text-gray-500">Average VP / placement by character.</div>
			</a>

			<a
				href="/stats/traits"
				class="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:bg-gray-900/60"
			>
				<div class="text-sm font-semibold text-gray-100">Trait Stats</div>
				<div class="mt-1 text-xs text-gray-500">Exact class/origin counts (e.g. 4 Fighters).</div>
			</a>
		</div>
	</div>
</main>
