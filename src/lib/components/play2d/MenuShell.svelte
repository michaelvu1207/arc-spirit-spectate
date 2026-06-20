<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import SplatBackground from './SplatBackground.svelte';
	import {
		armMenuAudio,
		toggleMenuMute,
		getMenuAudio,
		playMenuSfx,
		primeMenuSfx
	} from '$lib/stores/menuAudio.svelte';

	interface Props {
		/** The splat world behind the menu. Defaults to the Arcane Abyss. */
		splatSrc?: string;
		/** The menu music. Defaults to the Arcane Abyss theme. */
		audioSrc?: string;
		/** Camera dolly into the world (0..1). */
		push?: number;
		/** Show the "◈ Arc Spirits" brand in the top-left. */
		showBrand?: boolean;
		/** The screen's content, laid out over the abyss. */
		children?: Snippet;
	}

	let {
		splatSrc = '/splats/abyssal-portal.spz',
		audioSrc = '/music/worlds/abyssal-portal.mp3',
		push = 0,
		showBrand = true,
		children
	}: Props = $props();

	const audio = getMenuAudio();

	/** Whether the Fullscreen API exists on this device (iPhone Safari lacks it). */
	let fullscreenSupported = $state(false);
	/** Live fullscreen state, mirrored from the `fullscreenchange` event. */
	let isFullscreen = $state(false);

	onMount(() => {
		armMenuAudio(audioSrc);
		primeMenuSfx(['ui-hover', 'ui-click', 'ui-back', 'game-start']);

		// Feature-detect: hide the control entirely where requestFullscreen is absent.
		fullscreenSupported = typeof document.documentElement.requestFullscreen === 'function';
		if (!fullscreenSupported) return;

		const syncFullscreen = () => {
			isFullscreen = document.fullscreenElement !== null;
		};
		syncFullscreen();
		document.addEventListener('fullscreenchange', syncFullscreen);
		return () => {
			document.removeEventListener('fullscreenchange', syncFullscreen);
		};
	});

	async function toggleFullscreen() {
		playMenuSfx('ui-click');
		try {
			if (document.fullscreenElement === null) {
				await document.documentElement.requestFullscreen?.();
			} else {
				await document.exitFullscreen?.();
			}
		} catch {
			// Some browsers reject fullscreen outside a user gesture or in iframes; ignore.
		}
	}
</script>

