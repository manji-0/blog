export const CARD_PATH = '/card';
export const CARD_KEY_PARAM = 'k';

const CARD_ASSET_PATH = `${CARD_PATH}/`;
const CARD_ALIASES = new Set([CARD_PATH, CARD_ASSET_PATH, `${CARD_ASSET_PATH}index.html`]);

// NTAG215 has 504 bytes of user memory. A single NDEF URI record with a
// long payload costs 13 bytes of framing (TLV 4 + header 1 + type length 1 +
// payload length 4 + type 1 + URI prefix code 1 + terminator 1), leaving 491
// bytes for the URL after the "https://www." prefix is abbreviated.
const NTAG215_URL_BUDGET = 491;
const ABBREVIATED_URI_PREFIX = 'https://www.';

const DENY_HEADERS = {
	'Cache-Control': 'no-store',
	'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function isCardPath(pathname: string): boolean {
	return pathname === CARD_PATH || pathname.startsWith(CARD_ASSET_PATH);
}

function ndefUrlBytes(url: URL): number {
	const href = url.href.startsWith(ABBREVIATED_URI_PREFIX)
		? url.href.slice(ABBREVIATED_URI_PREFIX.length)
		: url.href;
	return new TextEncoder().encode(href).byteLength;
}

async function digest(value: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

async function keyMatches(candidate: string, expected: string): Promise<boolean> {
	const [a, b] = await Promise.all([digest(candidate), digest(expected)]);
	return crypto.subtle.timingSafeEqual(a, b);
}

async function isAuthorized(url: URL, env: Env): Promise<boolean> {
	if (!env.CARD_KEY || ndefUrlBytes(url) > NTAG215_URL_BUDGET) {
		return false;
	}

	const candidates = url.searchParams.getAll(CARD_KEY_PARAM);
	if (candidates.length !== 1) {
		return false;
	}

	return keyMatches(candidates[0], env.CARD_KEY);
}

function notFound(): Response {
	return new Response('Not Found', { status: 404, headers: DENY_HEADERS });
}

export async function handleCard(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	if (!CARD_ALIASES.has(url.pathname) || !(await isAuthorized(url, env))) {
		return notFound();
	}

	const asset = await env.ASSETS.fetch(
		new Request(new URL(CARD_ASSET_PATH, url.origin), {
			method: request.method,
			headers: request.headers,
		}),
	);
	if (!asset.ok) {
		return notFound();
	}

	const headers = new Headers(asset.headers);
	headers.set('Cache-Control', 'private, no-store');
	headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
	headers.set('Referrer-Policy', 'no-referrer');
	return new Response(asset.body, { status: asset.status, headers });
}
