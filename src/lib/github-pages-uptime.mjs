/** GitHub Status Pages component (https://www.githubstatus.com/). */
export const GITHUB_PAGES_COMPONENT_ID = 'vg70hn9s2tyj';

export const GITHUB_STATUS_HOME_URL = 'https://www.githubstatus.com/';

const FILL_TO_STATE = {
	'#28a745': 'ok',
	'#bdae13': 'warn',
	'#e3600b': 'warn',
	'#d73a49': 'bad',
	'#dc3545': 'bad',
	'#6c757d': 'maint',
};

/**
 * @param {string} html
 * @returns {{ percent: string, days: { fill: string, state: string }[], status: string, fetchedAt: string }}
 */
export function parseGithubPagesUptime(html) {
	const componentMatch = html.match(
		new RegExp(
			`data-component-id="${GITHUB_PAGES_COMPONENT_ID}"[\\s\\S]*?data-component-status="([^"]+)"`,
		),
	);
	const status = componentMatch?.[1] ?? 'unknown';

	const svgMatch = html.match(
		new RegExp(`id="uptime-component-${GITHUB_PAGES_COMPONENT_ID}"[^>]*>([\\s\\S]*?)</svg>`),
	);
	if (!svgMatch) {
		throw new Error('GitHub Pages uptime graph not found on status page');
	}

	const days = [...svgMatch[1].matchAll(/fill="([^"]+)"/g)].map((match) => {
		const fill = match[1].toLowerCase();
		return { fill, state: FILL_TO_STATE[fill] ?? 'unknown' };
	});

	if (days.length === 0) {
		throw new Error('GitHub Pages uptime days are empty');
	}

	const percentMatch = html.match(
		new RegExp(`id="uptime-percent-${GITHUB_PAGES_COMPONENT_ID}"[\\s\\S]*?<var[^>]*>([\\d.]+)</var>`),
	);
	const percent = percentMatch?.[1] ?? '';

	return {
		percent,
		days,
		status,
		fetchedAt: new Date().toISOString(),
	};
}

/**
 * @returns {Promise<ReturnType<typeof parseGithubPagesUptime>>}
 */
export async function fetchGithubPagesUptime() {
	const response = await fetch(GITHUB_STATUS_HOME_URL, {
		headers: { 'User-Agent': 'manj.io-github-pages-uptime/1.0' },
	});
	if (!response.ok) {
		throw new Error(`GitHub Status fetch failed with status ${response.status}`);
	}
	return parseGithubPagesUptime(await response.text());
}
