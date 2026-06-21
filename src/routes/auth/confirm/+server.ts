import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

/**
 * Email link verification (signup confirmation, magic link, email change, recovery).
 * Supabase sends `?token_hash=&type=`; we verify it into a session and redirect.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;
	const next = url.searchParams.get('next') ?? '/account';
	const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/account';

	if (token_hash && type) {
		const { error } = await supabase.auth.verifyOtp({ token_hash, type });
		if (!error) throw redirect(303, safeNext);
	}

	throw redirect(303, '/account?error=confirm_failed');
};
