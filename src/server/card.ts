import { env } from 'void/env';

const CARD_KEY_PARAM = 'k';
const VCARD_FILENAME = '萬治渉.vcf';
const VCARD_FALLBACK_FILENAME = 'manji0.vcf';

// NTAG215 has 504 bytes of user memory. A single NDEF URI record with a
// long payload costs 13 bytes of framing (TLV 4 + header 1 + type length 1 +
// payload length 4 + type 1 + URI prefix code 1 + terminator 1), leaving 491
// bytes for the URL after the "https://www." prefix is abbreviated.
const NTAG215_URL_BUDGET = 491;
const ABBREVIATED_URI_PREFIX = 'https://www.';

const NO_INDEX = 'noindex, nofollow, noarchive';

export const CARD_HEADERS = {
	'Cache-Control': 'private, no-store',
	'X-Robots-Tag': NO_INDEX,
	'Referrer-Policy': 'no-referrer',
} as const;

export const VCARD_DISPOSITION = `attachment; filename="${VCARD_FALLBACK_FILENAME}"; filename*=UTF-8''${encodeURIComponent(VCARD_FILENAME)}`;

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

async function isAuthorized(url: URL): Promise<boolean> {
	if (!env.CARD_KEY || ndefUrlBytes(url) > NTAG215_URL_BUDGET) {
		return false;
	}

	const candidates = url.searchParams.getAll(CARD_KEY_PARAM);
	if (candidates.length !== 1) {
		return false;
	}

	return keyMatches(candidates[0], env.CARD_KEY);
}

/**
 * Returns the 404 to send when `url` lacks the `CARD_KEY` in `?k=`, and
 * `null` when the card may be shown.
 */
export async function denyCardAccess(url: URL): Promise<Response | null> {
	if (await isAuthorized(url)) {
		return null;
	}
	return new Response('Not Found', {
		status: 404,
		headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': NO_INDEX },
	});
}
