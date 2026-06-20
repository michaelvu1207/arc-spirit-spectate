/**
 * Shared menu-music controller.
 *
 * A single detached <audio> element kept at module scope so the Arcane Abyss
 * theme plays *continuously* across the /play landing and the room lobby — it
 * survives client-side navigations (the module isn't re-evaluated on goto()).
 * Browser autoplay rules require the first play() to follow a user gesture, so
 * armMenuAudio() tries immediately and otherwise starts on the first click/keypress
 * (no visible "press start" gate). stopMenu() silences it when gameplay begins.
 */

import { prefersReducedData } from '$lib/play/dataSaver';
import { persistedState } from '$lib/persistedState.svelte';

let audio: HTMLAudioElement | null = null;
let entered = $state(false);

// Music on/off is SHARED with the site soundtrack (MusicPlayer) under one key, so a
// single preference governs ALL music — no more "the site has music but the game
// doesn't". 'off' == muted. Reading/writing the same `asp:music` key keeps the menu
// theme, the in-game scenes and the site soundtrack in lockstep.
const musicPref = persistedState<'on' | 'off'>('asp:music', 'on');
const isMuted = () => musicPref.value === 'off';

// Intent: should the menu theme be playing right now? armMenuAudio() sets this true;
// stopMenu() sets it false when gameplay begins. A single persistent gesture listener
// (bound once, below) resumes the theme on the user's NEXT interaction whenever the
// intent is "play" but the element is paused — which covers both the initial
// autoplay block and resuming after a game paused it. This is self-healing: it no
// longer depends on a gesture being live at the exact moment a MenuShell mounts.
let wantPlaying = false;
let gestureBound = false;

function ensure(src: string): HTMLAudioElement | null {
	if (typeof window === 'undefined') return null;
	if (!audio) {
		audio = new Audio(src);
		audio.loop = true;
		audio.volume = 0.32;
		// Never eagerly fetch the audio file — only stream once play() is called.
		audio.preload = 'none';
	}
	audio.muted = isMuted(); // keep in sync with the shared preference
	return audio;
}

/** Resume the theme iff it should be playing and is currently paused. Idempotent. */
function resume() {
	const a = audio;
	if (!a || !wantPlaying || !a.paused) return;
	a.muted = isMuted();
	a.play()
		.then(() => {
			entered = true;
		})
		.catch(() => {
			/* still blocked (no user gesture yet) — the next gesture retries */
		});
}

/** Attach ONE persistent gesture listener that keeps (re)starting the theme. */
function bindGestureOnce() {
	if (gestureBound || typeof window === 'undefined') return;
	gestureBound = true;
	const onGesture = () => resume();
	window.addEventListener('pointerdown', onGesture);
	window.addEventListener('keydown', onGesture);
	window.addEventListener('touchstart', onGesture, { passive: true });
}

/** Start (or resume) the theme: now if allowed, otherwise on the next user gesture. */
export function armMenuAudio(src: string) {
	if (!ensure(src)) return;
	wantPlaying = true;
	bindGestureOnce();
	// Try immediately — succeeds when media-engagement is high, or when the click
	// that navigated here still grants transient activation. Skipped on metered
	// connections so nothing streams without intent (the gesture listener still works).
	if (!prefersReducedData()) resume();
}

/** Toggle music on/off (shared with the site soundtrack, persisted to localStorage). */
export function toggleMenuMute() {
	musicPref.value = isMuted() ? 'on' : 'off';
	if (audio) audio.muted = isMuted();
}

/** Stop the menu theme — call when leaving the menus for gameplay. */
export function stopMenu() {
	wantPlaying = false; // clear intent so the gesture listener won't resume it mid-game
	audio?.pause();
}

// ── Menu SFX (hover / click / start) ─────────────────────────────────────────
// Lightweight one-shots for the home menu. They obey the same mute toggle as the
// menu music, and are cloned per play so rapid hovers can overlap cleanly.
const sfxCache = new Map<string, HTMLAudioElement>();

/** Warm the cache so the first hover/click doesn't hitch. */
export function primeMenuSfx(names: string[]) {
	if (typeof window === 'undefined') return;
	for (const name of names) {
		if (sfxCache.has(name)) continue;
		const a = new Audio(`/sfx/${name}.mp3`);
		a.preload = 'none';
		sfxCache.set(name, a);
	}
}

/** Fire a menu one-shot (silent while the menu is muted). */
export function playMenuSfx(name: string, opts: { volume?: number } = {}) {
	if (typeof window === 'undefined' || isMuted()) return;
	let base = sfxCache.get(name);
	if (!base) {
		base = new Audio(`/sfx/${name}.mp3`);
		base.preload = 'none';
		sfxCache.set(name, base);
	}
	const node = base.cloneNode() as HTMLAudioElement;
	node.volume = Math.max(0, Math.min(1, opts.volume ?? 0.7));
	void node.play().catch(() => {});
}

/** Reactive view of the menu-audio state. */
export function getMenuAudio() {
	return {
		get entered() {
			return entered;
		},
		get muted() {
			return isMuted();
		}
	};
}
