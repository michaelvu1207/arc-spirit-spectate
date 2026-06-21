import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinRoom, loadRoomView } from '$lib/play/server/service';
import { setRoomMemberCookie } from '$lib/play/server/cookies';
import { enforceRateLimit } from '$lib/server/rateLimit';

export const POST: RequestHandler = async (event) => {
	const { request, params, cookies, locals } = event;
	// Unauthenticated join — cap per IP to stop room-enumeration / membership-spam.
	enforceRateLimit(event, 'room-join', 30, 60_000);
	const body = await request.json().catch(() => ({}));
	const displayName = typeof body?.displayName === 'string' ? body.displayName : '';
	const roomCode = String(params.roomCode ?? '');

	const { user } = await locals.safeGetSession();
	const joined = await joinRoom(roomCode, displayName, user?.id ?? null);
	setRoomMemberCookie(cookies, roomCode, joined.memberId);

	return json(await loadRoomView(roomCode, joined.memberId));
};
