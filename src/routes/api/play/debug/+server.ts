import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { createDebugRoom, loadRoomView } from '$lib/play/server/service';
import { setRoomMemberCookie } from '$lib/play/server/cookies';

// Dev-only: spawn a solo game parked in the Awakening phase with a face-down
// spirit of the requested class + everything needed to awaken it. Never exposed
// in production builds.
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!dev) {
		return new Response('Not found', { status: 404 });
	}

	const body = await request.json().catch(() => ({}));
	const displayName = typeof body?.displayName === 'string' ? body.displayName : '';
	const className = typeof body?.className === 'string' ? body.className : '';
	const spiritId = typeof body?.spiritId === 'string' ? body.spiritId : undefined;
	if (!className && !spiritId) {
		return json({ message: 'A class name or spirit id is required.' }, { status: 400 });
	}

	const created = await createDebugRoom(displayName, className, spiritId);
	setRoomMemberCookie(cookies, created.roomCode, created.memberId);

	return json(await loadRoomView(created.roomCode, created.memberId));
};
