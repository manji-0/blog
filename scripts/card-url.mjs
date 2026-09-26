import { randomBytes } from 'node:crypto';

const ORIGIN = 'https://www.manj.io';
const CARD_PATH = '/card';
const CARD_KEY_PARAM = 'k';
const ABBREVIATED_URI_PREFIX = 'https://www.';
const NTAG215_USER_BYTES = 504;
const NDEF_LONG_RECORD_OVERHEAD = 13;
const NDEF_SHORT_RECORD_OVERHEAD = 8;
const SHORT_RECORD_MAX_PAYLOAD = 255;

function ndefBytes(url) {
	const rest = url.startsWith(ABBREVIATED_URI_PREFIX) ? url.slice(ABBREVIATED_URI_PREFIX.length) : url;
	const restBytes = Buffer.byteLength(rest, 'utf8');
	const payloadBytes = restBytes + 1;
	const overhead =
		payloadBytes <= SHORT_RECORD_MAX_PAYLOAD ? NDEF_SHORT_RECORD_OVERHEAD : NDEF_LONG_RECORD_OVERHEAD;
	return restBytes + overhead;
}

const key = process.argv[2] ?? randomBytes(16).toString('base64url');
const url = `${ORIGIN}${CARD_PATH}?${CARD_KEY_PARAM}=${encodeURIComponent(key)}`;
const bytes = ndefBytes(url);

if (bytes > NTAG215_USER_BYTES) {
	console.error(`URL needs ${bytes} bytes on the tag, NTAG215 holds ${NTAG215_USER_BYTES}.`);
	process.exit(1);
}

console.log(`key: ${key}`);
console.log(`url: ${url}`);
console.log(`ndef: ${bytes} / ${NTAG215_USER_BYTES} bytes`);
console.log('');
console.log('register the key:');
console.log('  pnpm --filter site-worker exec wrangler secret put CARD_KEY');
