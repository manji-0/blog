import { defineConfig } from 'void/config';

export default defineConfig({
	inference: {
		// `void deploy` runs this instead of a bare `astro build`. The R2 upload
		// rewrites image URLs in the built HTML, so it has to run inside the build.
		build: 'pnpm run build:deploy',
	},
	routing: {
		// Pages are prerendered by Astro; nothing renders on the edge. Saying
		// so up front keeps `void deploy` from asking about an ISR cache in CI.
		isr: false,
	},
	cloudflare: {
		name: 'manjio',
		compatibility_date: '2026-07-07',
		// `void/env` (CARD_KEY) needs AsyncLocalStorage in Astro.
		compatibility_flags: ['nodejs_als'],
		// Visibility and the Custom Domain match what the dashboard set on the
		// existing Worker; `void deploy` refuses to republish undeclared ones.
		workers_dev: true,
		preview_urls: true,
		routes: [{ pattern: 'www.manj.io', custom_domain: true }],
		r2_buckets: [{ binding: 'R2_ASSETS', bucket_name: 'manjio-assets' }],
		observability: { enabled: true, head_sampling_rate: 1 },
	},
});
