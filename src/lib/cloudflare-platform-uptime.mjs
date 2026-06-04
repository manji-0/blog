/** Cloudflare Status components (https://www.cloudflarestatus.com/). */
export const CLOUDFLARE_PAGES_COMPONENT_ID = 'vgxj684rcw7t';
export const CLOUDFLARE_WORKERS_COMPONENT_ID = '57srcl8zcn7c';

export const CLOUDFLARE_STATUS_SUMMARY_URL = 'https://cloudflare-status-proxy.manji.app/summary';
export const CLOUDFLARE_STATUS_INCIDENTS_URL = 'https://cloudflare-status-proxy.manji.app/incidents';

const STATE_TO_FILL = {
	ok: '#28a745',
	warn: '#bdae13',
	bad: '#dc3545',
	maint: '#6c757d',
	unknown: '#6c757d',
};

const DAY_COUNT = 90;

/**
 * @returns {{ percent: string, days: { fill: string, state: string }[], status: string, pagesStatus: string, workersStatus: string, fetchedAt: string }}
 */
export async function fetchCloudflarePlatformUptime() {
	const [summary, incidents] = await Promise.all([
		fetchJson(CLOUDFLARE_STATUS_SUMMARY_URL),
		fetchJson(CLOUDFLARE_STATUS_INCIDENTS_URL),
	]);
	return buildCloudflarePlatformUptimeSnapshot(summary, incidents);
}

export function createFallbackCloudflarePlatformUptime() {
	return {
		percent: '',
		days: createRecentUtcDays().map(() => ({ fill: STATE_TO_FILL.unknown, state: 'unknown' })),
		status: 'unknown',
		pagesStatus: 'unknown',
		workersStatus: 'unknown',
		fetchedAt: new Date().toISOString(),
	};
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Cloudflare Status fetch failed with status ${response.status}`);
	}
	return response.json();
}

function buildCloudflarePlatformUptimeSnapshot(summary, incidentsPayload) {
	const pagesComponent = findComponent(summary, CLOUDFLARE_PAGES_COMPONENT_ID);
	const workersComponent = findComponent(summary, CLOUDFLARE_WORKERS_COMPONENT_ID);
	if (!pagesComponent || !workersComponent) {
		throw new Error('Cloudflare Pages or Workers component not found in status summary');
	}

	const days = createRecentUtcDays();
	const stateByDate = new Map(days.map((date) => [date, 'ok']));
	for (const incident of incidentsPayload.incidents ?? []) {
		if (!incidentAffectsCloudflarePlatform(incident)) continue;
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
		status: worstStatus(pagesComponent.status, workersComponent.status),
		pagesStatus: pagesComponent.status ?? 'unknown',
		workersStatus: workersComponent.status ?? 'unknown',
		fetchedAt: new Date().toISOString(),
	};
}

function findComponent(summary, id) {
	return summary.components?.find((component) => component.id === id);
}

function incidentAffectsCloudflarePlatform(incident) {
	if (incident.components?.some((component) => isCloudflarePlatformComponent(component.id))) {
		return true;
	}
	return incident.incident_updates?.some((update) =>
		update.affected_components?.some((component) => isCloudflarePlatformComponent(component.code)),
	);
}

function isCloudflarePlatformComponent(id) {
	return id === CLOUDFLARE_PAGES_COMPONENT_ID || id === CLOUDFLARE_WORKERS_COMPONENT_ID;
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

function worstStatus(left, right) {
	const rank = {
		operational: 0,
		none: 0,
		unknown: 1,
		under_maintenance: 2,
		degraded_performance: 3,
		partial_outage: 4,
		major_outage: 5,
	};
	return (rank[right] ?? rank.unknown) > (rank[left] ?? rank.unknown) ? right : left;
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
