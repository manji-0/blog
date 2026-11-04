import { corsHeaders, jsonResponse } from './http';

/**
 * Proxies one Atlassian Statuspage instance (`https://<host>/api/v2/*.json`)
 * and caches successful responses at the edge for one day.
 */
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const STALE_WHILE_REVALIDATE_SECONDS = 60 * 5;
const CACHE_CONTROL = `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;

const ENDPOINTS = ['status', 'summary', 'incidents'] as const;
export type StatuspageEndpoint = (typeof ENDPOINTS)[number];

export type Statuspage = {
	/** Prefix for the error code, e.g. `github` -> `github_status_unavailable`. */
	name: string;
	origin: string;
};

const STATUSPAGES: Record<string, Statuspage> = {
	github: { name: 'github', origin: 'https://www.githubstatus.com' },
	cloudflare: { name: 'cloudflare', origin: 'https://www.cloudflarestatus.com' },
};

export function parseStatuspage(value: string | undefined): Statuspage | null {
	return value && Object.hasOwn(STATUSPAGES, value) ? STATUSPAGES[value] : null;
}

/** An empty endpoint (`/api/status/github`) is an alias of `status`. */
export function parseStatuspageEndpoint(value: string | undefined): StatuspageEndpoint | null {
	const endpoint = value || 'status';
	return (ENDPOINTS as readonly string[]).includes(endpoint) ? (endpoint as StatuspageEndpoint) : null;
}

export async function proxyStatuspage(page: Statuspage | null, endpoint: StatuspageEndpoint | null): Promise<Response> {
	if (!page || !endpoint) {
		return jsonResponse({ error: 'not_found' }, { status: 404 });
	}

	const upstream = await fetch(`${page.origin}/api/v2/${endpoint}.json`, {
		headers: {
			Accept: 'application/json',
			'User-Agent': 'manj.io-status-proxy',
		},
		cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
	});

	if (!upstream.ok) {
		return jsonResponse(
			{ error: `${page.name}_status_unavailable`, upstreamStatus: upstream.status },
			{ status: 502 },
		);
	}

	return new Response(upstream.body, {
		headers: {
			...corsHeaders(),
			'Cache-Control': CACHE_CONTROL,
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}
