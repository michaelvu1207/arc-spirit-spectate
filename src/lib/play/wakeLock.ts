import { browser } from '$app/environment';

/**
 * Screen Wake Lock helper — keeps mobile screens awake during active play so a
 * player isn't dropped mid-turn by the device sleeping. The OS releases the lock
 * whenever the tab is hidden, so we re-acquire on return to foreground.
 *
 * Safe no-op where the API is unavailable (older iOS, denied permission).
 */

interface WakeLockSentinelLike {
	release(): Promise<void>;
	addEventListener(type: 'release', cb: () => void): void;
}

interface WakeLockLike {
	request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;
let bound = false;

function wakeLockApi(): WakeLockLike | null {
	if (!browser) return null;
	return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock ?? null;
}

async function acquire(): Promise<void> {
	if (!wanted || sentinel) return;
	const wl = wakeLockApi();
	if (!wl) return;
	try {
		sentinel = await wl.request('screen');
		sentinel.addEventListener('release', () => {
			sentinel = null;
		});
	} catch {
		// Denied (low battery / permissions) — non-fatal.
	}
}

function bindVisibility(): void {
	if (!browser || bound) return;
	bound = true;
	document.addEventListener('visibilitychange', () => {
		if (wanted && document.visibilityState === 'visible' && !sentinel) {
			void acquire();
		}
	});
}

/** Request (and keep) a screen wake lock until {@link releaseWakeLock} is called. */
export function requestWakeLock(): void {
	wanted = true;
	bindVisibility();
	void acquire();
}

/** Release the wake lock and stop re-acquiring it. */
export async function releaseWakeLock(): Promise<void> {
	wanted = false;
	if (sentinel) {
		try {
			await sentinel.release();
		} catch {
			// Already released by the platform.
		}
		sentinel = null;
	}
}
