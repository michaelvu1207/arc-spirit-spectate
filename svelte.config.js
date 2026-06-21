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
				}),
		// Content-Security-Policy. The auth session cookie is JS-readable (the required
		// @supabase/ssr browser-client tradeoff), so the real mitigation is locking down
		// script execution: `script-src 'self'` (SvelteKit auto-adds nonces/hashes to its
		// own inline bootstrap) blocks any injected/inline attacker script from running —
		// no XSS payload, no token theft. object-src/base-uri are hardened too. We
		// intentionally leave connect/img/style/font/media unrestricted (no default-src)
		// so Supabase REST+realtime, fonts, images, and the Capacitor cross-origin backend
		// keep working without per-environment allowlists.
		csp: {
			mode: 'auto',
			directives: {
				// 'wasm-unsafe-eval' allows the WebGL/splat engine's WebAssembly to compile
				// WITHOUT permitting general eval() — injected JS still can't run. worker-src
				// allows the engine's blob-URL workers (safe: an attacker can't create one
				// without first running a script, which 'self' already blocks).
				'script-src': ['self', 'wasm-unsafe-eval'],
				'worker-src': ['self', 'blob:'],
				'object-src': ['none'],
				'base-uri': ['self']
			}
		}
	}
};

export default config;
