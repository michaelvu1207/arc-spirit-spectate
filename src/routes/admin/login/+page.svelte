<script lang="ts">
	export let data: { error?: string } | undefined;
</script>

<svelte:head>
	<title>Admin Login | Arc Spirits</title>
</svelte:head>

<main class="login-main">
	<div class="login-card">
		<!-- accent embellishment: top magenta bar -->
		<div class="login-accent" aria-hidden="true"></div>

		<div class="login-body">
			<span class="eyebrow">Arc Spirits</span>
			<h1 class="login-title">Admin<br />Login</h1>
			<p class="login-desc">Enter the admin secret to manage game verification.</p>

			{#if data?.error}
				<div class="login-error">{data.error}</div>
			{/if}

			<form method="POST" class="login-form">
				<label class="field">
					<span class="field-label">Admin Secret</span>
					<input
						name="secret"
						type="password"
						autocomplete="current-password"
						required
						class="field-input"
					/>
				</label>
				<button type="submit" class="btn-primary login-btn">Sign In</button>
			</form>
		</div>
	</div>
</main>

<style>
	.login-main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 32px 20px;
		position: relative;
		z-index: 1;
	}

	.login-card {
		width: 100%;
		max-width: 420px;
		background: var(--color-tomb);
		border: 1px solid var(--color-mist);
		position: relative;
		overflow: hidden;
	}

	/* single accent embellishment: solid magenta top bar */
	.login-accent {
		height: 4px;
		background: var(--brand-magenta);
	}

	.login-body {
		padding: 36px 40px 40px;
	}

	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--brand-cyan);
	}

	.login-title {
		font-family: var(--font-display);
		font-size: clamp(3rem, 8vw, 4rem);
		font-weight: 400;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 0.9;
		color: var(--color-bone);
		margin: 10px 0 14px;
	}

	.login-desc {
		color: var(--color-parchment);
		font-size: 0.88rem;
		margin: 0 0 28px;
		line-height: 1.5;
	}

	.login-error {
		border: 1px solid var(--color-blood);
		background: rgba(255, 77, 109, 0.08);
		padding: 12px 16px;
		color: var(--color-blood);
		font-size: 0.84rem;
		margin-bottom: 20px;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field-label {
		font-family: var(--font-display);
		font-size: 0.66rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog);
	}

	.field-input {
		background: var(--color-shadow);
		border: 1px solid var(--color-mist);
		color: var(--color-bone);
		font-family: var(--font-body);
		font-size: 0.95rem;
		padding: 12px 14px;
		width: 100%;
		transition: border-color 160ms ease;
	}
	.field-input:focus {
		outline: none;
		border-color: var(--brand-magenta);
	}

	.login-btn {
		width: 100%;
		padding: 14px 24px;
		font-size: 0.8rem;
		letter-spacing: 0.22em;
	}
</style>
