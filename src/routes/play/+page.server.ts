import type { PageServerLoad } from './$types';
import { getLastRoomCookie } from '$lib/play/server/cookies';

export const load: PageServerLoad = async ({ cookies }) => {
	return {
		lastRoomCode: getLastRoomCookie(cookies)
	};
};
