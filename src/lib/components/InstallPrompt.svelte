<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	/**
	 * The `beforeinstallprompt` event isn't part of lib.dom, so we type the
	 * minimal surface we use here and cast at the listener boundary.
	 */
	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: string }>;
	}

	const DISMISS_KEY = 'arc_spirits_install_dismissed';

	/** Stashed Android/Chromium install event, ready to fire on demand. */
	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	/** True when this is an iOS Safari session that can't auto-prompt. */
	let iosHint = $state(false);
	/** User dismissed the banner this session (or in a prior one via localStorage). */
	let dismissed = $state(false);

	/** Show the banner only when we have something actionable and it isn't dismissed. */
	let visible = $derived(!dismissed && (deferredPrompt !== null || iosHint));

	function isStandalone(): boolean {
		if (!browser) return false;
		const mqStandalone =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(display-mode: standalone)').matches;
		// iOS Safari exposes a non-standard navigator.standalone flag.
		const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
		return mqStandalone || iosStandalone;
	}

	function isIosSafari(): boolean {
		if (!browser) return false;
		const ua = navigator.userAgent;
		const isIos = /iphone|ipad|ipod/i.test(ua);
		// Exclude Chrome/Firefox on iOS — they can't "Add to Home Screen" the same way.
		const isOtherIosBrowser = /crios|fxios/i.test(ua);
		return isIos && !isOtherIosBrowser;
	}

	onMount(() => {
		// Already installed → render nothing, ever.
		if (isStandalone()) return;

		// Respect a prior dismissal so we don't nag on every visit.
		try {
			if (localStorage.getItem(DISMISS_KEY) === '1') {
				dismissed = true;
				return;
			}
		} catch {
			// localStorage can throw in private mode; ignore and continue.
		}

		// iOS Safari has no beforeinstallprompt — show the instructional hint.
		if (isIosSafari()) iosHint = true;

		const onBeforeInstallPrompt = (event: Event) => {
			// Prevent the mini-infobar and stash the event for our own button.
			event.preventDefault();
			deferredPrompt = event as BeforeInstallPromptEvent;
			// If Android can prompt, the iOS hint is irrelevant.
			iosHint = false;
		};

		const onInstalled = () => {
			deferredPrompt = null;
			iosHint = false;
			dismissed = true;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	async function install() {
		const event = deferredPrompt;
		if (!event) return;
		try {
			await event.prompt();
			await event.userChoice;
		} catch {
			// User aborted or the browser refused — nothing to recover.
		} finally {
			deferredPrompt = null;
		}
	}

	function dismiss() {
		dismissed = true;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// Ignore storage failures (private mode, etc.).
		}
	}
</script>

{#if visible}
	<div class="install-banner" role="region" aria-label="Install Arc Spirits">
		<div class="banner-inner">
			<span class="glyph" aria-hidden="true">◈</span>

			{#if deferredPrompt}
				<span class="label">Install Arc Spirits</span>
				<button type="button" class="install-btn" onclick={install}>Install app</button>
			{:else}
				<span class="label">
					Install: tap the Share
					<svg class="share-glyph" viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M6 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-1"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					icon then "Add to Home Screen".
				</span>
			{/if}

			<button type="button" class="close-btn" onclick={dismiss} aria-label="Dismiss install prompt">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M6 6l12 12M18 6L6 18"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	/* Top-center so it never collides with ConnectionStatus (fixed bottom-center). */
	.install-banner {
		position: fixed;
		top: 0;
		left: 50%;
		z-index: 60;
		transform: translateX(-50%);
		max-width: min(92vw, 560px);
		padding-top: env(safe-area-inset-top);
		padding-left: env(safe-area-inset-left);
		padding-right: env(safe-area-inset-right);
		animation: slide-down 0.3s ease-out;
	}

	@keyframes slide-down {
		from {
			opacity: 0;
			transform: translate(-50%, -20px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	.banner-inner {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 10px;
		padding: 10px 14px;
		border-radius: 4px;
		border: 1px solid var(--color-aether, #3a2670);
		background: rgba(5, 3, 16, 0.92);
		background: color-mix(in srgb, var(--color-void, #050310) 92%, transparent);
		box-shadow: 0 12px 30px -12px rgba(123, 29, 255, 0.6);
		backdrop-filter: blur(8px);
	}

	.glyph {
		flex-shrink: 0;
		font-size: 1rem;
		color: var(--brand-magenta, #ff2bc7);
		filter: drop-shadow(0 0 8px rgba(255, 43, 199, 0.7));
	}

	.label {
		flex: 1;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		line-height: 1.3;
		color: var(--color-parchment, #d8cfee);
	}

	.share-glyph {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--brand-cyan, #24d4ff);
		vertical-align: middle;
	}

	.install-btn {
		flex-shrink: 0;
		min-height: 44px;
		padding: 8px 18px;
		border: none;
		border-radius: 3px;
		background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff));
		color: #fff;
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		box-shadow: 0 10px 24px -12px rgba(255, 43, 199, 0.7);
		transition: transform 150ms ease;
	}
	@media (hover: hover) and (pointer: fine) {
		.install-btn:hover {
			transform: translateY(-1px);
		}
	}
	.install-btn:focus-visible {
		outline: 2px solid var(--brand-cyan, #24d4ff);
		outline-offset: 2px;
	}

	.close-btn {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--color-mist, #2e1d52);
		border-radius: 999px;
		background: transparent;
		color: var(--color-fog, #9a8fb8);
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition:
			border-color 160ms ease,
			color 160ms ease;
	}
	.close-btn svg {
		width: 18px;
		height: 18px;
	}
	@media (hover: hover) and (pointer: fine) {
		.close-btn:hover {
			border-color: var(--brand-magenta, #ff2bc7);
			color: var(--brand-magenta-soft, #ff5dd1);
		}
	}
	.close-btn:focus-visible {
		border-color: var(--brand-magenta, #ff2bc7);
		color: var(--brand-magenta-soft, #ff5dd1);
		outline: 2px solid var(--brand-magenta, #ff2bc7);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.install-banner {
			animation: none;
		}
		.banner-inner {
			backdrop-filter: none;
			background: rgba(5, 3, 16, 0.97);
		}
	}
</style>
