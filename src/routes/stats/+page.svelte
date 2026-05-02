<svelte:head>
	<title>Stats | Arc Spirits Spectate</title>
</svelte:head>

<div class="page">
	<div class="section-marker">
		<div class="sm-num">10</div>
		<div class="sm-label">Cartomancer's Index</div>
	</div>

	<h1 class="page-title">Meta<br />Divination</h1>
	<p class="page-desc">Aggregated meta drawn from verified games (over 10 turns; players with a TTS username and ≥10 VP). Three lenses below.</p>

	<!-- accent bar -->
	<div class="accent-bar" aria-hidden="true"></div>

	<nav class="stats-nav">
		<a href="/stats/tags" class="snav-row">
			<div class="snav-icon" aria-hidden="true">
				<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6">
					<path d="M14 4 4 14l14 14 10-10z" stroke-linejoin="round"/>
					<circle cx="11" cy="11" r="2" fill="currentColor"/>
				</svg>
			</div>
			<div class="snav-info">
				<div class="snav-title">Composition Tags</div>
				<div class="snav-desc">Manual tags assigned per player per game. Ranked by average VP and placement.</div>
			</div>
			<div class="snav-arrow">→</div>
		</a>

		<a href="/stats/characters" class="snav-row">
			<div class="snav-icon" aria-hidden="true">
				<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6">
					<circle cx="16" cy="13" r="5"/>
					<path d="M6 28c2-6 6-9 10-9s8 3 10 9" stroke-linecap="round"/>
				</svg>
			</div>
			<div class="snav-info">
				<div class="snav-title">Characters</div>
				<div class="snav-desc">Average VP and placement broken down by selected character.</div>
			</div>
			<div class="snav-arrow">→</div>
		</a>

		<a href="/stats/traits" class="snav-row">
			<div class="snav-icon" aria-hidden="true">
				<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6">
					<rect x="5" y="14" width="4" height="14" rx="0.5"/>
					<rect x="13" y="9" width="4" height="19" rx="0.5"/>
					<rect x="21" y="4" width="4" height="24" rx="0.5"/>
				</svg>
			</div>
			<div class="snav-info">
				<div class="snav-title">Trait Stats</div>
				<div class="snav-desc">Average VP and placement for exact class/origin counts (e.g. 4 Fighters, 5 Fighters).</div>
			</div>
			<div class="snav-arrow">→</div>
		</a>
	</nav>
</div>

<style>
	.page {
		max-width: 1280px;
		margin: 0 auto;
		padding: 56px 32px 80px;
		position: relative;
		z-index: 1;
	}

	.page-title {
		font-family: var(--font-display);
		font-size: clamp(3.5rem, 8vw, 6rem);
		font-weight: 400;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 0.9;
		color: var(--brand-magenta);
		margin: 20px 0 16px;
	}

	.page-desc {
		color: var(--color-parchment);
		font-size: 0.92rem;
		line-height: 1.55;
		max-width: 56ch;
		margin: 0 0 32px;
	}

	/* single accent embellishment — 3-color spectrum bar */
	.accent-bar {
		width: 80px;
		height: 3px;
		background: var(--gradient-spectrum);
		margin-bottom: 32px;
	}

	.stats-nav {
		border-top: 1px solid var(--color-mist);
	}

	.snav-row {
		display: grid;
		grid-template-columns: 52px 1fr 32px;
		align-items: center;
		gap: 20px;
		padding: 24px 12px;
		border-bottom: 1px solid var(--color-mist);
		text-decoration: none;
		color: inherit;
		transition: background 180ms ease;
	}
	.snav-row:hover { background: rgba(255, 43, 199, 0.05); }

	.snav-icon {
		width: 52px;
		height: 52px;
		display: grid;
		place-items: center;
		background: var(--color-tomb);
		color: var(--brand-magenta-soft);
		border: 1px solid var(--color-mist);
		flex: none;
	}
	.snav-icon svg { width: 60%; height: 60%; }

	.snav-info { min-width: 0; }

	.snav-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: 0.02em;
		color: var(--color-bone);
		line-height: 1;
	}

	.snav-desc {
		margin-top: 6px;
		color: var(--color-parchment);
		font-size: 0.88rem;
		max-width: 60ch;
	}

	.snav-arrow {
		font-size: 1.4rem;
		color: var(--color-fog);
		text-align: center;
		transition: color 180ms ease, transform 180ms ease;
	}
	.snav-row:hover .snav-arrow {
		color: var(--brand-magenta);
		transform: translateX(4px);
	}

	@media (max-width: 560px) {
		.page { padding: 36px 22px 60px; }
		.snav-row { grid-template-columns: 44px 1fr 24px; gap: 14px; padding: 18px 8px; }
		.snav-title { font-size: 1.25rem; }
	}
</style>
