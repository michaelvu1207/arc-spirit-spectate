<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import CompositionsSidebar from '$lib/components/composition-analysis/CompositionsSidebar.svelte';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}
	let { data, children }: Props = $props();

	const tabs = [
		{ slug: 'library', label: 'Library', desc: 'Compositions + ideal curves' },
		{ slug: 'games', label: 'Games', desc: 'Per-game VP overlays + diagnostics' },
		{ slug: 'tagging', label: 'Tagging', desc: 'Untagged queue + round board' }
	] as const;

	const activeTab = $derived.by(() => {
		const path = page.url.pathname;
		for (const t of tabs) {
			if (path.startsWith(`/admin/composition-analysis/${t.slug}`)) return t.slug;
		}
		return 'library';
	});
</script>

<div class="ca-shell">
	<aside class="ca-sidebar">
		<CompositionsSidebar games={data.sidebarGames} />
	</aside>

	<main class="ca-main">
		<header class="ca-topbar">
			<div class="ca-topbar__title">
				<span class="eyebrow">01 · COMPOSITION ANALYSIS</span>
				<h1 class="brand-flame-text">Composition Analysis</h1>
			</div>

			<nav class="ca-tabs" aria-label="Composition analysis sub-views">
				{#each tabs as tab (tab.slug)}
					{@const isActive = activeTab === tab.slug}
					<a
						href="/admin/composition-analysis/{tab.slug}"
						class="ca-tab"
						class:ca-tab--active={isActive}
						aria-current={isActive ? 'page' : undefined}
						title={tab.desc}
					>
						{tab.label}
					</a>
				{/each}
			</nav>
		</header>

		<section class="ca-pane">
			{@render children()}
		</section>
	</main>
</div>

<style>
	.ca-shell {
		display: grid;
		grid-template-columns: 288px minmax(0, 1fr);
		min-height: calc(100vh - var(--app-topbar-height, 0px));
		background: var(--color-void);
		color: var(--color-bone);
		font-family: var(--font-body);
	}

	.ca-sidebar {
		background: var(--color-obsidian);
		border-right: 1px solid var(--color-mist);
		min-height: 100%;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.ca-main {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 100%;
	}

	.ca-topbar {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 24px;
		padding: 20px 32px 0;
		border-bottom: 1px solid var(--color-mist);
		background: var(--color-void);
	}

	.ca-topbar__title :global(.eyebrow) {
		display: block;
		color: var(--brand-cyan);
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 4px;
	}

	.ca-topbar__title h1 {
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.1;
		margin: 0 0 16px;
	}

	.ca-tabs {
		display: flex;
		gap: 4px;
	}

	.ca-tab {
		display: inline-flex;
		align-items: center;
		padding: 8px 18px 14px;
		font-family: var(--font-display);
		font-size: 14px;
		letter-spacing: 0.04em;
		color: var(--color-fog);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		transition: color 120ms ease-in-out, border-color 120ms ease-in-out;
	}

	.ca-tab:hover {
		color: var(--color-parchment);
	}

	.ca-tab--active {
		color: var(--brand-cyan);
		border-bottom-color: var(--brand-cyan);
	}

	.ca-tab:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--brand-cyan);
		border-radius: 2px;
	}

	.ca-pane {
		flex: 1;
		min-height: 0;
		padding: 24px 32px 32px;
		overflow: auto;
	}

	@media (max-width: 1023px) {
		.ca-shell::before {
			content: 'Composition Analysis lives on the big screen. Switch to a ≥1024px display.';
			position: fixed;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			background: var(--color-void);
			color: var(--color-bone);
			font-family: var(--font-display);
			font-size: 18px;
			text-align: center;
			padding: 32px;
			z-index: 100;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ca-tab {
			transition: none;
		}
	}
</style>
