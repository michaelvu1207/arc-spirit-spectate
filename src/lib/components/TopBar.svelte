<script lang="ts">
	import { page } from '$app/stores';
</script>

{#if !$page.url.pathname.endsWith('/export')}
	{@const pathname = $page.url.pathname}
	{@const isImmersivePlay = /^\/play\/[^/]+$/.test(pathname)}
	{@const isLeaderboard = pathname.startsWith('/leaderboard')}
	{@const isStats = pathname.startsWith('/stats') && !pathname.startsWith('/stats-analysis')}
	{@const isStatsAnalysis = pathname.startsWith('/stats-analysis')}
	{@const isAdmin = pathname.startsWith('/admin')}
	{@const isPlayers = pathname.startsWith('/players')}
	{@const isClasses = pathname.startsWith('/classes')}
	{@const isPlay = pathname.startsWith('/play')}
	{@const isGames = !isLeaderboard && !isPlayers && !isStats && !isStatsAnalysis && !isAdmin && !isClasses && !isPlay}

	{#if !isImmersivePlay}
	<header class="screen-only topbar">
		<div class="spectrum-line"></div>
		<div class="topbar-inner">
			<a href="/" class="brand">
				<span class="lantern" aria-hidden="true">
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M16 3v3" stroke="url(#lg)" stroke-width="2" stroke-linecap="round" />
						<path d="M11 6h10l-1 3H12z" fill="url(#lg)" />
						<path d="M12 9h8v14a4 4 0 0 1-4 4 4 4 0 0 1-4-4z" fill="rgba(255,43,199,0.18)" stroke="url(#lg)" stroke-width="1.5" />
						<path d="M16 13c-2 1.6-3 3.2-3 5a3 3 0 0 0 6 0c0-1.8-1-3.4-3-5z" fill="url(#lg)" />
						<defs>
							<linearGradient id="lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
								<stop stop-color="#ff2bc7" />
								<stop offset="1" stop-color="#7b1dff" />
							</linearGradient>
						</defs>
					</svg>
				</span>
				<div class="brand-text">
					<div class="brand-eyebrow">Lantern Light Games</div>
					<div class="brand-title">ARC <span>SPIRITS</span> Spectate</div>
				</div>
			</a>

			<div class="nav-wrap">
				<nav class="nav">
					<a href="/" class="nav-link" class:active={isGames} aria-current={isGames ? 'page' : undefined}>
						<span class="nav-dot"></span>Records
					</a>
					<a href="/play" class="nav-link" class:active={isPlay} aria-current={isPlay ? 'page' : undefined}>
						<span class="nav-dot"></span>Play
					</a>
					<a href="/leaderboard" class="nav-link" class:active={isLeaderboard || isPlayers} aria-current={isLeaderboard || isPlayers ? 'page' : undefined}>
						<span class="nav-dot"></span>Leaderboard
					</a>
					<a href="/classes" class="nav-link" class:active={isClasses} aria-current={isClasses ? 'page' : undefined}>
						<span class="nav-dot"></span>Classes
					</a>
					<a href="/stats-analysis" class="nav-link" class:active={isStatsAnalysis} aria-current={isStatsAnalysis ? 'page' : undefined}>
						<span class="nav-dot"></span>Stats Analysis
					</a>
					{#if $page.data.isAdmin}
						<a href="/stats" class="nav-link" class:active={isStats} aria-current={isStats ? 'page' : undefined}>
							<span class="nav-dot"></span>Stats
						</a>
					{/if}
				</nav>

				{#if $page.data.isAdmin}
					<div class="admin-pill" title="You are viewing as admin">
						<span class="admin-dot"></span>Admin
					</div>
				{/if}
			</div>
		</div>
	</header>
	{/if}
{/if}

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--color-shadow);
		border-bottom: 1px solid var(--color-mist);
	}

	.spectrum-line {
		height: 3px;
		background: var(--brand-magenta);
	}

	.topbar-inner {
		max-width: 1280px;
		margin: 0 auto;
		padding: 14px 28px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		min-height: var(--app-topbar-height);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 14px;
		text-decoration: none;
		color: inherit;
		min-width: 0;
	}

	.lantern {
		flex: none;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 4px;
		background: var(--brand-magenta);
	}

	.lantern svg {
		width: 28px;
		height: 28px;
	}

	.brand-text { min-width: 0; }
	.brand-eyebrow {
		font-family: var(--font-display);
		font-size: 0.6rem;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.brand-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: 0.04em;
		color: var(--brand-magenta);
		line-height: 1;
		white-space: nowrap;
	}
	.brand-title span {
		color: var(--color-bone);
	}

	.nav-wrap {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.nav {
		display: inline-flex;
		gap: 2px;
	}

	.nav-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 18px;
		font-family: var(--font-display);
		font-size: 0.9rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fog);
		text-decoration: none;
		transition: color 180ms ease;
		position: relative;
	}

	.nav-link:hover {
		color: var(--color-bone);
	}

	.nav-link.active {
		color: var(--color-bone);
	}

	.nav-link.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 18px;
		right: 18px;
		height: 2px;
		background: var(--brand-magenta);
	}

	.nav-dot {
		width: 4px;
		height: 4px;
		background: var(--brand-magenta);
		transform: rotate(45deg);
		flex-shrink: 0;
		opacity: 0;
	}

	.nav-link.active .nav-dot {
		opacity: 1;
	}

	.admin-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		background: var(--brand-cyan);
		color: var(--color-void);
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		border-radius: 2px;
	}

	.admin-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-void);
	}

	@media (max-width: 720px) {
		.topbar-inner { flex-direction: column; align-items: flex-start; gap: 10px; }
		.brand-title { font-size: 1.3rem; }
		.nav-wrap { width: 100%; justify-content: space-between; }
	}
</style>
