import type { LayoutServerLoad } from './$types';
import { isAdminRequest } from '$lib/server/adminSession';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession, supabase }, cookies, depends }) => {
	// Re-run this server load (re-fetching session + profile) on every
	// invalidate('supabase:auth') — i.e. instantly after sign-in/out / name change,
	// without a full page reload.
	depends('supabase:auth');
	const { session, user } = await safeGetSession();

	// Fetch the profile alongside the session so it arrives as load DATA — set
	// synchronously into the auth store (reactive), never via a detached async write.
	let profile = null;
	if (user) {
		const { data } = await supabase
			.from('profiles')
			.select('id, display_name, is_anonymous')
			.eq('id', user.id)
			.maybeSingle();
		profile = data ?? null;
	}

	let isAdmin = false;
	try {
		isAdmin = isAdminRequest(cookies);
	} catch {
		isAdmin = false;
	}

	return {
		session,
		user,
		profile,
		isAdmin,
		// Forwarded so the isomorphic client in +layout.ts can hydrate the SSR session.
		cookies: cookies.getAll()
	};
};
