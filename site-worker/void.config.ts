import { defineConfig } from 'void/config';

export default defineConfig({
	inference: {
		// public/ is pre-built static output; routes/ adds the Worker.
		appType: 'void',
	},
	routing: {
		notFound: '404-page',
		// Pages are pre-built into public/; nothing renders on the edge. Saying
		// so up front keeps `void deploy` from asking about an ISR cache in CI.
		isr: false,
		// The catch-all card route does not match an empty rest segment.
		redirects: {
			'/card/': { to: '/card', status: 308 },
		},
	},
	worker: {
		compatibility_date: '2026-07-07',
	},
	cloudflare: {
		name: 'manjio',
		workers_dev: true,
		// The Custom Domain was attached in the dashboard. Declaring it keeps
		// `void deploy` from dropping it when it updates triggers.
		routes: [{ pattern: 'www.manj.io', custom_domain: true }],
		r2_buckets: [{ binding: 'R2_ASSETS', bucket_name: 'manjio-assets' }],
		observability: { enabled: true, head_sampling_rate: 1 },
	},
});
