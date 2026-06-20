<script lang="ts">
	/** Full-bleed gate shown over the play board while game art is cached. */
	interface Props {
		progress: { loaded: number; total: number };
		/** Whether asset *data* has finished loading (images start after this). */
		dataReady: boolean;
	}

	let { progress, dataReady }: Props = $props();

	// Before data is ready (and thus total === 0) the bar is indeterminate.
	const determinate = $derived(dataReady && progress.total > 0);
	const pct = $derived(determinate ? Math.round((progress.loaded / progress.total) * 100) : 0);
	const label = $derived(dataReady ? 'Caching board art' : 'Loading assets');
</script>

<div class="loading-screen" role="status" aria-live="polite">
	<div class="panel">
		<div class="eyebrow">Arc Spirits</div>
		<h1>{label}…</h1>

		<div class="bar" class:indeterminate={!determinate}>
			<div class="fill" style:width={determinate ? `${pct}%` : undefined}></div>
		</div>

		<div class="meta">
			{#if determinate}
				<span>{progress.loaded} / {progress.total}</span>
				<span>{pct}%</span>
			{:else}
				<span>Preparing…</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.loading-screen {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: var(--color-void, #0a0610);
		z-index: 20;
	}

	.panel {
		width: min(440px, 80vw);
		text-align: center;
	}

	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--brand-cyan, #24d4ff);
		margin-bottom: 10px;
	}

	h1 {
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 3vw, 2.4rem);
		color: var(--brand-magenta, #ff2bc7);
		margin: 0 0 22px;
		letter-spacing: 0.04em;
	}

	.bar {
		position: relative;
		height: 6px;
		width: 100%;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: linear-gradient(90deg, var(--brand-cyan, #24d4ff), var(--brand-magenta, #ff2bc7));
		border-radius: 999px;
		transition: width 200ms ease;
	}

	/* No total yet: sweep a partial fill back and forth. */
	.bar.indeterminate .fill {
		width: 40%;
		animation: sweep 1.1s ease-in-out infinite;
	}

	@keyframes sweep {
		0% {
			transform: translateX(-110%);
		}
		100% {
			transform: translateX(275%);
		}
	}

	.meta {
		display: flex;
		justify-content: space-between;
		margin-top: 12px;
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		color: var(--color-fog, #9a93b0);
		font-variant-numeric: tabular-nums;
	}

	@media (prefers-reduced-motion: reduce) {
		.bar.indeterminate .fill {
			animation: none;
		}
	}
</style>
