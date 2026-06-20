<script lang="ts">
	import { onMount } from 'svelte';
	import ScreenScaffold from './ScreenScaffold.svelte';
	import HexPortrait from './HexPortrait.svelte';
	import StatCell from './StatCell.svelte';
	import GameDetailPanel from './GameDetailPanel.svelte';
	import StateMessage from './StateMessage.svelte';
	import {
		toSortedRecords,
		deriveGlance,
		filterRecords,
		shortenGameId,
		MIN_TURNS_TO_SHOW,
		type RecordGame,
		type VerificationFilter,
		type TurnFilter
	} from '$lib/features/records/records';
	import {
		formatDate,
		formatDuration,
		formatDurationHoursMinutes
	} from '$lib/features/stats/format';
	import { toShortReplayCode, toFullReplayCode } from '$lib/replayCodes';
	import { loadAssets, getGuardianAsset } from '$lib/stores/assetStore.svelte';
	import { fetchGameSummaries } from '$lib/supabase';
	import { playMenuSfx } from '$lib/stores/menuAudio.svelte';

	interface Props {
		backHref?: string;
		backLabel?: string;
	}

	let { backHref = '/play', backLabel = 'Menu' }: Props = $props();

	let games = $state<RecordGame[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastRefresh = $state<Date | null>(null);
	let verificationFilter = $state<VerificationFilter>('verified');
	let turnFilter = $state<TurnFilter>('15plus');
	let selectedGame = $state<RecordGame | null>(null);
	let copiedGameId = $state<string | null>(null);
	let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

	const glance = $derived(deriveGlance(games));
	const filtered = $derived(filterRecords(games, verificationFilter, turnFilter));
	const verifiedCount = $derived(games.filter((g) => g.verified).length);
	const unverifiedCount = $derived(games.filter((g) => !g.verified).length);

	async function refresh() {
		loading = true;
		error = null;
		try {
			const rows = await fetchGameSummaries();
			games = toSortedRecords(rows);
			lastRefresh = new Date();
		} catch (e) {
			console.error('Error fetching records:', e);
			error = e instanceof Error ? e.message : 'Failed to fetch records.';
		} finally {
			loading = false;
		}
	}

	function selectGame(g: RecordGame) {
		playMenuSfx('ui-click');
		selectedGame = g;
	}

	async function copyReplay(g: RecordGame) {
		const code = toFullReplayCode(g.gameId, g.navigationCount);
		if (typeof navigator === 'undefined' || !navigator.clipboard) {
			console.warn('Clipboard unavailable; cannot copy replay code.');
			return;
		}
		try {
			await navigator.clipboard.writeText(code);
			copiedGameId = g.gameId;
			if (copyResetTimer) clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => {
				copiedGameId = null;
			}, 2000);
		} catch (e) {
			console.error('Failed to copy replay code:', e);
		}
	}

	const hover = () => playMenuSfx('ui-hover', { volume: 0.35 });

	onMount(() => {
		let cancelled = false;
		let interval: ReturnType<typeof setInterval> | null = null;
		void loadAssets();
		(async () => {
			await refresh();
			if (cancelled) return;
			interval = setInterval(refresh, 30000);
		})();
		return () => {
			cancelled = true;
			if (interval) clearInterval(interval);
			if (copyResetTimer) {
				clearTimeout(copyResetTimer);
				copyResetTimer = null;
			}
		};
	});
</script>

<ScreenScaffold
	eyebrow="Archive"
	title="Game Records"
	subtitle="Browse completed games and open any round."
	syncedAt={lastRefresh}
	{backHref}
	{backLabel}
