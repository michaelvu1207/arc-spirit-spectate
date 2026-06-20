import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, listOpenRooms, loadRoomView } from '$lib/play/server/service';
import { setRoomMemberCookie } from '$lib/play/server/cookies';

// Public server browser: list every joinable lobby + spectatable live game.
export const GET: RequestHandler = async () => {
	return json({ rooms: await listOpenRooms() });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const displayName = typeof body?.displayName === 'string' ? body.displayName : '';

	const created = await createRoom(displayName);
	setRoomMemberCookie(cookies, created.roomCode, created.memberId);

	return json(await loadRoomView(created.roomCode, created.memberId));
};
