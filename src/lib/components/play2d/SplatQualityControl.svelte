<script lang="ts">
	import {
		getGraphicsSettings,
		setSplatQuality,
		SPLAT_QUALITY_OPTIONS
	} from '$lib/stores/graphicsSettings.svelte';

	interface Props {
		/** Optional label shown above the control. */
		label?: string;
	}
	let { label = 'Background' }: Props = $props();

	const graphics = getGraphicsSettings();
</script>

<div class="field">
	<span class="lbl">{label}</span>
	<div class="seg" role="radiogroup" aria-label="{label} quality">
		{#each SPLAT_QUALITY_OPTIONS as opt (opt.value)}
			<button
				type="button"
				role="radio"
				class="opt"
				class:active={graphics.splatQuality === opt.value}
				aria-checked={graphics.splatQuality === opt.value}
				data-testid={`splat-quality-${opt.value}`}
				onclick={() => setSplatQuality(opt.value)}
			>
				{opt.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.lbl {
		font-family: var(--font-display);
		font-size: 0.62rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog, #9a8fb8);
	}
	.seg {
		display: inline-flex;
		padding: 3px;
		gap: 3px;
		border-radius: 10px;
		border: 1px solid var(--color-mist, #2e1d52);
		background: rgba(5, 3, 16, 0.5);
	}
	.opt {
		flex: 1;
		min-width: 52px;
		padding: 7px 10px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--color-parchment, #d8cfee);
		font-family: var(--font-display);
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition:
			background 150ms ease,
			color 150ms ease;
	}
	.opt.active {
		background: var(--brand-magenta, #ff2bc7);
		color: #fff;
	}
	@media (hover: hover) and (pointer: fine) {
		.opt:not(.active):hover {
			color: var(--color-bone, #f5f0ff);
			background: rgba(255, 43, 199, 0.12);
		}
	}
	.opt:focus-visible {
		outline: 2px solid var(--brand-magenta, #ff2bc7);
		outline-offset: 2px;
	}
</style>
