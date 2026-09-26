import type { APIRoute } from 'astro';
import { buildVcard } from '../../lib/card-profile';

export const GET: APIRoute = () =>
	new Response(buildVcard(), {
		headers: { 'Content-Type': 'text/vcard; charset=utf-8' },
	});
