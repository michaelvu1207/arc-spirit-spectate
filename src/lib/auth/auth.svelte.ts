import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

export interface Profile {
	id: string;
	display_name: string;
	is_anonymous: boolean;
}

export type OAuthProvider = 'google' | 'apple' | 'discord';

/** Shared with the server browser's "Playing as" field + Quick Play, so a signed-in
 *  player's account name is the identity they play under. */
const PLAYER_NAME_KEY = 'arc-player-name';

/**
 * Singleton auth store. Class `$state` fields mutated through methods is the Svelte 5
 * idiom for shared cross-module reactive state — no ownership warnings, and it stays
 * reactive even when updated from the layout effect. Every UI-visible mutation flows
 * through `sync()` (driven by the layout `load`), so it's synchronous + reactive; the
 * profile arrives as load DATA, never via a detached async write.
 */
class AuthStore {
	session = $state<Session | null>(null);
	user = $state<User | null>(null);
	profile = $state<Profile | null>(null);

	#client: SupabaseClient | null = null;

	get isSignedIn() {
		return !!this.user;
	}
	get isAnonymous() {
		return !!this.user?.is_anonymous;
	}
	/** Signed in AND has claimed a real identity (email/oauth). */
	get isPermanent() {
		return !!this.user && !this.user.is_anonymous;
	}
	get displayName() {
		return this.profile?.display_name ?? null;
	}
	get email() {
		return this.user?.email ?? null;
	}

	/** Driven reactively from the root layout with the freshest SSR→CSR auth state. */
	sync(client: SupabaseClient, session: Session | null, user: User | null, profile: Profile | null) {
		this.#client = client;
		this.session = session;
		this.user = user;
		const nextProfile = user ? profile : null;
		this.profile = nextProfile;
		// Read the PARAM, never `this.profile` — reading the reactive field here would
		// make the calling layout effect depend on it and loop (effect_update_depth).
		if (browser && nextProfile?.display_name) {
			localStorage.setItem(PLAYER_NAME_KEY, nextProfile.display_name);
		}
	}

	#c(): SupabaseClient {
		if (!this.#client) throw new Error('Auth is still initializing — try again in a moment.');
		return this.#client;
	}

	/** Email + password sign-up. `session` is null when the project requires email
	 *  confirmation (the UI then shows a "check your inbox" state). */
	async signUpEmail(email: string, password: string, displayName: string) {
		const { data, error } = await this.#c().auth.signUp({
			email: email.trim(),
			password,
			options: { data: { display_name: displayName.trim() || 'Nameless Spirit' } }
		});
		if (error) throw error;
		if (data.session) await invalidate('supabase:auth');
		return data;
	}

	async signInEmail(email: string, password: string) {
		const { error } = await this.#c().auth.signInWithPassword({ email: email.trim(), password });
		if (error) throw error;
		await invalidate('supabase:auth');
	}

	async signInWithProvider(provider: OAuthProvider) {
		const redirectTo = browser
			? `${location.origin}/auth/callback?next=${encodeURIComponent(location.pathname)}`
			: undefined;
		const { error } = await this.#c().auth.signInWithOAuth({ provider, options: { redirectTo } });
		if (error) throw error;
	}

	/** Instant, frictionless identity. Requires the project's "Anonymous sign-ins"
	 *  toggle to be enabled; until then this throws `anonymous_provider_disabled`. */
	async signInAnon(displayName?: string) {
		const { error } = await this.#c().auth.signInAnonymously({
			options: displayName ? { data: { display_name: displayName.trim() } } : undefined
		});
		if (error) throw error;
		await invalidate('supabase:auth');
	}

	/**
	 * Anonymous-FIRST entry point for a play action. Resolves the durable identity the
	 * player will play (and be attributed) under, creating a guest account on the spot
	 * for a first-time visitor:
	 *  - no session yet  → sign in anonymously with the typed name (real uid + profile),
	 *  - permanent account → their account name is authoritative (typed name ignored),
	 *  - guest account → keep the guest profile name in sync with what they typed.
	 * If anonymous sign-ins are disabled server-side, falls back to the typed name so
	 * guest play still works (the member is just not account-owned).
	 */
	async resolvePlayIdentity(typedName: string): Promise<string> {
		const name = (typedName || '').trim().slice(0, 40) || 'Nameless Spirit';
		if (!this.user) {
			try {
				await this.signInAnon(name);
			} catch {
				// Anonymous provider disabled (or offline) — degrade to a cookie-only guest.
			}
			return name;
		}
		if (this.isPermanent) return this.profile?.display_name ?? name;
		if (this.profile && this.profile.display_name !== name) {
			await this.updateDisplayName(name).catch(() => {});
		}
		return name;
	}

	/** Upgrade an anonymous account to a permanent one by attaching email + password to
	 *  the SAME uid — all stats/history/identity carry over. */
	async linkEmailPassword(email: string, password: string) {
		const { error } = await this.#c().auth.updateUser({ email: email.trim(), password });
		if (error) throw error;
		await invalidate('supabase:auth');
	}

	async updateDisplayName(name: string) {
		if (!this.user) throw new Error('Sign in to set a display name.');
		const trimmed = name.trim().slice(0, 40) || 'Nameless Spirit';
		const { error } = await this.#c().from('profiles').update({ display_name: trimmed }).eq('id', this.user.id);
		if (error) throw error;
		await this.#c()
			.auth.updateUser({ data: { display_name: trimmed } })
			.catch(() => {});
		if (browser) localStorage.setItem(PLAYER_NAME_KEY, trimmed);
		await invalidate('supabase:auth');
	}

	async sendPasswordReset(email: string) {
		const redirectTo = browser ? `${location.origin}/auth/callback?next=/account` : undefined;
		const { error } = await this.#c().auth.resetPasswordForEmail(email.trim(), { redirectTo });
		if (error) throw error;
	}

	/** Step-up auth: re-verify the current password before a sensitive action, so a
	 *  borrowed/stolen live session can't silently change credentials or delete the
	 *  account. Throws if the password is wrong (or the account has no password). */
	async reauthenticate(currentPassword: string) {
		const email = this.user?.email;
		if (!email) throw new Error('Re-authentication requires an email + password account.');
		const { error } = await this.#c().auth.signInWithPassword({ email, password: currentPassword });
		if (error) throw new Error('Current password is incorrect.');
	}

	/** Change the password of a signed-in (permanent) account. */
	async changePassword(newPassword: string) {
		const { error } = await this.#c().auth.updateUser({ password: newPassword });
		if (error) throw error;
	}

	/** Change the account email. Sends a confirmation to the new address (and, with
	 *  "Secure email change" on, the old one too) — the change applies once confirmed. */
	async changeEmail(newEmail: string) {
		const { error } = await this.#c().auth.updateUser({ email: newEmail.trim() });
		if (error) throw error;
	}

	/** Revoke the session on ALL devices, not just this one. */
	async signOutEverywhere() {
		await this.#c().auth.signOut({ scope: 'global' });
		this.profile = null;
		await invalidate('supabase:auth');
	}

	/** Permanently delete the account + profile (server-side, service-role). Historical
	 *  game rows survive with user_id nulled. Signs out afterward. */
	async deleteAccount() {
		const res = await fetch('/api/account/delete', { method: 'POST' });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			throw new Error(body?.message ?? `Failed to delete account (status ${res.status})`);
		}
		await this.#c().auth.signOut().catch(() => {});
		this.profile = null;
		await invalidate('supabase:auth');
	}

	async signOut() {
		await this.#c().auth.signOut();
		this.profile = null;
		await invalidate('supabase:auth');
	}
}

export const auth = new AuthStore();
