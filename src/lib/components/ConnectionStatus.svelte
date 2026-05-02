<script lang="ts">
	interface Props {
		isConnected: boolean;
		isReconnecting?: boolean;
		onReconnect?: () => void;
	}

	let { isConnected, isReconnecting = false, onReconnect }: Props = $props();
</script>

{#if !isConnected}
	<div class="connection-banner fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
		<div class="banner-inner" class:reconnecting={isReconnecting} class:disconnected={!isReconnecting}>
			{#if isReconnecting}
				<!-- Reconnecting state -->
				<span class="spinner"></span>
				<span class="banner-text banner-amber">Reconnecting...</span>
			{:else}
				<!-- Disconnected state -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="banner-icon banner-coral"
				>
					<path
						fill-rule="evenodd"
						d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="banner-text banner-coral">Connection lost</span>
				{#if onReconnect}
					<button onclick={onReconnect} class="reconnect-btn">
						Reconnect
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.connection-banner {
		animation: slide-up 0.3s ease-out;
	}

	@keyframes slide-up {
		from { opacity: 0; transform: translate(-50%, 20px); }
		to   { opacity: 1; transform: translate(-50%, 0); }
	}

	/* Reconnecting = amber solid pill, Disconnected = coral solid pill */
	.banner-inner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 18px;
		border-radius: 2px;
		border: none;
	}

	.banner-inner.reconnecting {
		background: var(--brand-amber);
	}

	.banner-inner.disconnected {
		background: var(--brand-coral);
	}

	/* Spinner for reconnecting */
	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid rgba(0, 0, 0, 0.25);
		border-top-color: var(--color-void);
		animation: spin 0.75s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.banner-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--color-void);
	}

	.banner-text {
		font-family: var(--font-display);
		font-size: 0.85rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--color-void);
	}

	/* Keep these classes but override color to dark on solid backgrounds */
	.banner-amber { color: var(--color-void); }
	.banner-coral { color: var(--color-void); }

	.reconnect-btn {
		display: inline-flex;
		align-items: center;
		padding: 5px 12px;
		border-radius: 2px;
		border: none;
		background: var(--color-void);
		color: var(--brand-magenta);
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 180ms ease;
		white-space: nowrap;
	}
	.reconnect-btn:hover {
		background: var(--color-shadow);
	}
	.reconnect-btn:focus-visible {
		outline: 2px solid var(--color-void);
		outline-offset: 2px;
	}
</style>
