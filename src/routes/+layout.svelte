<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { invalidate } from '$app/navigation';
	import TopBar from '$lib/components/TopBar.svelte';
	import { stopMenu } from '$lib/stores/menuAudio.svelte';
	import { auth } from '$lib/auth/auth.svelte';

	let { data, children } = $props();

	// Push the freshest SSR→CSR auth state into the shared auth store (reactive on
	// every layout re-load, i.e. every `invalidate('supabase:auth')`).
	$effect(() => {
		auth.sync(data.supabase, data.session, data.user, data.profile);
	});

	// Re-validate when the session changes anywhere (token refresh, sign in/out, a
	// second tab) so all tabs converge.
	$effect(() => {
		const { data: sub } = data.supabase.auth.onAuthStateChange((event, newSession) => {
			// Re-sync on a token change (refresh) OR an explicit identity event from any
			// tab (sign in/out elsewhere, email/name change → USER_UPDATED). INITIAL_SESSION
			// (fired on every re-subscribe) is intentionally excluded to avoid a loop.
			if (
				event === 'SIGNED_IN' ||
				event === 'SIGNED_OUT' ||
				event === 'USER_UPDATED' ||
				newSession?.expires_at !== data.session?.expires_at
			) {
				invalidate('supabase:auth');
			}
		});
		return () => sub.subscription.unsubscribe();
	});

	// Audio lives ONLY in the immersive /play experience. The menu theme is a
	// module-scoped <audio> that keeps playing across client-side navigation, so
	// silence it whenever we're on a main-website (non-/play) route. The main site
	// has no music of its own (the site soundtrack was removed).
	$effect(() => {
		if (!$page.url.pathname.startsWith('/play')) stopMenu();
	});
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

<!-- Soft edge-blur vignette: a masked full-screen backdrop blur that only
     affects the page's outer rim (transparent through the centre). -->
<div class="edge-blur" aria-hidden="true"></div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
	}

	/* Very subtle edge blur framing the whole viewport. The radial mask leaves the
	   centre crisp (transparent → no backdrop-filter) and eases the blur in only
	   toward the outer rim. Non-interactive; sits above everything. */
	.edge-blur {
		position: fixed;
		inset: 0;
		z-index: 9000;
		pointer-events: none;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		-webkit-mask: radial-gradient(
			ellipse 82% 82% at 50% 50%,
			transparent 60%,
			rgba(0, 0, 0, 0.85) 100%
		);
		mask: radial-gradient(ellipse 82% 82% at 50% 50%, transparent 60%, rgba(0, 0, 0, 0.85) 100%);
	}

	/* Pure decoration. A full-viewport backdrop blur is the single worst case on
	   mobile GPUs, so drop it entirely on phones and any coarse-pointer device. */
	@media (max-width: 600px), (pointer: coarse) {
		.edge-blur {
			display: none;
		}
	}
</style>
