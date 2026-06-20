<script lang="ts">
	import type { ActionResult } from '$lib/play/types';

	interface Props {
		result: ActionResult | null;
		onContinue?: () => void;
	}

	let { result, onContinue }: Props = $props();

	const lines = $derived(result?.log ?? []);
</script>

<section class="result" data-testid="action-result">
	<span class="eyebrow">{result?.label ?? 'Action'} complete</span>
	<ul class="log">
		{#if lines.length > 0}
			{#each lines as line, i (i)}
				<li>{line}</li>
			{/each}
		{:else}
			<li class="muted">Done.</li>
		{/if}
	</ul>
	<button type="button" class="continue" data-testid="result-continue" onclick={() => onContinue?.()}>
		Continue
	</button>
</section>

<style>
	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		max-width: 30rem;
		padding: 1.5rem 1.75rem;
		border: 1px solid var(--brand-violet, #5a2bff);
		border-top: 3px solid var(--brand-magenta, #ff2bc7);
		border-radius: 10px;
		background: linear-gradient(180deg, rgba(18, 10, 38, 0.8), rgba(8, 5, 16, 0.95));
	}
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-amber, #ffba3d);
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: center;
	}
	.log li {
		font-size: 0.92rem;
		color: var(--color-parchment, #e7e0cf);
	}
	.log li.muted {
		color: var(--color-fog, #8d8aa1);
	}
	.continue {
		margin-top: 0.25rem;
		padding: 10px 22px;
		font-family: var(--font-display);
		font-size: 0.82rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border: none;
		border-radius: 3px;
		background: var(--brand-magenta, #ff2bc7);
		color: #fff;
		cursor: pointer;
		transition: background 140ms ease;
	}
	.continue:hover {
		background: var(--brand-magenta-soft, #ff7fd9);
	}
</style>