<div class="menu-shell">
	<!-- Living world -->
	<div class="bg"><SplatBackground src={splatSrc} blur={0} {push} /></div>
	<!-- Directional scrim so content stays legible over the splat -->
	<div class="scrim"></div>
	<!-- Slow aurora wash + fine grain for depth -->
	<div class="aurora"></div>
	<div class="grain"></div>

	<!-- Persistent chrome -->
	<header class="topbar">
		{#if showBrand}
			<a class="brand" href="/">
				<span class="lantern">◈</span>
				<span class="word">Arc Spirits</span>
			</a>
		{:else}
			<span></span>
		{/if}
		<div class="controls">
			{#if fullscreenSupported}
				<button
					class="ctrl"
					type="button"
					onpointerenter={() => playMenuSfx('ui-hover', { volume: 0.45 })}
					onclick={toggleFullscreen}
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
					title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				>
					{#if isFullscreen}
						<svg viewBox="0 0 24 24" aria-hidden="true"
							><path
								d="M9 4v3a2 2 0 01-2 2H4m16 0h-3a2 2 0 01-2-2V4M4 15h3a2 2 0 012 2v3m11-5h-3a2 2 0 00-2 2v3"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
					{:else}
						<svg viewBox="0 0 24 24" aria-hidden="true"
							><path
								d="M4 9V6a2 2 0 012-2h3m6 0h3a2 2 0 012 2v3M4 15v3a2 2 0 002 2h3m6 0h3a2 2 0 002-2v-3"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
								stroke-linejoin="round"
							/></svg
						>
					{/if}
				</button>
			{/if}
			<button
				class="ctrl mute"
				type="button"
				onpointerenter={() => playMenuSfx('ui-hover', { volume: 0.45 })}
				onclick={() => {
					playMenuSfx('ui-click');
					toggleMenuMute();
				}}
				aria-label={audio.muted ? 'Unmute menu music' : 'Mute menu music'}
				title={audio.muted ? 'Unmute' : 'Mute'}
			>
				{#if audio.muted}
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path
							d="M4 9v6h4l5 4V5L8 9H4zM17 9l4 4m0-4l-4 4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path
							d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
				{/if}
			</button>
		</div>
	</header>

	<!-- Screen content -->
	<div class="stage">
		{@render children?.()}
	</div>
</div>

<style>
	.menu-shell {
		position: fixed;
		inset: 0;
		z-index: 60;
		overflow: hidden;
		background: var(--color-void, #050310);
		color: var(--color-bone, #f5f0ff);
	}

	.bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	/* Darken the left + bottom so titles/menu read; keep the right airy. */
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		background:
			linear-gradient(100deg, rgba(5, 3, 16, 0.88) 0%, rgba(5, 3, 16, 0.4) 42%, transparent 70%),
			linear-gradient(0deg, rgba(5, 3, 16, 0.9) 0%, transparent 40%),
			radial-gradient(ellipse 60% 50% at 50% -10%, rgba(123, 29, 255, 0.22), transparent 70%);
	}

	.aurora {
		position: absolute;
		inset: -10%;
		z-index: 1;
		pointer-events: none;
		mix-blend-mode: screen;
		opacity: 0.5;
		background:
			radial-gradient(ellipse 40% 30% at 20% 25%, rgba(255, 43, 199, 0.22), transparent 60%),
			radial-gradient(ellipse 45% 35% at 80% 35%, rgba(36, 212, 255, 0.18), transparent 60%),
			radial-gradient(ellipse 50% 40% at 60% 80%, rgba(90, 43, 255, 0.2), transparent 65%);
		animation: aurora-pan 22s ease-in-out infinite;
	}

	.grain {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		opacity: 0.5;
		mix-blend-mode: overlay;
		background-image:
			radial-gradient(circle at 25% 30%, rgba(255, 255, 255, 0.05) 1px, transparent 1.5px),
			radial-gradient(circle at 75% 65%, rgba(255, 43, 199, 0.05) 1px, transparent 2px),
			radial-gradient(circle at 50% 85%, rgba(36, 212, 255, 0.05) 1px, transparent 1.5px);
		background-size:
			220px 220px,
			300px 300px,
			260px 260px;
	}

	@keyframes aurora-pan {
		0%,
		100% {
			transform: translate3d(0, 0, 0) scale(1);
		}
		50% {
			transform: translate3d(2%, -2%, 0) scale(1.05);
		}
	}

	/* ── Topbar ─────────────────────────────────────────────── */
	.topbar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 22px 30px;
		padding-top: calc(22px + env(safe-area-inset-top));
		padding-left: calc(30px + env(safe-area-inset-left));
		padding-right: calc(30px + env(safe-area-inset-right));
	}

	@media (max-width: 600px) {
		.topbar {
			padding: 14px 16px;
			padding-top: calc(14px + env(safe-area-inset-top));
			padding-left: calc(16px + env(safe-area-inset-left));
			padding-right: calc(16px + env(safe-area-inset-right));
		}
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		text-decoration: none;
		color: var(--color-bone, #f5f0ff);
	}
	.brand .lantern {
		font-size: 1.1rem;
		color: var(--brand-magenta, #ff2bc7);
		filter: drop-shadow(0 0 8px rgba(255, 43, 199, 0.8));
	}
	.brand .word {
		font-family: var(--font-display);
		font-size: 1.05rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
	}

	.controls {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}

	.ctrl {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 1px solid var(--color-mist, #2e1d52);
		background: rgba(10, 7, 24, 0.5);
		color: var(--color-parchment, #d8cfee);
		cursor: pointer;
		backdrop-filter: blur(8px);
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		transition:
			border-color 160ms ease,
			color 160ms ease,
			transform 160ms ease;
	}
	.ctrl svg {
		width: 20px;
		height: 20px;
	}
	@media (hover: hover) and (pointer: fine) {
		.ctrl:hover {
			border-color: var(--brand-magenta, #ff2bc7);
			color: var(--brand-magenta-soft, #ff5dd1);
			transform: scale(1.06);
		}
	}
	.ctrl:focus-visible {
		border-color: var(--brand-magenta, #ff2bc7);
		color: var(--brand-magenta-soft, #ff5dd1);
		outline: 2px solid var(--brand-magenta, #ff2bc7);
		outline-offset: 2px;
	}

	/* ── Stage ──────────────────────────────────────────────── */
	.stage {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: flex;
		overflow: auto;
		scrollbar-width: none;
	}
	.stage::-webkit-scrollbar {
		width: 0;
		height: 0;
	}

	/* ── Mobile (≤600px): the controls are small, but keep their blur capped at a
	   cheap radius and lean on a more opaque base so they stay legible. ── */
	@media (max-width: 600px) {
		.ctrl {
			background: rgba(10, 7, 24, 0.72);
			backdrop-filter: blur(8px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.aurora {
			animation: none;
		}
		/* Drop the backdrop-filter; the opaque base keeps the icon readable. */
		.ctrl {
			backdrop-filter: none;
			background: rgba(10, 7, 24, 0.85);
		}
	}
</style>
