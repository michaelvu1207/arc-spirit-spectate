<script lang="ts">
	import { onMount } from 'svelte';
	import { playMenuSfx } from '$lib/stores/menuAudio.svelte';
	import MenuShell from '$lib/components/play2d/MenuShell.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	const hover = () => playMenuSfx('ui-hover', { volume: 0.45 });

	onMount(() => {
		// Immersive full-screen: hide global chrome + lock scroll while on the menu.
		document.documentElement.classList.add('immersive-play');
		document.body.classList.add('immersive-play');
		return () => {
			document.documentElement.classList.remove('immersive-play');
			document.body.classList.remove('immersive-play');
		};
	});
</script>

<svelte:head>
	<title>Play Arc Spirits | Fight for the Arcane Abyss</title>
</svelte:head>

<InstallPrompt />

<MenuShell>
	<div class="home">
		<div class="logo reveal" style="--d: 0.04s">
			<span class="kicker"><span class="kn">01</span><span class="kl"></span> Live Play</span>
			<span class="l l1 brand-flame-text">Arc</span>
			<span class="l l2 brand-flame-text">Spirits</span>
			<span class="tag">Fight for the Arcane Abyss</span>
		</div>

		<div class="menu-col reveal" style="--d: 0.12s">
			<nav class="menu" aria-label="Main menu">
				<a
					data-testid="play-open"
					class="row primary"
					href="/play/browse"
					onpointerenter={hover}
					onclick={() => playMenuSfx('ui-click')}
				>
					<span class="gem"></span>
					<span class="lbl">Play</span>
					<span class="go">→</span>
				</a>

				<a
					class="row link"
					href="/play/champions"
					onpointerenter={hover}
					onclick={() => playMenuSfx('ui-click')}
				>
					<span class="gem"></span><span class="lbl">Hall of Champions</span><span class="go">→</span>
				</a>
				<a
					class="row link"
					href="/play/records"
					onpointerenter={hover}
					onclick={() => playMenuSfx('ui-click')}
				>
					<span class="gem"></span><span class="lbl">Game Records</span><span class="go">→</span>
				</a>
				<a
					class="row link"
					href="/play/builder"
					onpointerenter={hover}
					onclick={() => playMenuSfx('ui-click')}
				>
					<span class="gem"></span><span class="lbl">Builder</span><span class="go">→</span>
				</a>
				<a
					class="row link"
					href="/stats"
					onpointerenter={hover}
					onclick={() => playMenuSfx('ui-click')}
				>
					<span class="gem"></span><span class="lbl">Stats</span><span class="go">→</span>
				</a>
			</nav>
		</div>
	</div>
</MenuShell>

