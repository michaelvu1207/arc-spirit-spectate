import type { RequestHandler } from './$types';
import { getRoomMemberCookie } from '$lib/play/server/cookies';
import { loadRoomView } from '$lib/play/server/service';
import { createSseSession } from '$lib/play/server/sse';

export const GET: RequestHandler = async ({ params, cookies, request }) => {
	const roomCode = String(params.roomCode ?? '');
	const memberId = getRoomMemberCookie(cookies, roomCode);
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

			interval = setInterval(async () => {
				if (!sse.active) return;
				try {
					const next = await loadRoomView(roomCode, memberId);
					if (next.projection.revision !== revision) {
						revision = next.projection.revision;
						sse.sendSnapshot(next);
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
