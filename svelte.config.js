import adapterVercel from '@sveltejs/adapter-vercel';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// `npm run build:app` sets BUILD_TARGET=capacitor and produces a static SPA
// bundle for the Capacitor native shell. The default (web) build is unchanged
// and continues to use adapter-vercel (SSR on Vercel).
// NOTE: the static build requires the play route's server load to be moved
// client-side first — see CAPACITOR.md ("Static SPA build" section).
const capacitor = process.env.BUILD_TARGET === 'capacitor';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: capacitor
			? adapterStatic({ fallback: 'index.html', precompress: false, strict: false })
			: adapterVercel({
					runtime: 'nodejs22.x'
				})
	}
};

export default config;
