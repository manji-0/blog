import type { APIRoute } from 'astro';
import { buildVcard } from '../../lib/card-profile';
import { CARD_HEADERS, denyCardAccess, VCARD_DISPOSITION } from '../../server/card';

export const prerender = false;

export const GET: APIRoute = async ({ url }) =>
	(await denyCardAccess(url)) ??
	new Response(buildVcard(), {
		headers: {
			...CARD_HEADERS,
			'Content-Type': 'text/vcard; charset=utf-8',
			'Content-Disposition': VCARD_DISPOSITION,
		},
	});
