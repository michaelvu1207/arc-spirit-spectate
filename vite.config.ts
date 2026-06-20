import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			output: {
				// Group the 3-D engine into its own lazy chunk so it is never included
				// in the initial bundle. SplatBackground.svelte imports both libraries
				// dynamically (await import(...) inside onMount), so Rollup will only
				// fetch this chunk when the splat renderer actually initialises.
				manualChunks(id) {
					if (id.includes('three') || id.includes('@sparkjsdev/spark')) {
						return 'spark';
					}
				}
			}
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{ts,js}']
	}
});
