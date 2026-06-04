import fs from 'node:fs/promises';
import path from 'node:path';
import {
	createFallbackCloudflarePlatformUptime,
	fetchCloudflarePlatformUptime,
} from '../lib/cloudflare-platform-uptime.mjs';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'cloudflare-platform-uptime.json');

/**
 * Fetch Cloudflare Pages/Workers uptime from Cloudflare Status at build/dev start.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function cloudflarePlatformUptimeIntegration() {
	return {
		name: 'cloudflare-platform-uptime',
		hooks: {
			'astro:build:start': async ({ logger }) => {
				await writeUptimeSnapshot(logger);
			},
			'astro:server:start': async ({ logger }) => {
				await writeUptimeSnapshot(logger);
			},
		},
	};
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 */
async function writeUptimeSnapshot(logger) {
	try {
		const data = await fetchCloudflarePlatformUptime();
		await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
		await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
		logger.info(
			`Cloudflare platform uptime: ${data.percent}% over ${data.days.length} days (${data.status}).`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`Could not fetch Cloudflare platform uptime (${message}). Keeping previous snapshot if any.`);
		try {
			await fs.access(OUTPUT_PATH);
		} catch {
			const data = createFallbackCloudflarePlatformUptime();
			await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
			await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
			logger.warn('Wrote fallback Cloudflare platform uptime snapshot.');
		}
	}
}
