<script lang="ts">
	import './layout.css';
	import TopBar from '$lib/components/TopBar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" type="image/png" />
	<meta name="theme-color" content="#050310" />
</svelte:head>

<div class="app haunted-bg">
	<TopBar />
	<div class="flex-1">
		{@render children()}
	</div>
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
	}
</style>
