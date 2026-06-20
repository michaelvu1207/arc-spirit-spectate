import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoomMemberCookie } from '$lib/play/server/cookies';
import { loadRoomView } from '$lib/play/server/service';
import { tickBots } from '$lib/play/server/botSim';

export const POST: RequestHandler = async ({ params, cookies }) => {
	const roomCode = String(params.roomCode ?? '');
	const memberId = getRoomMemberCookie(cookies, roomCode);
	if (!memberId) {
		throw error(401, 'Join this room before ticking bots.');
	}

	// Host-only: resolve the caller's role authoritatively before driving bots.
	const view = await loadRoomView(roomCode, memberId);
	if (view.member.role !== 'host') {
		throw error(403, 'Only the host can drive the bots.');
	}

	const { view: nextView, commandsIssued } = await tickBots(roomCode, memberId);
	return json({ ...nextView, commandsIssued });
};
