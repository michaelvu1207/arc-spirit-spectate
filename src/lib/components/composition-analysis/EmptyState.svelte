<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		variant?: 'amber' | 'cyan' | 'teal';
		action?: Snippet;
	}
	let { title, description, variant = 'amber', action }: Props = $props();
</script>

<div class="empty empty--{variant}">
	<div class="empty__flame" aria-hidden="true">⬢</div>
	<h2 class="empty__title">{title}</h2>
	{#if description}
		<p class="empty__desc">{description}</p>
	{/if}
	{#if action}
		<div class="empty__action">{@render action()}</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 64px 24px;
		text-align: center;
		color: var(--color-fog);
	}

	.empty__flame {
		font-size: 64px;
		line-height: 1;
		filter: drop-shadow(0 0 24px currentColor);
	}

	.empty--amber .empty__flame {
		color: var(--brand-amber);
	}
	.empty--cyan .empty__flame {
		color: var(--brand-cyan);
	}
	.empty--teal .empty__flame {
		color: var(--brand-teal);
	}

	.empty__title {
		font-family: var(--font-display);
		font-size: 24px;
		color: var(--color-bone);
		margin: 0;
	}

	.empty__desc {
		max-width: 400px;
		font-size: 14px;
		color: var(--color-fog);
		margin: 0;
	}

	.empty__action {
		margin-top: 8px;
	}
</style>
