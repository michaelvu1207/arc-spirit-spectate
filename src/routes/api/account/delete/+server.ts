import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabaseAdmin';
import { enforceRateLimit } from '$lib/server/rateLimit';

/**
 * Permanently delete the signed-in user's account. Server-side + service-role: the
 * session is re-validated here (you can only delete YOUR OWN account), then the auth
 * user is removed — which cascades to `public.profiles` and nulls `user_id` on any
 * historical play rows (so game history survives). This is also the app's first
 * server-side auth guard (`safeGetSession` enforced at the endpoint, not just the UI).
 */
export const POST: RequestHandler = async (event) => {
	enforceRateLimit(event, 'account-delete', 5, 60_000);
	const { user } = await event.locals.safeGetSession();
	if (!user) throw error(401, 'You must be signed in to delete your account.');

	// `auth.admin.deleteUser` hits the (schema-agnostic) GoTrue admin API, so the
	// default game-history admin client is fine here.
	const admin = getSupabaseAdmin();
	if (!admin) throw error(500, 'Server is missing the service role key.');

	const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
	if (deleteError) throw error(500, `Failed to delete account: ${deleteError.message}`);

	return json({ ok: true });
};
