import { browser } from '$app/environment';

interface NetworkInformationLike {
	saveData?: boolean;
	effectiveType?: string;
}

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g']);

/**
 * True when the device is on a metered/slow connection or has Data Saver on.
 * Used to default heavy media (the music stream, Gaussian-splat worlds) OFF on
 * mobile data so a match doesn't silently burn a cellular cap.
 *
 * Conservative: returns false where the Network Information API is unavailable
 * (Safari/Firefox), so we never degrade the experience without evidence.
 */
export function prefersReducedData(): boolean {
	if (!browser) return false;
	const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
	if (!conn) return false;
	return Boolean(conn.saveData) || SLOW_EFFECTIVE_TYPES.has(conn.effectiveType ?? '');
}
