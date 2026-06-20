/**
 * In-game audio engine.
 *
 * Two layers:
 *  • Music  — a crossfading background track keyed to the current scene
 *    (phase / location / sub-view). Driven by setMusic(url).
 *  • SFX    — short one-shots fired at animations/actions via playSfx(name),
 *    loaded from /static/sfx/<name>.mp3, cloned so they can overlap.
 *
 * Volumes (master · music · sfx) and mute are persisted to localStorage. Audio
 * is created lazily in the browser; the first play() rides on the user gesture
 * that starts/enters the game (Start Game / a click), satisfying autoplay rules.
 */

import { prefersReducedData } from '$lib/play/dataSaver';

let masterVol = $state(0.8);
let musicVol = $state(0.5);
let sfxVol = $state(0.7);
// Default to muted on metered/slow connections so nothing streams until the
// user explicitly enables audio. The persisted value from localStorage wins
// once restore() runs (it overwrites this default).
let muted = $state(prefersReducedData());

let restored = false;
function restore() {
	if (restored || typeof window === 'undefined') return;
	restored = true;
	try {
		const raw = localStorage.getItem('arc-audio');
		if (raw) {
			const v = JSON.parse(raw);
			if (typeof v.master === 'number') masterVol = v.master;
			if (typeof v.music === 'number') musicVol = v.music;
			if (typeof v.sfx === 'number') sfxVol = v.sfx;
			if (typeof v.muted === 'boolean') muted = v.muted;
		}
	} catch {
		/* ignore */
	}
}
function persist() {
	try {
		localStorage.setItem(
			'arc-audio',
			JSON.stringify({ master: masterVol, music: musicVol, sfx: sfxVol, muted })
		);
	} catch {
		/* ignore */
	}
}

const musicTarget = () => (muted ? 0 : masterVol * musicVol);

// ── Music (crossfading A/B elements) ───────────────────────────────────────
let elA: HTMLAudioElement | null = null;
let elB: HTMLAudioElement | null = null;
let activeIsA = true;
let currentUrl: string | null = null;
const fadeTimers = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>();

// Tracks that should pick up where they left off when they return (instead of
// restarting at 0). The navigation theme is one long arc that unfolds across the
// whole match — every navigation phase continues it rather than resetting.
const RESUME_TRACKS = new Set<string>(['/music/scenes/navigation.mp3']);
const resumeAt = new Map<string, number>();

function ensureMusic() {
	if (typeof window === 'undefined' || elA) return;
	restore();
	elA = new Audio();
	elB = new Audio();
	for (const el of [elA, elB]) {
		el.loop = true;
		el.preload = 'none';
		el.volume = 0;
	}
}

function fadeTo(el: HTMLAudioElement, target: number, ms: number, onDone?: () => void) {
	const existing = fadeTimers.get(el);
	if (existing) clearInterval(existing);
	const start = el.volume;
	const steps = Math.max(1, Math.round(ms / 40));
	let i = 0;
	const id = setInterval(() => {
		i += 1;
		el.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
		if (i >= steps) {
			clearInterval(id);
			fadeTimers.delete(el);
			onDone?.();
		}
	}, 40);
	fadeTimers.set(el, id);
}

/** Crossfade the music layer to `url` (or fade to silence when null). */
export function setMusic(url: string | null, fadeMs = 700) {
	if (typeof window === 'undefined') return;
	if (url === currentUrl) return;
	ensureMusic();

	// Remember the outgoing track's position so resume-tracks can continue later.
	if (currentUrl) {
		const out = activeIsA ? elA : elB;
		if (out) resumeAt.set(currentUrl, out.currentTime);
	}

	currentUrl = url;
	const incoming = activeIsA ? elB! : elA!;
	const outgoing = activeIsA ? elA! : elB!;

	if (!url) {
		fadeTo(outgoing, 0, fadeMs, () => outgoing.pause());
		return;
	}
	incoming.src = url;
	// Resume-tracks continue where they left off; everything else starts fresh.
	const resume = url && RESUME_TRACKS.has(url) ? (resumeAt.get(url) ?? 0) : 0;
	const applySeek = () => {
		try {
			incoming.currentTime = resume;
		} catch {
			/* not seekable until metadata loads — the listener below retries */
		}
	};
	applySeek();
	incoming.addEventListener('loadedmetadata', applySeek, { once: true });
	incoming.volume = 0;
	void incoming.play().catch(() => {});
	fadeTo(incoming, musicTarget(), fadeMs);
	fadeTo(outgoing, 0, fadeMs, () => outgoing.pause());
	activeIsA = !activeIsA;
}

/** Stop the music layer entirely. */
export function stopMusic(fadeMs = 500) {
	setMusic(null, fadeMs);
}

// ── SFX ─────────────────────────────────────────────────────────────────────
const sfxBuffers = new Map<string, HTMLAudioElement>();

/** Warm the cache so first plays don't hitch. */
export function primeSfx(names: string[]) {
	if (typeof window === 'undefined') return;
	for (const name of names) {
		if (sfxBuffers.has(name)) continue;
		const a = new Audio(`/sfx/${name}.mp3`);
		a.preload = 'none';
		sfxBuffers.set(name, a);
	}
}

/** Fire a one-shot effect. Safe to call rapidly — each play is an independent node. */
export function playSfx(name: string, opts: { volume?: number } = {}) {
	if (typeof window === 'undefined' || muted) return;
	restore();
	let base = sfxBuffers.get(name);
	if (!base) {
		base = new Audio(`/sfx/${name}.mp3`);
		base.preload = 'none';
		sfxBuffers.set(name, base);
	}
	const node = base.cloneNode() as HTMLAudioElement;
	node.volume = Math.max(0, Math.min(1, masterVol * sfxVol * (opts.volume ?? 1)));
	void node.play().catch(() => {});
}

// ── Volume / mute controls ───────────────────────────────────────────────────
function applyMusicVolume() {
	const active = activeIsA ? elA : elB;
	if (active && !active.paused) active.volume = musicTarget();
}

export function setMasterVolume(v: number) {
	masterVol = Math.max(0, Math.min(1, v));
	applyMusicVolume();
	persist();
}
export function setMusicVolume(v: number) {
	musicVol = Math.max(0, Math.min(1, v));
	applyMusicVolume();
	persist();
}
export function setSfxVolume(v: number) {
	sfxVol = Math.max(0, Math.min(1, v));
	persist();
}
export function toggleAudioMuted() {
	muted = !muted;
	applyMusicVolume();
	if (muted) {
		// hard-silence both music elements immediately
		for (const el of [elA, elB]) if (el) el.volume = 0;
	}
	persist();
}

/** Reactive view of the audio settings (for a settings UI). */
export function getGameAudio() {
	restore();
	return {
		get master() {
			return masterVol;
		},
		get music() {
			return musicVol;
		},
		get sfx() {
			return sfxVol;
		},
		get muted() {
			return muted;
		}
	};
}
