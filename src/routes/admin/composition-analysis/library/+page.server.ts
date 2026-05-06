import type { PageServerLoad } from './$types';
import { listCompositions } from '$lib/server/compositionsService';

export const load: PageServerLoad = async () => {
	const compositions = await listCompositions();
	return { compositions };
};
