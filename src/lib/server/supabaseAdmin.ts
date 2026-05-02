import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

const DEFAULT_SCHEMA = 'arc-spirits-game-history';

const cached = new Map<string, SupabaseClient<any, any, any>>();

export function getSupabaseAdmin(schema = DEFAULT_SCHEMA): SupabaseClient<any, any, any> | null {
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) return null;
	const existing = cached.get(schema);
	if (existing) return existing;
	const client = createClient(PUBLIC_SUPABASE_URL, serviceRoleKey, {
		db: { schema },
		auth: { persistSession: false }
	});
	cached.set(schema, client);
	return client;
}
