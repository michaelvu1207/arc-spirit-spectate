import { env } from '$env/dynamic/public';

/**
 * Base origin for the play API.
 *
 * Empty on the web build (same-origin relative paths, authenticated by the
 * httpOnly session cookie). For the Capacitor native shell — which runs on
 * `capacitor://localhost` / `https://localhost` and therefore cannot use
 * relative URLs or a same-origin cookie — set `PUBLIC_API_BASE_URL` to the
 * deployed backend origin (e.g. `https://arc-spirits.vercel.app`). The client
 * then sends the member id explicitly (header / query param) instead.
 *
 * `$env/dynamic/public` is used (not `static`) so an unset var resolves to
 * `undefined` rather than breaking the build.
 */
export const API_BASE_URL: string = (env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

/** True when running against a cross-origin backend (the Capacitor shell). */
export const isCrossOrigin: boolean = API_BASE_URL.length > 0;

/** Prefix a relative API path with the configured base origin. */
export function apiUrl(path: string): string {
	return `${API_BASE_URL}${path}`;
}
