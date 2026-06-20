<script lang="ts">
	import type { Snippet } from 'svelte';
	import { playMenuSfx } from '$lib/stores/menuAudio.svelte';

	interface Props {
		eyebrow?: string;
		title: string;
		onClose: () => void;
		/** Widen the panel for dense content (profiles). */
		wide?: boolean;
		/** Optional header-right controls (e.g. an "open full replay" link). */
		headerActions?: Snippet;
		children: Snippet;
	}

	let { eyebrow, title, onClose, wide = false, headerActions, children }: Props = $props();

	function close() {
		playMenuSfx('ui-back');
		onClose();
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') close();
	}}
/>

<div class="overlay" class:wide>
	<button class="backdrop" type="button" aria-label="Close" onclick={close}></button>
	<div class="panel" role="dialog" aria-modal="true" aria-label={title}>
		<header class="head">
			<div class="head-text">
				{#if eyebrow}<div class="eyebrow">{eyebrow}</div>{/if}
				<h2 class="title">{title}</h2>
			</div>
			<div class="head-right">
				{#if headerActions}{@render headerActions()}{/if}
				<button class="close" type="button" aria-label="Close" onclick={close}>✕</button>
			</div>
		</header>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 140;
		display: grid;
		place-items: center;
		padding: clamp(16px, 4vh, 48px);
		animation: fade 160ms ease both;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		cursor: pointer;
		background: rgba(4, 2, 10, 0.74);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}
	.panel {
		position: relative;
		z-index: 1;
		width: min(780px, 100%);
		max-height: min(88dvh, 880px);
		display: flex;
		flex-direction: column;
		background: linear-gradient(180deg, rgba(20, 12, 36, 0.98), rgba(10, 6, 20, 0.99));
		border: 1px solid var(--color-aether);
		border-radius: 16px;
		box-shadow:
			0 30px 90px -24px rgba(0, 0, 0, 0.85),
			0 0 0 1px rgba(123, 29, 255, 0.12);
		overflow: hidden;
		animation: pop 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	.overlay.wide .panel {
		width: min(1040px, 100%);
	}

	.head {
		flex: none;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 22px 24px 18px;
		border-bottom: 1px solid var(--color-mist);
		background: linear-gradient(180deg, rgba(123, 29, 255, 0.08), transparent);
	}
	.head-text {
		min-width: 0;
	}
	.eyebrow {
		font-family: var(--font-display);
		font-size: 0.8rem;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--brand-cyan);
		margin-bottom: 5px;
	}
	.title {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vmin, 2.2rem);
		line-height: 0.95;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--color-bone);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.head-right {
		flex: none;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.close {
		flex: none;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-mist);
		border-radius: 999px;
		background: rgba(10, 7, 24, 0.5);
		color: var(--color-fog);
		font-size: 0.85rem;
		cursor: pointer;
		transition:
			color 150ms ease,
			border-color 150ms ease,
			transform 150ms ease;
	}
	.close:hover,
	.close:focus-visible {
		color: var(--brand-magenta-soft);
		border-color: var(--brand-magenta);
		transform: scale(1.06);
		outline: none;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: clamp(18px, 3vw, 28px);
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Mobile: dock to a bottom sheet. */
	@media (max-width: 600px) {
		.overlay {
			place-items: end stretch;
			padding: 0;
		}
		.panel {
			width: 100%;
			max-height: 92dvh;
			border-radius: 18px 18px 0 0;
			border-bottom: 0;
			animation: sheet 240ms cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
		}
	}
	@keyframes sheet {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.overlay,
		.panel {
			animation: none;
		}
	}
</style>
