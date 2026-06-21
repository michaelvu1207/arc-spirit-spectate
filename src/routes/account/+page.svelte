<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { auth, type OAuthProvider } from '$lib/auth/auth.svelte';

	type Mode = 'signin' | 'signup';
	let mode = $state<Mode>('signin');

	let email = $state('');
	let password = $state('');
	let displayName = $state('');

	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	// Surface OAuth/confirm callback failures redirected here with ?error=.
	$effect(() => {
		const e = $page.url.searchParams.get('error');
		if (e === 'auth_callback_failed') error = 'Sign-in could not be completed. Please try again.';
		else if (e === 'confirm_failed') error = 'That confirmation link is invalid or expired.';
	});

	// Seed the display-name field from the current profile once signed in.
	$effect(() => {
		if (auth.isSignedIn && auth.displayName && !displayName) displayName = auth.displayName;
	});

	function fail(e: unknown) {
		error = e instanceof Error ? e.message : 'Something went wrong.';
	}

	async function submitCredentials(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = null;
		notice = null;
		busy = true;
		try {
			if (mode === 'signin') {
				await auth.signInEmail(email, password);
				await goto('/');
			} else {
				const result = await auth.signUpEmail(email, password, displayName || 'Nameless Spirit');
				if (result.session) {
					await goto('/');
				} else {
					notice = `Account created. Check ${email} for a confirmation link to finish.`;
				}
			}
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function claimAccount(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = null;
		notice = null;
		busy = true;
		try {
			await auth.linkEmailPassword(email, password);
			notice = 'Check your inbox to confirm your email — then your account is permanent.';
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function oauth(provider: OAuthProvider) {
		error = null;
		try {
			await auth.signInWithProvider(provider);
		} catch (e) {
			fail(e);
		}
	}

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = null;
		notice = null;
		busy = true;
		try {
			await auth.updateDisplayName(displayName);
			notice = 'Display name updated.';
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function resetPassword() {
		if (!email) {
			error = 'Enter your email above first.';
			return;
		}
		error = null;
		try {
			await auth.sendPasswordReset(email);
			// Enumeration-safe: don't confirm whether the address has an account.
			notice = `If an account exists for ${email}, a password reset link is on its way.`;
		} catch (e) {
			fail(e);
		}
	}

	async function doSignOut() {
		busy = true;
		try {
			await auth.signOut();
			email = '';
			password = '';
			displayName = '';
			notice = 'Signed out.';
		} finally {
			busy = false;
		}
	}

	// ── Manage (permanent accounts) ──────────────────────────────
	let newPassword = $state('');
	let newEmail = $state('');
	let currentPassword = $state('');

	async function changePassword(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = null;
		notice = null;
		busy = true;
		try {
			// Step-up: confirm the current password before changing it.
			await auth.reauthenticate(currentPassword);
			await auth.changePassword(newPassword);
			newPassword = '';
			currentPassword = '';
			notice = 'Password updated.';
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function changeEmail(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		error = null;
		notice = null;
		busy = true;
		try {
			await auth.changeEmail(newEmail);
			notice = `Confirmation sent. Check ${newEmail} (and your current inbox) to finish the change.`;
			newEmail = '';
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function signOutEverywhere() {
		busy = true;
		error = null;
		try {
			await auth.signOutEverywhere();
			notice = 'Signed out on all devices.';
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function deleteAccount() {
		if (!currentPassword) {
			error = 'Enter your current password to confirm account deletion.';
			return;
		}
		if (!confirm('Permanently delete your account? This cannot be undone. Your game history is kept but anonymized.')) return;
		busy = true;
		error = null;
		try {
			// Step-up: a borrowed live session can't delete without the password.
			await auth.reauthenticate(currentPassword);
			await auth.deleteAccount();
			await goto('/');
		} catch (e) {
			fail(e);
			busy = false;
		}
	}
</script>

<svelte:head><title>Account | Arc Spirits</title></svelte:head>

<main class="account">
	<header class="head">
		<a href="/" class="back">← Home</a>
		<h1>Account</h1>
	</header>

	{#if error}<p class="msg error" role="alert" data-testid="auth-error">{error}</p>{/if}
	{#if notice}<p class="msg notice" data-testid="auth-notice">{notice}</p>{/if}

	{#if auth.isSignedIn}
		<!-- ───────────── Signed in ───────────── -->
		<section class="card" data-testid="account-signed-in">
			<div class="who">
				<span class="who-avatar">{(auth.displayName ?? '?').slice(0, 1).toUpperCase()}</span>
				<div>
					<div class="who-name" data-testid="account-displayname">{auth.displayName ?? 'Nameless Spirit'}</div>
					<div class="who-sub">
						{#if auth.isAnonymous}
							<span class="badge guest">Guest account</span>
						{:else}
							<span class="badge real">{auth.email ?? 'Account'}</span>
						{/if}
					</div>
				</div>
			</div>

			<form class="row" onsubmit={saveName}>
				<label class="field">
					<span>Display name</span>
					<input
						bind:value={displayName}
						maxlength="40"
						placeholder="Nameless Spirit"
						data-testid="displayname-input"
					/>
				</label>
				<button class="btn" type="submit" disabled={busy} data-testid="displayname-save">Save</button>
			</form>
		</section>

		{#if auth.isPermanent}
			<!-- Manage a permanent account: password, email, sessions, deletion. -->
			<section class="card" data-testid="manage-card">
				<h2>Manage account</h2>
				<label class="field" style="margin-bottom:12px">
					<span>Current password <small>(required for changes below)</small></span>
					<input bind:value={currentPassword} type="password" placeholder="••••••••" autocomplete="current-password" data-testid="current-password" />
				</label>
				<form class="row" onsubmit={changePassword}>
					<label class="field">
						<span>New password</span>
						<input bind:value={newPassword} type="password" placeholder="At least 8 characters" autocomplete="new-password" minlength="8" data-testid="new-password" />
					</label>
					<button class="btn" type="submit" disabled={busy || newPassword.length < 8 || !currentPassword} data-testid="change-password">Update</button>
				</form>
				<form class="row" onsubmit={changeEmail}>
					<label class="field">
						<span>Change email</span>
						<input bind:value={newEmail} type="email" placeholder="new@email.com" autocomplete="email" data-testid="new-email" />
					</label>
					<button class="btn" type="submit" disabled={busy || !newEmail} data-testid="change-email">Send</button>
				</form>
				<div class="manage-actions">
					<button class="link" type="button" onclick={signOutEverywhere} disabled={busy} data-testid="signout-everywhere">Sign out everywhere</button>
					<button class="link danger" type="button" onclick={deleteAccount} disabled={busy} data-testid="delete-account">Delete account</button>
				</div>
			</section>
		{/if}

		{#if auth.isAnonymous}
			<!-- Claim flow: attach a real identity to the same uid → keep all progress. -->
			<section class="card" data-testid="claim-card">
				<h2>Claim your account</h2>
				<p class="lead">You're playing as a guest. Add an email + password (or a provider) to make it permanent and keep your stats across devices.</p>
				<form class="stack" onsubmit={claimAccount}>
					<input bind:value={email} type="email" placeholder="you@email.com" autocomplete="email" data-testid="claim-email" required />
					<input bind:value={password} type="password" placeholder="Password (min 8 chars)" autocomplete="new-password" minlength="8" data-testid="claim-password" required />
					<button class="btn primary" type="submit" disabled={busy} data-testid="claim-submit">{busy ? 'Linking…' : 'Claim account'}</button>
				</form>
				<div class="oauth">
					<button class="oauth-btn" type="button" onclick={() => oauth('google')} data-testid="oauth-google">Continue with Google</button>
					<button class="oauth-btn" type="button" onclick={() => oauth('apple')} data-testid="oauth-apple">Continue with Apple</button>
					<button class="oauth-btn" type="button" onclick={() => oauth('discord')} data-testid="oauth-discord">Continue with Discord</button>
				</div>
			</section>
		{/if}

		<button class="signout-link" type="button" onclick={doSignOut} disabled={busy} data-testid="signout">Sign out</button>
	{:else}
		<!-- ───────────── Signed out ───────────── -->
		<section class="card">
			<div class="tabs">
				<button class="tab" class:active={mode === 'signin'} type="button" onclick={() => (mode = 'signin')} data-testid="tab-signin">Sign in</button>
				<button class="tab" class:active={mode === 'signup'} type="button" onclick={() => (mode = 'signup')} data-testid="tab-signup">Create account</button>
			</div>

			<form class="stack" onsubmit={submitCredentials}>
				{#if mode === 'signup'}
					<input bind:value={displayName} maxlength="40" placeholder="Display name" autocomplete="nickname" data-testid="signup-name" />
				{/if}
				<input bind:value={email} type="email" placeholder="you@email.com" autocomplete="email" data-testid="auth-email" required />
				<input
					bind:value={password}
					type="password"
					placeholder="Password"
					autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
					minlength="8"
					data-testid="auth-password"
					required
				/>
				<button class="btn primary" type="submit" disabled={busy} data-testid="auth-submit">
					{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
				</button>
			</form>

			{#if mode === 'signin'}
				<button class="link" type="button" onclick={resetPassword} data-testid="forgot">Forgot password?</button>
			{/if}

			<div class="divider"><span>or</span></div>

			<div class="oauth">
				<button class="oauth-btn" type="button" onclick={() => oauth('google')} data-testid="oauth-google">Continue with Google</button>
				<button class="oauth-btn" type="button" onclick={() => oauth('apple')} data-testid="oauth-apple">Continue with Apple</button>
				<button class="oauth-btn" type="button" onclick={() => oauth('discord')} data-testid="oauth-discord">Continue with Discord</button>
			</div>

			<p class="lead small">No account needed to play — head to <a href="/play">Play</a> and jump in as a guest. Create an account anytime to save your stats.</p>
		</section>
	{/if}
</main>

<style>
	.account {
		max-width: 460px;
		margin: 0 auto;
		padding: clamp(24px, 5vh, 56px) 20px 80px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 22px;
	}
	.back {
		font-family: var(--font-mono, monospace);
		font-size: 0.8rem;
		color: var(--color-fog);
		text-decoration: none;
	}
	.back:hover { color: var(--color-bone); }
	h1 {
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 5vw, 2.4rem);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-bone);
		margin: 0;
	}
	.card {
		background: linear-gradient(180deg, rgba(20, 12, 36, 0.7), rgba(10, 6, 20, 0.7));
		border: 1px solid var(--color-mist);
		border-radius: 14px;
		padding: 22px;
		margin-bottom: 18px;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-bone);
		margin: 0 0 8px;
	}
	.lead { color: var(--color-fog); font-size: 0.86rem; line-height: 1.5; margin: 0 0 14px; }
	.lead.small { margin-top: 16px; text-align: center; }
	.lead a { color: var(--brand-magenta-soft, #ff5dd1); }

	.tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--color-mist); }
	.tab {
		flex: 1;
		padding: 10px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-fog);
		font-family: var(--font-display);
		font-size: 0.84rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.tab.active { color: var(--color-bone); border-bottom-color: var(--brand-magenta); }

	.stack { display: flex; flex-direction: column; gap: 10px; }
	.row { display: flex; align-items: flex-end; gap: 10px; }
	.field { display: flex; flex-direction: column; gap: 5px; flex: 1; }
	.field span { font-family: var(--font-display); font-size: 0.74rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-fog); }
	input {
		width: 100%;
		padding: 11px 13px;
		border-radius: 8px;
		border: 1px solid var(--color-mist);
		background: rgba(8, 5, 16, 0.7);
		color: var(--color-bone);
		font: inherit;
		font-size: 0.92rem;
	}
	input:focus { outline: none; border-color: var(--brand-magenta); }

	.btn {
		padding: 11px 18px;
		border-radius: 8px;
		border: 1px solid var(--color-mist);
		background: rgba(20, 12, 36, 0.6);
		color: var(--color-bone);
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn.primary { border: none; background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff)); color: #fff; }
	.btn:disabled { opacity: 0.55; cursor: progress; }

	.divider { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: var(--color-fog); font-size: 0.74rem; }
	.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--color-mist); }

	.oauth { display: flex; flex-direction: column; gap: 8px; }
	.oauth-btn {
		padding: 11px;
		border-radius: 8px;
		border: 1px solid var(--color-mist);
		background: rgba(8, 5, 16, 0.5);
		color: var(--color-bone);
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		cursor: pointer;
		transition: border-color 150ms ease;
	}
	.oauth-btn:hover { border-color: var(--brand-magenta); }

	.link { background: none; border: none; color: var(--brand-magenta-soft, #ff5dd1); font-size: 0.82rem; cursor: pointer; padding: 8px 0 0; align-self: flex-start; }
	.link:disabled { opacity: 0.5; cursor: progress; }
	.link.danger { color: var(--color-blood, #c41a3d); }
	.manage-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-mist); }
	.manage-actions .link { padding: 0; }
	.row + .row { margin-top: 12px; }

	.who { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
	.who-avatar {
		display: grid; place-items: center;
		width: 48px; height: 48px; flex: none;
		border-radius: 50%;
		background: var(--gradient-flame, linear-gradient(135deg, #ff2bc7, #7b1dff));
		color: #fff; font-family: var(--font-display); font-size: 1.3rem;
	}
	.who-name { font-family: var(--font-display); font-size: 1.3rem; color: var(--color-bone); }
	.badge { font-family: var(--font-mono, monospace); font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; }
	.badge.guest { background: rgba(36, 212, 255, 0.16); color: var(--brand-cyan, #24d4ff); }
	.badge.real { background: rgba(32, 224, 193, 0.14); color: var(--brand-teal, #20e0c1); }

	.signout-link { display: block; margin: 8px auto 0; background: none; border: none; color: var(--color-fog); font-size: 0.84rem; cursor: pointer; text-decoration: underline; }
	.signout-link:hover { color: var(--color-bone); }

	.msg { padding: 11px 14px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 16px; }
	.msg.error { border-left: 3px solid var(--color-blood, #c41a3d); background: rgba(196, 26, 61, 0.18); color: var(--color-bone); }
	.msg.notice { border-left: 3px solid var(--brand-teal, #20e0c1); background: rgba(32, 224, 193, 0.12); color: var(--color-bone); }
</style>
