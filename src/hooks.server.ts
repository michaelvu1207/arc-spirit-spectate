import type { Handle } from '@sveltejs/kit';

/**
 * CORS for the play API so the Capacitor native shell (which runs on a
 * cross-origin custom scheme and has no same-origin session cookie) can call
 * `/api/play/*` and open the SSE stream. The member id travels in the
 * `X-Play-Member` header / `?member=` query (see playStore + events route).
 *
 * Web requests are same-origin, so their Origin is never in this allow-list and
 * NO CORS headers are added — web behavior is unchanged.
 */
const ALLOWED_ORIGINS = new Set([
	'capacitor://localhost',
	'ionic://localhost',
	'http://localhost',
	'https://localhost'
]);

function corsHeaders(origin: string | null): Record<string, string> {
	if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Credentials': 'true',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-Play-Member',
		Vary: 'Origin'
	};
}

export const handle: Handle = async ({ event, resolve }) => {
	const isPlayApi = event.url.pathname.startsWith('/api/play/');
	const origin = event.request.headers.get('origin');

	// CORS preflight for cross-origin (Capacitor) API calls.
	if (isPlayApi && event.request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(origin) });
	}

	const response = await resolve(event);

	if (isPlayApi) {
		for (const [key, value] of Object.entries(corsHeaders(origin))) {
			response.headers.set(key, value);
		}
	}
	return response;
};
