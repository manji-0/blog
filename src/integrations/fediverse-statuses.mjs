import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchFediverseStatuses } from '../lib/fediverse-statuses.mjs';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'fediverse-statuses.json');

/**
 * Fetch recent Fediverse statuses at build/dev start so the browser can load a
 * same-origin snapshot without an Astro API route.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function fediverseStatusesIntegration() {
	return {
		name: 'fediverse-statuses',
		hooks: {
			'astro:build:start': async ({ logger }) => {
				await writeStatusesSnapshot(logger);
			},
			'astro:server:start': async ({ logger }) => {
				await writeStatusesSnapshot(logger);
			},
		},
	};
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 */
async function writeStatusesSnapshot(logger) {
	try {
		const data = await fetchFediverseStatuses();
		await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
		await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
		logger.info(`Latest statuses: wrote ${data.statuses.length} statuses.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`Could not fetch latest statuses (${message}). Keeping previous snapshot if any.`);
	}
}
