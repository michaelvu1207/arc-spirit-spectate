/**
 * Browser image cache warmer.
 *
 * Loads a set of image URLs ahead of time so that later `<img>` / SVG `<image>`
 * references resolve instantly from the HTTP cache. Used to gate the play board
 * behind a loading screen until every compressed game asset is cached.
 */

export interface PreloadProgress {
	loaded: number;
	total: number;
}

export interface PreloadOptions {
	/** Max images fetched concurrently. Keeps us from saturating the connection. */
	concurrency?: number;
	/** Per-image ceiling (ms); a stalled request resolves anyway so the batch never hangs. */
	timeoutMs?: number;
	/** Called after each image settles (success, error, or timeout). */
	onProgress?: (progress: PreloadProgress) => void;
	/** Abort the run early (e.g. on component unmount). */
	signal?: AbortSignal;
}

/**
 * Warm the browser cache with the given image URLs. Resolves once every URL has
 * settled — a single broken or slow asset never blocks the rest of the batch.
 * No-ops during SSR (returns immediately when there is no `window`).
 */
export async function preloadImages(
	urls: Iterable<string>,
	options: PreloadOptions = {}
): Promise<void> {
	const { concurrency = 8, timeoutMs = 15000, onProgress, signal } = options;

	if (typeof window === 'undefined') return;

	const queue = [...new Set(urls)].filter(Boolean);
	const total = queue.length;
	let loaded = 0;
	let cursor = 0;

	onProgress?.({ loaded, total });
	if (total === 0) return;

	const loadOne = (url: string) =>
		new Promise<void>((resolve) => {
			const img = new Image();
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				img.onload = null;
				img.onerror = null;
				loaded += 1;
				onProgress?.({ loaded, total });
				resolve();
			};
			const timer = setTimeout(finish, timeoutMs);
			img.onload = finish;
			img.onerror = finish;
			img.src = url;
		});

	async function worker() {
		while (cursor < queue.length) {
			if (signal?.aborted) return;
			const url = queue[cursor++];
			await loadOne(url);
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
	await Promise.all(workers);
}
