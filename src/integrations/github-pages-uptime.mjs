import fs from 'node:fs/promises';
import path from 'node:path';
import {
	createFallbackGithubPagesUptime,
	fetchGithubPagesUptime,
} from '../lib/github-pages-uptime.mjs';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'github-pages-uptime.json');

/**
 * Fetch GitHub Pages uptime from githubstatus.com at build/dev start.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function githubPagesUptimeIntegration() {
	return {
		name: 'github-pages-uptime',
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
		const data = await fetchGithubPagesUptime();
		await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
		await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
		logger.info(
			`GitHub Pages uptime: ${data.percent}% over ${data.days.length} days (${data.status}).`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`Could not fetch GitHub Pages uptime (${message}). Keeping previous snapshot if any.`);
		try {
			await fs.access(OUTPUT_PATH);
		} catch {
			const data = createFallbackGithubPagesUptime();
			await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
			await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
			logger.warn('Wrote fallback GitHub Pages uptime snapshot.');
		}
	}
}
