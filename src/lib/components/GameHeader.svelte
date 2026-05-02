<script lang="ts">
	import NavigationSelector from './NavigationSelector.svelte';
	import { toFullReplayCode, toShortReplayCode } from '$lib/replayCodes';

	interface Props {
		gameId: string;
		navigationCount: number;
		maxNavigation: number;
		isLive: boolean;
		onRoundChange: (round: number) => void;
		onToggleLive: () => void;
		roundTimestamp?: string | null;
		roundDeltaMs?: number | null;
	}

	let {
		gameId,
		navigationCount,
		maxNavigation,
		isLive,
		onRoundChange,
		onToggleLive,
		roundTimestamp = null,
		roundDeltaMs = null
	}: Props = $props();

	// Truncate game ID for display
	const displayGameId = $derived(
		gameId.length > 12 ? `${gameId.slice(0, 8)}...${gameId.slice(-4)}` : gameId
	);

	// Copy game ID to clipboard
	let copied = $state(false);
	async function copyGameId() {
		try {
			await navigator.clipboard.writeText(gameId);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
		}
	}

	const replayCodeShort = $derived(toShortReplayCode(navigationCount));
	const replayCodeFull = $derived(toFullReplayCode(gameId, navigationCount));

	let replayCopied = $state(false);
	async function copyReplayCode() {
		try {
			await navigator.clipboard.writeText(replayCodeFull);
			replayCopied = true;
			setTimeout(() => (replayCopied = false), 2000);
		} catch (e) {
			console.error('Failed to copy replay code:', e);
		}
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

<header class="game-header flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
	<!-- Left: Game ID and Title -->
	<div class="flex items-center gap-3">
		<a
			href="/"
			class="back-btn"
			aria-label="Back to games list"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="currentColor"
				class="h-6 w-6"
			>
				<path
					fill-rule="evenodd"
					d="M2.25 5.25a3 3 0 013-3h13.5a3 3 0 013 3V15a3 3 0 01-3 3h-3v.257c0 .597.237 1.17.659 1.591l.621.622a.75.75 0 01-.53 1.28h-9a.75.75 0 01-.53-1.28l.621-.622a2.25 2.25 0 00.659-1.59V18h-3a3 3 0 01-3-3V5.25zm1.5 0v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5z"
					clip-rule="evenodd"
				/>
			</svg>
		</a>
		<button
			onclick={copyGameId}
			class="id-btn group"
			title="Click to copy game ID"
		>
			<span class="id-btn-title">Arc Spirits Spectate</span>
			<span class="id-btn-sub">
				{displayGameId}
				{#if copied}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 copy-ok">
						<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 copy-icon">
						<path fill-rule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5v-3.379a3 3 0 00-.879-2.121l-3.12-3.121a3 3 0 00-1.402-.791 2.252 2.252 0 011.913-1.576A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clip-rule="evenodd" />
						<path d="M3.5 6A1.5 1.5 0 002 7.5v9A1.5 1.5 0 003.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L8.44 6.439A1.5 1.5 0 007.378 6H3.5z" />
					</svg>
				{/if}
			</span>
		</button>

		<button
			onclick={copyReplayCode}
			class="replay-btn group"
			title={`Copy replay code (current round): ${replayCodeFull}`}
		>
			<span class="replay-label">Replay</span>
			<span class="replay-code">{replayCodeShort}</span>
			{#if replayCopied}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 copy-ok">
					<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 copy-icon">
					<path fill-rule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5v-3.379a3 3 0 00-.879-2.121l-3.12-3.121a3 3 0 00-1.402-.791 2.252 2.252 0 011.913-1.576A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clip-rule="evenodd" />
					<path d="M3.5 6A1.5 1.5 0 002 7.5v9A1.5 1.5 0 003.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L8.44 6.439A1.5 1.5 0 007.378 6H3.5z" />
				</svg>
			{/if}
		</button>
	</div>

	<!-- Center: Navigation Controls -->
	<div class="flex-1 lg:flex lg:justify-center lg:px-4">
		<div class="w-full lg:max-w-md">
			<NavigationSelector
				currentRound={navigationCount}
				maxRound={maxNavigation}
				{onRoundChange}
				{isLive}
				{onToggleLive}
			/>

			{#if roundTimestamp || roundDeltaMs != null}
				<div class="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs">
					<div class="flex items-center gap-1.5">
						<span class="meta-label">Timestamp</span>
						<span class="meta-value">{formatTimestamp(roundTimestamp)}</span>
					</div>
					{#if roundDeltaMs != null}
						<div class="flex items-center gap-1.5">
							<span class="meta-label">Round time</span>
							<span class="meta-value">{formatDuration(roundDeltaMs)}</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Right: Export + Connection Status -->
	<div class="flex items-center justify-end gap-2">
		<a
			href={`/game/${encodeURIComponent(gameId)}/export?auto=1`}
			target="_blank"
			rel="noopener noreferrer"
			class="export-btn"
			title="Export game history as PDF (one page per round)"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
				<path d="M7.5 3.75A2.25 2.25 0 0 1 9.75 1.5h4.5A2.25 2.25 0 0 1 16.5 3.75V6h-9V3.75Z" />
				<path fill-rule="evenodd" d="M6 7.5a3 3 0 0 0-3 3v3.75a.75.75 0 0 0 .75.75H6v2.25A2.25 2.25 0 0 0 8.25 19.5h7.5A2.25 2.25 0 0 0 18 17.25V15h2.25a.75.75 0 0 0 .75-.75V10.5a3 3 0 0 0-3-3H6Zm2.25 9a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" />
			</svg>
			<span class="hidden sm:inline">Export PDF</span>
			<span class="sm:hidden">PDF</span>
		</a>

		<div class="hidden items-center gap-2 lg:flex">
			{#if isLive}
				<div class="status-badge status-live">
					<span class="live-chip-dot"></span>
					<span class="status-live-text">Live</span>
				</div>
			{:else}
				<div class="status-badge status-paused">
					<span class="h-2.5 w-2.5 rounded-full" style="background: var(--color-whisper);"></span>
					<span class="status-paused-text">Paused</span>
				</div>
			{/if}
		</div>
	</div>
</header>

<style>
	.game-header {
		position: sticky;
		top: var(--app-topbar-height, 0px);
		z-index: 40;
		background: var(--color-shadow);
		border-bottom: 1px solid var(--color-mist);
	}

	/* Back button — solid flat square */
	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 4px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		color: var(--color-parchment);
		transition: border-color 180ms ease, color 180ms ease;
		text-decoration: none;
		flex-shrink: 0;
	}
	.back-btn:hover {
		border-color: var(--brand-magenta);
		color: var(--brand-magenta);
	}

	/* Game ID copy button */
	.id-btn {
		display: flex;
		flex-direction: column;
		padding: 6px 10px;
		border-radius: 8px;
		background: transparent;
		border: 1px solid transparent;
		transition: all 180ms ease;
		cursor: pointer;
		text-align: left;
	}
	.id-btn:hover {
		background: rgba(255, 43, 199, 0.06);
		border-color: rgba(255, 43, 199, 0.18);
	}
	.id-btn-title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.06em;
		color: var(--color-bone);
		transition: color 180ms ease;
	}
	.id-btn:hover .id-btn-title { color: var(--brand-magenta-soft); }
	.id-btn-sub {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fog);
		margin-top: 2px;
		transition: color 180ms ease;
	}
	.id-btn:hover .id-btn-sub { color: var(--color-parchment); }

	/* Replay code button */
	.replay-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 8px;
		background: transparent;
		border: 1px solid transparent;
		transition: all 180ms ease;
		cursor: pointer;
	}
	.replay-btn:hover {
		background: rgba(36, 212, 255, 0.06);
		border-color: rgba(36, 212, 255, 0.2);
	}
	.replay-label {
		font-family: var(--font-display);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-fog);
		transition: color 180ms ease;
	}
	.replay-btn:hover .replay-label { color: var(--brand-cyan); }
	.replay-code {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-parchment);
	}

	/* Copy icon states */
	.copy-ok { color: var(--brand-teal); }
	.copy-icon {
		color: var(--color-whisper);
		opacity: 0;
		transition: opacity 150ms ease;
	}
	.id-btn:hover .copy-icon,
	.replay-btn:hover .copy-icon { opacity: 1; }

	/* Metadata row below nav */
	.meta-label { color: var(--color-whisper); font-size: 0.7rem; letter-spacing: 0.04em; }
	.meta-value { font-family: var(--font-mono); font-size: 0.72rem; color: var(--color-parchment); }

	/* Export PDF button — solid violet fill */
	.export-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 16px;
		border-radius: 2px;
		border: none;
		background: var(--brand-violet);
		color: #fff;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
		transition: background 180ms ease;
	}
	.export-btn:hover {
		background: var(--brand-violet-soft);
	}

	/* Live chip dot */
	.live-chip-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #fff;
		flex-shrink: 0;
	}

	/* Status badges — solid chips, no glow rings */
	.status-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border-radius: 2px;
	}
	.status-live {
		background: var(--brand-magenta);
	}
	.status-live-text {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #fff;
	}
	.status-paused {
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
	}
	.status-paused-text {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	@keyframes fade-in {
		from { opacity: 0; transform: scale(0.95); }
		to   { opacity: 1; transform: scale(1); }
	}
</style>
