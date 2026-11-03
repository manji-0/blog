import { voidPlugin } from 'void';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [voidPlugin()],
	// `public/` holds the assembled Astro and Slidev output
	// (see scripts/assemble-public.mjs). Keep Vite's own hashed output out of
	// `/assets/`, which the R2 image route owns.
	build: { assetsDir: '_void' },
});
