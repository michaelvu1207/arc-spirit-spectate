<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		value: string | number;
		label: string;
		/** Optional small caption under the label. */
		sub?: string;
		/** Number accent token (e.g. var(--brand-teal)). Defaults to bone. */
		accent?: string;
		/** Visual scale. */
		size?: 'sm' | 'md' | 'lg';
		/** Optional leading icon (e.g. an inline SVG). */
		icon?: Snippet;
	}

	let { value, label, sub, accent = 'var(--color-bone)', size = 'md', icon }: Props = $props();
</script>

<div class="cell {size}" style:--sc-accent={accent}>
	{#if icon}
		<div class="icon">{@render icon()}</div>
	{/if}
	<div class="num">{value}</div>
	<div class="lab">{label}</div>
	{#if sub}<div class="sub">{sub}</div>{/if}
</div>

<style>
	.cell {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.icon {
		color: var(--brand-magenta-soft);
		opacity: 0.85;
		margin-bottom: 2px;
	}
	.icon :global(svg) {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
	}
	.num {
		font-family: var(--font-display);
		line-height: 1;
		color: var(--sc-accent);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.01em;
	}
	.lab {
		font-family: var(--font-display);
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-fog);
	}
	.sub {
		font-family: var(--font-mono);
		color: var(--color-whisper);
		letter-spacing: 0.02em;
	}

	.sm .num {
		font-size: 1.4rem;
	}
	.sm .lab {
		font-size: 0.8rem;
	}
	.sm .sub {
		font-size: 0.8rem;
	}

	.md .num {
		font-size: 2.2rem;
	}
	.md .lab {
		font-size: 0.8rem;
	}
	.md .sub {
		font-size: 0.8rem;
	}

	.lg .num {
		font-size: 2.8rem;
	}
	.lg .lab {
		font-size: 0.8rem;
	}
	.lg .sub {
		font-size: 0.8rem;
	}
</style>
