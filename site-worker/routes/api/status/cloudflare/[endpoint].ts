// GET /api/status/cloudflare/{status,summary,incidents}
import { defineHandler } from 'void';
import { preflightResponse } from '../../../../src/http';
import { CLOUDFLARE_STATUSPAGE, parseStatuspageEndpoint, proxyStatuspage } from '../../../../src/statuspage';

export const GET = defineHandler((c) =>
	proxyStatuspage(CLOUDFLARE_STATUSPAGE, parseStatuspageEndpoint(c.req.param('endpoint') ?? '')),
);
export const OPTIONS = defineHandler(() => preflightResponse());
