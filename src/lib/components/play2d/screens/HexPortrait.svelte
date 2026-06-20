<script lang="ts">
	import { initials as toInitials } from '$lib/features/stats/format';

	interface Props {
		/** Image URL (guardian icon / spirit art). Falls back to initials when absent. */
		src?: string | null;
		alt?: string;
		/** Name used to derive the two-letter fallback. */
		name?: string;
		/** Pixel size of the hexagon. */
		size?: number;
		/** Frame accent token (e.g. var(--brand-amber)). Defaults to magenta. */
		accent?: string;
	}

	let { src = null, alt = '', name = '', size = 44, accent = 'var(--brand-magenta)' }: Props =
		$props();
</script>

<div class="hex" style:--hp-size={`${size}px`} style:--hp-accent={accent}>
	{#if src}
		<img {src} alt={alt || name} loading="lazy" />
	{:else}
		<div class="fallback">{name ? toInitials(name) : '—'}</div>
	{/if}
</div>

<style>
	.hex {
		width: var(--hp-size);
		height: var(--hp-size);
		flex: none;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		background: var(--hp-accent);
		padding: 1.5px;
	}
	.hex img,
	.fallback {
		width: 100%;
		height: 100%;
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		display: block;
	}
	.hex img {
		object-fit: cover;
	}
	.fallback {
		display: grid;
		place-items: center;
		background: var(--color-void);
		font-family: var(--font-display);
		font-size: calc(var(--hp-size) * 0.34);
		letter-spacing: 0.04em;
		color: var(--color-parchment);
	}
</style>
