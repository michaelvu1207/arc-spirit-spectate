import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';

export const load: LayoutServerLoad = async ({ cookies }) => {
	let isAdmin = false;
	try {
		isAdmin = isAdminRequest(cookies);
	} catch {
		isAdmin = false;
	}

	if (!isAdmin) {
		throw redirect(303, '/');
	}

	return {};
};
