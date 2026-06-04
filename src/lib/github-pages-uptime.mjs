/** GitHub Status Pages component (https://www.githubstatus.com/). */
export const GITHUB_PAGES_COMPONENT_ID = 'vg70hn9s2tyj';

export const GITHUB_STATUS_SUMMARY_URL = 'https://github-status-proxy.manji.app/summary';
export const GITHUB_STATUS_INCIDENTS_URL = 'https://github-status-proxy.manji.app/incidents';

const STATE_TO_FILL = {
	ok: '#28a745',
	warn: '#bdae13',
	bad: '#dc3545',
	maint: '#6c757d',
	unknown: '#6c757d',
};

const DAY_COUNT = 90;

/**
 * @returns {{ percent: string, days: { fill: string, state: string }[], status: string, fetchedAt: string }}
 */
export async function fetchGithubPagesUptime() {
	const [summary, incidents] = await Promise.all([
		fetchJson(GITHUB_STATUS_SUMMARY_URL),
		fetchJson(GITHUB_STATUS_INCIDENTS_URL),
	]);
	return buildGithubPagesUptimeSnapshot(summary, incidents);
}

export function createFallbackGithubPagesUptime() {
	return {
		percent: '',
		days: createRecentUtcDays().map(() => ({ fill: STATE_TO_FILL.unknown, state: 'unknown' })),
		status: 'unknown',
		fetchedAt: new Date().toISOString(),
	};
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`GitHub Status fetch failed with status ${response.status}`);
	}
	return response.json();
}

function buildGithubPagesUptimeSnapshot(summary, incidentsPayload) {
	const pagesComponent = summary.components?.find((component) => component.id === GITHUB_PAGES_COMPONENT_ID);
	if (!pagesComponent) {
		throw new Error('GitHub Pages component not found in status summary');
	}

	const days = createRecentUtcDays();
	const stateByDate = new Map(days.map((date) => [date, 'ok']));
	for (const incident of incidentsPayload.incidents ?? []) {
		if (!incidentAffectsPages(incident)) continue;
		const state = stateFromImpact(incident.impact);
		for (const date of datesBetweenUtc(incident.started_at ?? incident.created_at, incident.resolved_at ?? incident.updated_at)) {
			if (!stateByDate.has(date)) continue;
			stateByDate.set(date, worstState(stateByDate.get(date), state));
		}
	}

	const renderedDays = days.map((date) => {
		const state = stateByDate.get(date) ?? 'unknown';
		return { fill: STATE_TO_FILL[state], state };
	});
	const okDays = renderedDays.filter((day) => day.state === 'ok').length;

	return {
		percent: ((okDays / renderedDays.length) * 100).toFixed(2),
		days: renderedDays,
		status: pagesComponent.status ?? 'unknown',
		fetchedAt: new Date().toISOString(),
	};
}

function incidentAffectsPages(incident) {
	if (incident.components?.some((component) => component.id === GITHUB_PAGES_COMPONENT_ID)) {
		return true;
	}
	return incident.incident_updates?.some((update) =>
		update.affected_components?.some((component) => component.code === GITHUB_PAGES_COMPONENT_ID),
	);
}

function stateFromImpact(impact) {
	switch (impact) {
		case 'critical':
		case 'major':
			return 'bad';
		case 'maintenance':
			return 'maint';
		case 'minor':
			return 'warn';
		default:
			return 'warn';
	}
}

function worstState(left, right) {
	const rank = { ok: 0, unknown: 1, maint: 2, warn: 3, bad: 4 };
	return rank[right] > rank[left] ? right : left;
}

function createRecentUtcDays() {
	const today = new Date();
	const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
	return Array.from({ length: DAY_COUNT }, (_, index) => {
		const time = end - (DAY_COUNT - index - 1) * 24 * 60 * 60 * 1000;
		return new Date(time).toISOString().slice(0, 10);
	});
}

function datesBetweenUtc(startValue, endValue) {
	const start = new Date(startValue);
	const end = new Date(endValue || startValue);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

	const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
	const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
	const dates = [];
	for (let time = startDay; time <= endDay; time += 24 * 60 * 60 * 1000) {
		dates.push(new Date(time).toISOString().slice(0, 10));
	}
	return dates;
}
