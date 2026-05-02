<script lang="ts">
	interface Props {
		title?: string;
		message: string;
		onRetry?: () => void;
		variant?: 'error' | 'warning' | 'info';
	}

	let { title = 'Error', message, onRetry, variant = 'error' }: Props = $props();

	const variantConfig = {
		error: {
			barColor: 'var(--brand-coral)',
			titleColor: 'var(--brand-coral)',
			iconColor: 'var(--brand-coral)',
			btnBg: 'var(--brand-coral)',
			btnHover: '#ff8c6e'
		},
		warning: {
			barColor: 'var(--brand-amber)',
			titleColor: 'var(--brand-amber)',
			iconColor: 'var(--brand-amber)',
			btnBg: 'var(--brand-amber)',
			btnHover: 'var(--brand-amber-soft)'
		},
		info: {
			barColor: 'var(--brand-cyan)',
			titleColor: 'var(--brand-cyan)',
			iconColor: 'var(--brand-cyan)',
			btnBg: 'var(--brand-cyan)',
			btnHover: 'var(--brand-cyan-soft)'
		}
	};

	const cfg = $derived(variantConfig[variant]);
</script>

<div class="error-display">
	<!-- Accent left bar -->
	<span class="accent-bar" style="background: {cfg.barColor};"></span>

	<!-- Icon -->
	{#if variant === 'error'}
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="error-icon" style="color: {cfg.iconColor};">
			<path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
		</svg>
	{:else if variant === 'warning'}
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="error-icon" style="color: {cfg.iconColor};">
			<path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
		</svg>
	{:else}
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="error-icon" style="color: {cfg.iconColor};">
			<path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
		</svg>
	{/if}

	<!-- Title -->
	<h2 class="error-title" style="color: {cfg.titleColor};">{title}</h2>

	<!-- Message -->
	<p class="error-message">{message}</p>

	<!-- Retry Button -->
	{#if onRetry}
		<button
			onclick={onRetry}
			class="retry-btn"
			style="background: {cfg.btnBg};"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
				<path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clip-rule="evenodd" />
			</svg>
			Try Again
		</button>
	{/if}
</div>

<style>
	.error-display {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 32px 32px 28px 36px;
		border-radius: 2px;
		border: 1px solid var(--color-mist);
		background: var(--color-shadow);
		overflow: hidden;
		animation: fade-in 0.3s ease-out;
	}

	/* Left accent bar — 4px solid color block */
	.accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		width: 4px;
	}

	.error-icon {
		width: 2.5rem;
		height: 2.5rem;
	}

	.error-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin: 0;
		text-align: center;
	}

	.error-message {
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-parchment);
		text-align: center;
		max-width: 44ch;
		margin: 0;
	}

	.retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		padding: 10px 24px;
		border-radius: 2px;
		border: none;
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #fff;
		cursor: pointer;
		transition: filter 180ms ease;
	}
	.retry-btn:hover {
		filter: brightness(1.15);
	}
	.retry-btn:focus-visible {
		outline: 2px solid var(--brand-magenta);
		outline-offset: 2px;
	}

	@keyframes fade-in {
		from { opacity: 0; transform: scale(0.97); }
		to   { opacity: 1; transform: scale(1); }
	}
</style>
