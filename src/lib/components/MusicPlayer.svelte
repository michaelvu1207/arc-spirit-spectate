<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { persistedState } from '$lib/persistedState.svelte';
	import { prefersReducedData } from '$lib/play/dataSaver';

	/** Looping soundtrack served from static/. */
	const TRACK_SRC = '/music/soundtrack.mp3';

	/**
	 * Fixed reference epoch shared by every client. Playback position is derived
	 * purely from wall-clock time:
	 *
	 *     offset = (Date.now() - MUSIC_EPOCH_MS) / 1000 mod duration
	 *
	 * Because the track loops forever and the epoch is a constant, every client
	 * computes the same offset — so the soundtrack is effectively synced across
	 * all clients, and a refresh resumes exactly where the track "would be". No
	 * server or shared socket is required.
	 */
	const MUSIC_EPOCH_MS = Date.UTC(2025, 0, 1, 0, 0, 0);

	/** Re-seek only when we've drifted more than this many seconds (avoids stutter). */
	const DRIFT_TOLERANCE_S = 1.5;

	// Per-browser preference only — it silences this listener, never the timeline.
	// On metered/slow connections default to 'off' so nothing streams until the user
	// explicitly opts in. If the user has already saved a preference, that wins.
	const prefDefault: 'on' | 'off' = prefersReducedData() ? 'off' : 'on';
	const pref = persistedState<'on' | 'off'>('asp:music', prefDefault);

	let audio = $state<HTMLAudioElement | null>(null);
	let started = $state(false);

	// Audio (and its control) make no sense on the print/export view.
	// On the play/game routes the immersive menu + in-game audio own the
	// soundtrack, so the site track steps aside (resumes elsewhere).
	const showControl = $derived(
		!$page.url.pathname.endsWith('/export') && !$page.url.pathname.startsWith('/play')
	);

	function syncedOffset(duration: number): number {
		if (!Number.isFinite(duration) || duration <= 0) return 0;
		const elapsed = (Date.now() - MUSIC_EPOCH_MS) / 1000;
		const off = elapsed % duration;
		return off < 0 ? off + duration : off;
	}

	function seekToSynced() {
		if (!audio) return;
		const off = syncedOffset(audio.duration);
		if (Math.abs(audio.currentTime - off) > DRIFT_TOLERANCE_S) audio.currentTime = off;
	}

	async function attemptStart() {
		if (!audio) return;
		// With preload="none" the browser hasn't fetched metadata yet, so
		// currentTime is not seekable before play() is called. We seek after
		// loadedmetadata fires (which happens during the play() fetch). If metadata
		// is already available (readyState >= 1) we can seek immediately.
		if (audio.readyState >= 1 /* HAVE_METADATA */) {
			seekToSynced();
		} else {
			audio.addEventListener('loadedmetadata', seekToSynced, { once: true });
		}
		try {
			await audio.play();
			started = true;
		} catch {
			// Browser blocked autoplay — wait for a user gesture (toggle click or
			// the first interaction anywhere on the page) to start.
			audio.removeEventListener('loadedmetadata', seekToSynced);
			started = false;
		}
	}

	function onLoadedMetadata() {
		// With preload="none" this event only fires once play() triggers the fetch.
		// We still call it here for the case where the browser pre-loaded despite
		// preload="none" (e.g. cached from a previous visit and already HAVE_METADATA).
		if (pref.value === 'on') attemptStart();
	}

	function toggle() {
		if (started) {
			pref.value = 'off';
			audio?.pause();
			started = false;
		} else {
			// The click itself is a user gesture, so play() will be permitted.
			pref.value = 'on';
			attemptStart();
		}
	}

	onMount(() => {
		// With preload="none" readyState will be 0 on first load (nothing fetched yet),
		// so this branch only fires if the browser has already cached and parsed the
		// track (e.g. from a previous visit). In that case we can start immediately
		// on the first user gesture or if the browser permits autoplay.
		if (pref.value === 'on' && audio && audio.readyState >= 1 /* HAVE_METADATA */) {
			attemptStart();
		}

		// The first interaction anywhere unblocks autoplay if the browser deferred it.
		function onFirstGesture() {
			if (pref.value === 'on' && !started) attemptStart();
		}
		window.addEventListener('pointerdown', onFirstGesture);
		window.addEventListener('keydown', onFirstGesture);

		// A throttled background tab can drift; realign to the shared clock on return.
		function onVisible() {
			if (document.visibilityState === 'visible' && started && pref.value === 'on') seekToSynced();
		}
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			window.removeEventListener('pointerdown', onFirstGesture);
			window.removeEventListener('keydown', onFirstGesture);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

{#if showControl}
	<audio
		bind:this={audio}
		src={TRACK_SRC}
		loop
		preload="none"
		onloadedmetadata={onLoadedMetadata}
	></audio>

	<button
		type="button"
		class="music-toggle screen-only"
		class:is-playing={started}
		onclick={toggle}
		aria-pressed={started}
		aria-label={started ? 'Mute soundtrack' : 'Play soundtrack'}
		title={started ? 'Mute soundtrack' : 'Play soundtrack'}
	>
		{#if started}
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M4 9v6h4l5 4V5L8 9H4z"
					fill="currentColor"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
				<path
					d="M16 9a4 4 0 0 1 0 6"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
				/>
				<path
					d="M18.5 6.5a8 8 0 0 1 0 11"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M4 9v6h4l5 4V5L8 9H4z"
					fill="currentColor"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
				<path
					d="M16 9l5 6M21 9l-5 6"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
				/>
			</svg>
		{/if}
	</button>
{/if}

<style>
	.music-toggle {
		position: fixed;
		left: 18px;
		bottom: 18px;
		z-index: 60;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		border: 1px solid var(--color-mist, rgba(255, 255, 255, 0.16));
		background: var(--color-shadow, rgba(10, 6, 20, 0.82));
		color: var(--color-fog, #b9b3c9);
		cursor: pointer;
		backdrop-filter: blur(6px);
		transition:
			color 180ms ease,
			border-color 180ms ease,
			transform 180ms ease,
			box-shadow 180ms ease;
	}

	.music-toggle svg {
		width: 20px;
		height: 20px;
	}

	.music-toggle:hover {
		color: var(--color-bone, #f5f0ff);
		transform: translateY(-1px);
	}

	.music-toggle:focus-visible {
		outline: 2px solid var(--brand-magenta, #ff2bc7);
		outline-offset: 2px;
	}

	.music-toggle.is-playing {
		color: var(--brand-magenta, #ff2bc7);
		border-color: var(--brand-magenta, #ff2bc7);
		box-shadow: 0 0 14px -2px var(--brand-magenta, #ff2bc7);
	}

	@media print {
		.music-toggle {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.music-toggle {
			transition: none;
		}
	}
</style>
