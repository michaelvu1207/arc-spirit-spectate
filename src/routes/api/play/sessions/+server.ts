import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRoom, listOpenRooms, loadRoomView } from '$lib/play/server/service';
import { setRoomMemberCookie } from '$lib/play/server/cookies';
import { enforceRateLimit } from '$lib/server/rateLimit';

// Public server browser: list every joinable lobby + spectatable live game.
export const GET: RequestHandler = async () => {
	return json({ rooms: await listOpenRooms() });
};

export const POST: RequestHandler = async (event) => {
	const { request, cookies, locals } = event;
	// Room creation is unauthenticated — cap it per IP to stop lobby-spam.
	enforceRateLimit(event, 'room-create', 8, 60_000);
	const body = await request.json().catch(() => ({}));
	const displayName = typeof body?.displayName === 'string' ? body.displayName : '';

	// Attribute the room to the signed-in account (if any) so their games are owned by
	// their identity, not a spoofable display name. Guests pass null.
	const { user } = await locals.safeGetSession();
	const created = await createRoom(displayName, user?.id ?? null);
	setRoomMemberCookie(cookies, created.roomCode, created.memberId);

	return json(await loadRoomView(created.roomCode, created.memberId));
};
