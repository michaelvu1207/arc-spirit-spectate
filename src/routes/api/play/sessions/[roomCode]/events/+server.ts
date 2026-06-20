import type { RequestHandler } from './$types';
import { getRoomMemberCookie } from '$lib/play/server/cookies';
import { loadRoomView } from '$lib/play/server/service';
import { createSseSession } from '$lib/play/server/sse';

// Bound the serverless function lifetime for the long-lived stream. The client
// reconnects transparently, so this just sets how often the stream is renewed.
// NOTE: the value must be permitted by the Vercel plan (Hobby caps lower).
export const config = { maxDuration: 30 };

export const GET: RequestHandler = async ({ params, cookies, request, url }) => {
	const roomCode = String(params.roomCode ?? '');
	// Cookie authenticates the web client; the cookieless Capacitor shell passes
	// the member id as a query param (EventSource cannot set request headers).
	const memberId = getRoomMemberCookie(cookies, roomCode) ?? url.searchParams.get('member');
	const initial = await loadRoomView(roomCode, memberId);
	let disposeStream: (() => void) | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let revision = initial.projection.revision;
			let interval: ReturnType<typeof setInterval> | null = null;
			const abort = () => {
				disposeStream?.();
			};

			const cleanup = () => {
				if (interval) {
					clearInterval(interval);
					interval = null;
				}
				request.signal.removeEventListener('abort', abort);
			};

			const sse = createSseSession(controller, cleanup);
			disposeStream = () => {
				sse.close();
			};

			sse.sendSnapshot(initial);

			let ticks = 0;
			interval = setInterval(async () => {
				if (!sse.active) return;
				ticks += 1;
				try {
					const next = await loadRoomView(roomCode, memberId);
					if (next.projection.revision !== revision) {
						revision = next.projection.revision;
						sse.sendSnapshot(next);
					} else if (ticks % 15 === 0) {
						// Idle for 15s — emit a heartbeat to keep proxies open and
						// reset the client watchdog.
						sse.ping();
					}
				} catch (err) {
					sse.sendSnapshot({
						error: true,
						message: err instanceof Error ? err.message : 'Failed to refresh room stream.'
					});
				}
			}, 1000);

			request.signal.addEventListener('abort', abort, { once: true });
		},
		cancel() {
			disposeStream?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
