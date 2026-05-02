import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, loadRoomView } from '$lib/play/server/service';
import { setRoomMemberCookie } from '$lib/play/server/cookies';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const displayName = typeof body?.displayName === 'string' ? body.displayName : '';

	const created = await createRoom(displayName);
	setRoomMemberCookie(cookies, created.roomCode, created.memberId);

	return json(await loadRoomView(created.roomCode, created.memberId));
};
