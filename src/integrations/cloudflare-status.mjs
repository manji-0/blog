import fs from 'node:fs/promises';
import path from 'node:path';
import {
	createFallbackCloudflareStatus,
	fetchCloudflareStatus,
} from '../lib/cloudflare-status.mjs';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'cloudflare-status.json');

/**
 * Fetch Cloudflare status at build/dev start.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function cloudflareStatusIntegration() {
	return {
		name: 'cloudflare-status',
		hooks: {
			'astro:build:start': async ({ logger }) => {
				await writeCloudflareStatusSnapshot(logger);
			},
			'astro:server:start': async ({ logger }) => {
				await writeCloudflareStatusSnapshot(logger);
			},
		},
	};
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 */
async function writeCloudflareStatusSnapshot(logger) {
	try {
		const data = await fetchCloudflareStatus();
		await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
		await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
		logger.info(`Cloudflare status: ${data.status} (${data.description}).`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`Could not fetch Cloudflare status (${message}). Keeping previous snapshot if any.`);
		try {
			await fs.access(OUTPUT_PATH);
		} catch {
			const data = createFallbackCloudflareStatus();
			await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
			await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
			logger.warn('Wrote fallback Cloudflare status snapshot.');
		}
	}
}
