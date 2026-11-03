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

export const GITHUB_STATUSPAGE: Statuspage = { name: 'github', origin: 'https://www.githubstatus.com' };
export const CLOUDFLARE_STATUSPAGE: Statuspage = { name: 'cloudflare', origin: 'https://www.cloudflarestatus.com' };

export function parseStatuspageEndpoint(value: string): StatuspageEndpoint | null {
	return (ENDPOINTS as readonly string[]).includes(value) ? (value as StatuspageEndpoint) : null;
}

export async function proxyStatuspage(page: Statuspage, endpoint: StatuspageEndpoint | null): Promise<Response> {
	if (!endpoint) {
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
