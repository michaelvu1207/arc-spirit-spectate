import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { LayoutLoad } from './$types';

/**
 * Isomorphic Supabase auth client. On the browser it reads/writes the session
 * cookies directly (singleton-ish per load); during SSR it reuses the cookies the
 * server already parsed. `depends('supabase:auth')` lets `invalidate('supabase:auth')`
 * (fired on every auth state change) re-run this load so the session stays fresh.
 */
export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch }
			})
		: createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch },
				cookies: { getAll: () => data.cookies }
			});

	const {
		data: { session }
	} = await supabase.auth.getSession();

	const {
		data: { user }
	} = await supabase.auth.getUser();

	// Profile is fetched server-side in +layout.server.ts and re-runs on every
	// `invalidate('supabase:auth')`, so it stays in lockstep with the session.
	return { supabase, session, user, profile: data.profile, isAdmin: data.isAdmin };
};
