import { env } from 'void/env';
// The card page and vCard are built by Astro, then moved out of the public
// asset directory by scripts/assemble-public.mjs. Void serves public files
// without running routes, so the CARD_KEY check holds only for files that are
// bundled into the Worker here.
import cardHtml from '../private/card/index.html?raw';
import vcard from '../private/card/manji0.vcf?raw';

export const CARD_PATH = '/card';
export const CARD_KEY_PARAM = 'k';

const CARD_ASSET_PATH = `${CARD_PATH}/`;
const CARD_ALIASES = new Set([CARD_PATH, CARD_ASSET_PATH, `${CARD_ASSET_PATH}index.html`]);
const VCARD_PATH = `${CARD_ASSET_PATH}manji0.vcf`;
const VCARD_FILENAME = '萬治渉.vcf';
const VCARD_FALLBACK_FILENAME = 'manji0.vcf';

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

function notFound(): Response {
	return new Response('Not Found', { status: 404, headers: DENY_HEADERS });
}

type CardDocument = { body: string; contentType: string; disposition?: string };

function resolveDocument(pathname: string): CardDocument | null {
	if (CARD_ALIASES.has(pathname)) {
		return { body: cardHtml, contentType: 'text/html; charset=utf-8' };
	}
	if (pathname === VCARD_PATH) {
		return { body: vcard, contentType: 'text/vcard; charset=utf-8', disposition: vcardDisposition() };
	}
	return null;
}

function vcardDisposition(): string {
	return `attachment; filename="${VCARD_FALLBACK_FILENAME}"; filename*=UTF-8''${encodeURIComponent(VCARD_FILENAME)}`;
}

export async function handleCard(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const document = resolveDocument(url.pathname);
	if (!document || !(await isAuthorized(url))) {
		return notFound();
	}

	const headers = new Headers({
		'Content-Type': document.contentType,
		'Cache-Control': 'private, no-store',
		'X-Robots-Tag': 'noindex, nofollow, noarchive',
		'Referrer-Policy': 'no-referrer',
	});
	if (document.disposition) {
		headers.set('Content-Disposition', document.disposition);
	}
	return new Response(request.method === 'HEAD' ? null : document.body, { headers });
}
