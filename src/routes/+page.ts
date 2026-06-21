import { redirect } from '@sveltejs/kit';

// The public site is the 2D game. The old TTS games-list now lives behind the
// admin guard at /admin/records.
export const load = () => {
	throw redirect(307, '/play');
};
