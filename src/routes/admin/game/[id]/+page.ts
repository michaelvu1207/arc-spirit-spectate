import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, data }) => {
	return {
		...data,
		gameId: params.id
	};
};
