// /api/status/{github,cloudflare}[/status|/summary|/incidents]
import type { APIRoute } from 'astro';
import { preflightResponse } from '../../../../server/http';
import { parseStatuspage, parseStatuspageEndpoint, proxyStatuspage } from '../../../../server/statuspage';

export const prerender = false;

export const GET: APIRoute = ({ params }) =>
	proxyStatuspage(parseStatuspage(params.service), parseStatuspageEndpoint(params.endpoint));
export const OPTIONS: APIRoute = () => preflightResponse();