>
	{#snippet actions()}
		<button class="refresh btn-ghost" type="button" onclick={refresh} disabled={loading}>
			<svg
				class:spin={loading}
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
			Refresh
		</button>
	{/snippet}

	<!-- ── At a Glance ────────────────────────────────────────── -->
	<div class="glance">
		<StatCell value={glance.recentVerified} label="Recent (Verified)" size="md">
			{#snippet icon()}
				<svg viewBox="0 0 24 24"
					><polygon points="12,3 21,8 21,16 12,21 3,16 3,8" stroke-linejoin="round" /></svg
				>
			{/snippet}
		</StatCell>
		<span class="g-div" aria-hidden="true"></span>
		<StatCell value={glance.totalRounds} label="Rounds" size="md">
			{#snippet icon()}
				<svg viewBox="0 0 24 24"
					><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" stroke-linecap="round" /></svg
				>
			{/snippet}
		</StatCell>
		<span class="g-div" aria-hidden="true"></span>
		<StatCell value={glance.totalPlayers} label="Player Slots" size="md">
			{#snippet icon()}
				<svg viewBox="0 0 24 24"
					><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path
						d="M3 19c0-3 3-5 6-5s6 2 6 5"
						stroke-linecap="round"
					/><path d="M14 19c0-2 2-3.5 4-3.5s3 1 3 3" stroke-linecap="round" /></svg
				>
			{/snippet}
		</StatCell>
		<span class="g-div" aria-hidden="true"></span>
		<StatCell value={formatDurationHoursMinutes(glance.avgDurationMs)} label="Avg Length" size="md">
			{#snippet icon()}
				<svg viewBox="0 0 24 24"
					><path
						d="M3 12h6l3 8 3-16 3 8h3"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
			{/snippet}
		</StatCell>
		<span class="g-div" aria-hidden="true"></span>
		<StatCell value={formatDuration(glance.medianTurnDurationMs)} label="Median Turn" size="md">
			{#snippet icon()}
				<svg viewBox="0 0 24 24"
					><path d="M12 2v6m0 8v6M2 12h6m8 0h6" stroke-linecap="round" /><circle
						cx="12"
						cy="12"
						r="3"
					/></svg
				>
			{/snippet}
		</StatCell>
	</div>

	<!-- ── Filters ────────────────────────────────────────────── -->
	<div class="filters">
		<div class="tabs-underline">
			<button
				class="tab-btn"
				class:active={verificationFilter === 'verified'}
				onclick={() => (verificationFilter = 'verified')}
				onpointerenter={hover}>Verified <span class="tab-num">{verifiedCount}</span></button
			>
			<button
				class="tab-btn"
				class:active={verificationFilter === 'unverified'}
				onclick={() => (verificationFilter = 'unverified')}
				onpointerenter={hover}>Pending <span class="tab-num">{unverifiedCount}</span></button
			>
			<button
				class="tab-btn"
				class:active={verificationFilter === 'all'}
				onclick={() => (verificationFilter = 'all')}
				onpointerenter={hover}>All <span class="tab-num">{games.length}</span></button
			>
		</div>
		<div class="tabs-underline">
			<button
				class="tab-btn"
				class:active={turnFilter === '15plus'}
				onclick={() => (turnFilter = '15plus')}
				onpointerenter={hover}>{MIN_TURNS_TO_SHOW}+ turns</button
			>
			<button
				class="tab-btn"
				class:active={turnFilter === 'under15'}
				onclick={() => (turnFilter = 'under15')}
				onpointerenter={hover}>Under {MIN_TURNS_TO_SHOW}</button
			>
			<button
				class="tab-btn"
				class:active={turnFilter === 'all'}
				onclick={() => (turnFilter = 'all')}
				onpointerenter={hover}>All</button
			>
		</div>
	</div>

	<!-- ── Archive ────────────────────────────────────────────── -->
	{#if loading && games.length === 0}
		<StateMessage loading message="Summoning records from the abyss…" />
	{:else if error}
		<StateMessage tone="error" title="The lantern has guttered out" message={error}>
			{#snippet actions()}
				<button class="btn-ghost" type="button" onclick={refresh}>Try Again</button>
			{/snippet}
		</StateMessage>
	{:else if games.length === 0}
		<StateMessage
			title="No conjurings recorded"
			message="Game records appear here once players sync from Tabletop Simulator."
		/>
	{:else if filtered.length === 0}
		<StateMessage
			title="No games match this filter"
			message="Try a different verification or turn-count filter."
		/>
	{:else}
		<div class="archive" role="table" aria-label="Game records">
			<div class="row head" role="row">
				<div class="c-winner" role="columnheader">Winner</div>
				<div class="c-game" role="columnheader">Game</div>
				<div class="c-stat" role="columnheader">Rounds</div>
				<div class="c-stat" role="columnheader">Players</div>
				<div class="c-stat" role="columnheader">Duration</div>
				<div class="c-stat c-avgnav" role="columnheader">Avg Nav</div>
				<div class="c-replay" role="columnheader">Replay</div>
				<div class="c-status" role="columnheader">Status</div>
				<div class="c-go" role="columnheader" aria-hidden="true"></div>
			</div>

			{#each filtered as game (game.gameId)}
				{@const icon = game.winnerGuardian
					? (getGuardianAsset(game.winnerGuardian)?.iconUrl ?? null)
					: null}
				<div class="row-wrap" role="row">
					<button
						class="row data"
						type="button"
						onclick={() => selectGame(game)}
						onpointerenter={hover}
					>
						<div class="c-winner" role="cell">
							<HexPortrait
								src={icon}
								name={game.winnerGuardian ?? ''}
								alt={game.winnerGuardian ?? 'No winner'}
								size={38}
								accent="var(--brand-magenta)"
							/>
							<div class="winner-meta">
								{#if game.winnerGuardian}
									<div class="winner-name">{game.winnerGuardian}</div>
									<div class="winner-vp">{game.winnerVp} VP</div>
								{:else}
									<div class="winner-name dim">No winner</div>
								{/if}
							</div>
						</div>
						<div class="c-game" role="cell">
							<div class="game-id">{shortenGameId(game.gameId)}</div>
							<div class="game-date">{formatDate(game.endedAt)}</div>
						</div>
						<div class="c-stat" role="cell"><span class="num">{game.navigationCount}</span></div>
						<div class="c-stat" role="cell"><span class="num">{game.playerCount}</span></div>
						<div class="c-stat" role="cell">
							<span class="num">{formatDurationHoursMinutes(game.totalDurationMs)}</span>
						</div>
						<div class="c-stat c-avgnav" role="cell">
							<span class="num">{formatDuration(game.avgNavigationMs)}</span>
						</div>
						<div class="c-replay" role="cell">
							<span class="replay-code">{toShortReplayCode(game.navigationCount)}</span>
						</div>
						<div class="c-status" role="cell">
							<span class="status-tag" class:verified={game.verified}>
								{game.verified ? 'Verified' : 'Pending'}
							</span>
						</div>
						<div class="c-go" role="cell"><span class="go" aria-hidden="true">→</span></div>
					</button>
					<button
						class="copy-btn"
						type="button"
						onclick={() => copyReplay(game)}
						title={`Copy ${toFullReplayCode(game.gameId, game.navigationCount)}`}
					>
						{copiedGameId === game.gameId ? 'Copied' : 'Copy'}
					</button>
				</div>
			{/each}
		</div>

		<div class="archive-foot">
			Showing <b>{filtered.length}</b> of <b>{games.length}</b> chronicles
		</div>
	{/if}
</ScreenScaffold>

{#if selectedGame}
	<GameDetailPanel game={selectedGame} onClose={() => (selectedGame = null)} />
{/if}

<style>
	.refresh :global(svg.spin) {
		animation: spin 1s linear infinite;
	}

	/* ── At a Glance ────────────────────────────────────────── */
	.glance {
		display: flex;
		align-items: stretch;
		flex-wrap: wrap;
		gap: 18px 22px;
		padding: 20px 0 24px;
		border-bottom: 1px solid var(--color-mist);
	}
	.g-div {
		width: 1px;
		align-self: stretch;
		min-height: 40px;
		background: var(--color-mist);
	}

	/* ── Filters ────────────────────────────────────────────── */
	.filters {
		display: flex;
		gap: 28px;
		flex-wrap: wrap;
		align-items: flex-end;
		margin-top: 24px;
		margin-bottom: 8px;
	}
	.tab-num {
		margin-left: 4px;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 0.8rem;
		color: var(--color-whisper);
		letter-spacing: 0;
	}

	/* ── Archive table ──────────────────────────────────────── */
	.archive {
		margin-top: 18px;
		border-top: 1px solid var(--color-mist);
	}
	.row {
		display: grid;
		grid-template-columns:
			minmax(190px, 1.6fr) minmax(130px, 1.2fr) 72px 72px 92px 92px
			88px 92px 34px;
		align-items: center;
		gap: 16px;
		padding: 13px 8px;
		border-bottom: 1px solid var(--color-mist);
	}
	.row.head {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.row-wrap {
		position: relative;
		display: block;
	}
	.row.data {
		width: 100%;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--color-mist);
		text-align: left;
		cursor: pointer;
		color: inherit;
		font: inherit;
		transition: background 180ms ease;
	}
	/* Subtle spectrum underline sweep on hover, mirroring the play-menu rows. */
	.row.data::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: 0;
		height: 1px;
		background: var(--gradient-spectrum);
		transform: scaleX(0);
		transform-origin: left;
		opacity: 0.75;
		transition: transform 240ms ease;
	}
	.row.data:hover,
	.row.data:focus-visible {
		background: rgba(255, 43, 199, 0.05);
		outline: none;
	}
	.row.data:hover::after,
	.row.data:focus-visible::after {
		transform: scaleX(1);
	}

	.c-stat {
		text-align: right;
	}
	.num {
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
	}

	.c-winner {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.winner-meta {
		min-width: 0;
	}
	.winner-name {
		font-family: var(--font-display);
		font-size: 0.98rem;
		letter-spacing: 0.02em;
		color: var(--color-bone);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.winner-name.dim {
		color: var(--color-fog);
	}
	.winner-vp {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--brand-amber-soft);
		margin-top: 2px;
		font-variant-numeric: tabular-nums;
	}

	.game-id {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--color-bone);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.game-date {
		font-size: 0.8rem;
		color: var(--color-fog);
		margin-top: 2px;
	}

	.c-replay {
		text-align: right;
	}
	.replay-code {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-bone);
		font-variant-numeric: tabular-nums;
	}

	/* Copy button floats over the row so it isn't part of the row <button>. */
	.copy-btn {
		position: absolute;
		right: 46px;
		top: 50%;
		transform: translateY(-50%);
		background: transparent;
		border: 0;
		padding: 4px 2px;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-magenta-soft);
		cursor: pointer;
		transition: color 160ms ease;
		z-index: 2;
	}
	.copy-btn:hover,
	.copy-btn:focus-visible {
		color: var(--brand-magenta);
		outline: none;
	}

	.c-status {
		text-align: right;
	}
	.status-tag {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--brand-amber-soft);
	}
	.status-tag.verified {
		color: var(--brand-teal);
	}

	.c-go {
		text-align: right;
	}
	.go {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--color-fog);
		transition:
			color 180ms ease,
			transform 180ms ease;
		display: inline-block;
	}
	.row.data:hover .go,
	.row.data:focus-visible .go {
		color: var(--brand-magenta);
		transform: translateX(2px);
	}

	.archive-foot {
		margin-top: 22px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--color-fog);
	}
	.archive-foot b {
		color: var(--color-bone);
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}

	/* Refresh icon spin keyframes (StateMessage owns its own spinner). */
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Responsive column drops ────────────────────────────── */
	@media (max-width: 1024px) {
		.row {
			grid-template-columns:
				minmax(170px, 1.5fr) minmax(120px, 1fr) 60px 60px 84px
				84px 34px;
			gap: 12px;
		}
		.c-avgnav,
		.c-replay {
			display: none;
		}
		.copy-btn {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.row.head {
			display: none;
		}
		.row {
			/* Winner (flex) | Status | arrow — status survives so the All/Pending
			   filters keep their trust signal on phones. */
			grid-template-columns: 1fr auto auto;
			gap: 12px;
			padding: 15px 8px;
		}
		.c-game,
		.c-stat {
			display: none;
		}
		/* Place status just before the trailing arrow. */
		.c-status {
			order: 1;
		}
		.c-go {
			order: 2;
		}
		.filters {
			gap: 20px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.refresh :global(svg.spin) {
			animation: none;
		}
		.row.data,
		.row.data::after,
		.go {
			transition: none;
		}
	}
</style>
