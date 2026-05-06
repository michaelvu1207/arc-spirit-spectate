import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Default landing on /admin/composition-analysis -> Library tab.
export const load: PageServerLoad = async () => {
	throw redirect(307, '/admin/composition-analysis/library');
};