<style>
	.home {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: clamp(16px, 3vh, 34px);
		padding: clamp(58px, 9vh, 96px) 8vw clamp(28px, 5vh, 56px);
		/* Never scroll — the layout adapts to fit portrait AND landscape. */
		overflow: hidden;
	}

	/* ── Logo lockup (stacked so it never clips) ──────────────── */
	.logo {
		display: flex;
		flex-direction: column;
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-display);
		font-size: 0.66rem;
		letter-spacing: 0.34em;
		text-transform: uppercase;
		color: var(--color-fog, #9a8fb8);
		margin-bottom: clamp(6px, 1.4vh, 12px);
	}
	.kicker .kn {
		font-family: var(--font-mono);
		color: var(--brand-cyan, #24d4ff);
	}
	.kicker .kl {
		width: 26px;
		height: 1px;
		background: currentColor;
		opacity: 0.5;
	}
	.l {
		font-family: var(--font-display);
		/* vmin so the wordmark shrinks with the SHORT side — keeps landscape tidy. */
		font-size: clamp(2.6rem, 8vmin, 6.5rem);
		line-height: 0.82;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		filter: drop-shadow(0 6px 30px rgba(123, 29, 255, 0.5));
	}
	.l2 {
		margin-left: 0.06em;
	}
	.tag {
		margin-top: clamp(8px, 1.6vh, 16px);
		font-family: var(--font-display);
		font-size: clamp(0.7rem, 1.7vmin, 1.1rem);
		letter-spacing: 0.34em;
		text-transform: uppercase;
		color: var(--color-parchment, #d8cfee);
	}

	/* ── Menu column ──────────────────────────────────────────── */
	.menu-col {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 460px;
		min-width: 0;
	}
	.menu {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		padding: 14px 8px;
		background: none;
		border: none;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		color: var(--color-parchment, #d8cfee);
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		transition:
			transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1),
			color 200ms ease;
	}
	.row::after {
		content: '';
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: 6px;
		height: 1px;
		background: var(--gradient-spectrum, linear-gradient(90deg, #ff2bc7, #7b1dff, #24d4ff));
		transform: scaleX(0);
		transform-origin: left;
		opacity: 0.7;
		transition: transform 240ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.row:hover {
			color: #fff;
			transform: translateX(8px);
			outline: none;
		}
		.row:hover::after {
			transform: scaleX(1);
		}
		.row:hover .gem {
			background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff));
			border-color: transparent;
			box-shadow: 0 0 12px rgba(255, 43, 199, 0.7);
		}
		.row:hover .go {
			opacity: 1;
			transform: translateX(0);
		}
		.row.link:hover .lbl {
			color: #fff;
		}
	}
	.row:focus-visible {
		color: #fff;
		transform: translateX(8px);
		outline: none;
	}
	.row:focus-visible::after {
		transform: scaleX(1);
	}

	.gem {
		flex: 0 0 auto;
		width: 11px;
		height: 11px;
		transform: rotate(45deg);
		border: 1px solid var(--color-aether, #3a2670);
		background: transparent;
		transition:
			background 200ms ease,
			border-color 200ms ease,
			box-shadow 200ms ease;
	}
	.row:focus-visible .gem {
		background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff));
		border-color: transparent;
		box-shadow: 0 0 12px rgba(255, 43, 199, 0.7);
	}

	.lbl {
		flex: 1;
		font-family: var(--font-display);
		font-size: 1.5rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		line-height: 1;
	}

	.go {
		flex: 0 0 auto;
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--brand-magenta-soft, #ff5dd1);
		opacity: 0;
		transform: translateX(-6px);
		transition:
			opacity 200ms ease,
			transform 200ms ease;
	}
	.row:focus-visible .go {
		opacity: 1;
		transform: translateX(0);
	}

	.row.primary .lbl {
		font-size: 1.95rem;
	}
	.row.primary .gem {
		background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff));
		border-color: transparent;
		box-shadow: 0 0 14px rgba(255, 43, 199, 0.65);
		animation: gem-pulse 2.8s ease-in-out infinite;
	}
	.row.primary .go {
		opacity: 0.85;
		transform: none;
		color: var(--brand-magenta, #ff2bc7);
	}
	.row.link .lbl {
		font-size: 1.05rem;
		color: var(--color-fog, #9a8fb8);
		letter-spacing: 0.16em;
	}
	.row:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	@keyframes gem-pulse {
		0%,
		100% {
			box-shadow: 0 0 10px rgba(255, 43, 199, 0.5);
		}
		50% {
			box-shadow:
				0 0 20px rgba(255, 43, 199, 0.85),
				0 0 36px rgba(123, 29, 255, 0.4);
		}
	}

	/* ── Staggered load ───────────────────────────────────────── */
	.reveal {
		opacity: 0;
		transform: translateY(16px);
		animation: reveal-up 620ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
		animation-delay: var(--d, 0s);
	}
	@keyframes reveal-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Landscape (short height): logo left, menu right so nothing scrolls ── */
	@media (orientation: landscape) and (max-height: 640px) {
		.home {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 5vw;
			padding: clamp(46px, 13vh, 64px) 6vw clamp(18px, 8vh, 40px);
		}
		.logo {
			flex: 0 1 auto;
			min-width: 0;
		}
		.l {
			font-size: clamp(2rem, 12vh, 4.6rem);
		}
		.tag {
			margin-top: clamp(4px, 1.2vh, 12px);
			font-size: clamp(0.6rem, 2.4vh, 0.95rem);
		}
		.kicker {
			margin-bottom: clamp(4px, 1.2vh, 12px);
		}
		.menu-col {
			flex: 0 0 auto;
			max-width: 46vw;
		}
		.row {
			padding: clamp(5px, 1.5vh, 14px) 8px;
		}
		.row::after {
			bottom: 3px;
		}
		.lbl {
			font-size: clamp(1rem, 4.6vh, 1.5rem);
		}
		.row.primary .lbl {
			font-size: clamp(1.2rem, 5.8vh, 1.95rem);
		}
		.row.link .lbl {
			font-size: clamp(0.8rem, 3.4vh, 1.05rem);
		}
	}

	/* ── Portrait phones ──────────────────────────────────────── */
	@media (max-width: 620px) and (orientation: portrait) {
		.home {
			padding: clamp(56px, 10vh, 84px) 7vw clamp(28px, 6vh, 48px);
		}
	}
	@media (max-width: 480px) and (orientation: portrait) {
		.home {
			gap: clamp(14px, 2.4vh, 20px);
		}
		.menu-col {
			max-width: 100%;
		}
		.lbl {
			font-size: 1.25rem;
		}
		.row.primary .lbl {
			font-size: 1.55rem;
		}
		.row.link .lbl {
			font-size: 0.92rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.reveal {
			animation: none;
			opacity: 1;
			transform: none;
		}
		.row.primary .gem {
			animation: none;
		}
	}

	/* Immersive full-screen: hide global chrome + lock scroll while on the menu. */
	:global(html.immersive-play),
	:global(body.immersive-play) {
		height: 100%;
		overflow: hidden;
	}
	:global(body.immersive-play .topbar) {
		display: none !important;
	}
	:global(body.immersive-play .app),
	:global(body.immersive-play .app > .flex-1) {
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
	}
</style>
