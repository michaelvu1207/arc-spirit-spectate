import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoomMemberCookie } from '$lib/play/server/cookies';
import { runRoomCommand } from '$lib/play/server/service';

export const POST: RequestHandler = async ({ request, params, cookies }) => {
	const roomCode = String(params.roomCode ?? '');
	const memberId = getRoomMemberCookie(cookies, roomCode);
	if (!memberId) {
		throw error(401, 'Join this room before starting the game.');
	}

	const body = await request.json().catch(() => ({}));
	const expectedRevision =
		typeof body?.expectedRevision === 'number' ? body.expectedRevision : null;

	return json(
		await runRoomCommand({
			roomCode,
			memberId,
			expectedRevision,
			command: { type: 'startGame' }
		})
	);
};
