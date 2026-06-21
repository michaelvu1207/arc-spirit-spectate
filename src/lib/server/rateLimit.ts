import { error, type RequestEvent } from '@sveltejs/kit';

/**
 * Lightweight in-memory sliding-window rate limiter. Scope is per serverless instance
 * (Vercel) — which catches the common single-client abuse burst (room-spam, credential
 * hammering, enumeration). For strict cross-instance guarantees, back this with a shared
 * store (Upstash/Supabase); this is the baseline protection that should always exist.
 */
const buckets = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number) {
	// Cheap periodic GC so the map can't grow unbounded under churn.
	if (now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, hits] of buckets) {
		const fresh = hits.filter((t) => now - t < 600_000);
		if (fresh.length === 0) buckets.delete(key);
		else buckets.set(key, fresh);
	}
}

/** Returns true if the action is allowed; false if the key is over its limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	sweep(now);
	const cutoff = now - windowMs;
	const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
	if (hits.length >= limit) {
		buckets.set(key, hits);
		return false;
	}
	hits.push(now);
	buckets.set(key, hits);
	return true;
}

/**
 * Enforce a per-client-IP rate limit on a request, throwing 429 when exceeded.
 * `name` namespaces the bucket so different actions don't share a budget.
 */
export function enforceRateLimit(
	event: RequestEvent,
	name: string,
	limit: number,
	windowMs: number
): void {
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// getClientAddress can throw if no adapter address is available; fail open on key.
	}
	if (!rateLimit(`${name}:${ip}`, limit, windowMs)) {
		throw error(429, 'Too many requests — please slow down and try again in a moment.');
	}
}
