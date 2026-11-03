// Fetched at build time, so the upstream API is called directly.
export const CLOUDFLARE_STATUS_URL = 'https://www.cloudflarestatus.com/api/v2/status.json';

/**
 * @returns {{ status: string, description: string, fetchedAt: string }}
 */
export async function fetchCloudflareStatus() {
	const payload = await fetchJson(CLOUDFLARE_STATUS_URL);
	return {
		status: payload.status?.indicator ?? 'unknown',
		description: payload.status?.description ?? 'Unknown',
		fetchedAt: new Date().toISOString(),
	};
}

export function createFallbackCloudflareStatus() {
	return {
		status: 'unknown',
		description: 'Unknown',
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
