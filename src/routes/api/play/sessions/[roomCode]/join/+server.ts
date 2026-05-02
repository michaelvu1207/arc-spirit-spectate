import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinRoom, loadRoomView } from '$lib/play/server/service';
import { setRoomMemberCookie } from '$lib/play/server/cookies';

export const POST: RequestHandler = async ({ request, params, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const displayName = typeof body?.displayName === 'string' ? body.displayName : '';
	const roomCode = String(params.roomCode ?? '');

	const joined = await joinRoom(roomCode, displayName);
	setRoomMemberCookie(cookies, roomCode, joined.memberId);

	return json(await loadRoomView(roomCode, joined.memberId));
};
