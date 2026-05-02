import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRoomMemberCookie } from '$lib/play/server/cookies';
import { loadRoomView } from '$lib/play/server/service';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const roomCode = String(params.roomCode ?? '').trim().toUpperCase();
	if (!roomCode) {
		throw error(400, 'Missing room code.');
	}

	return {
		initialView: await loadRoomView(roomCode, getRoomMemberCookie(cookies, roomCode))
	};
};
