// GET /api/status/github/{status,summary,incidents}
import { defineHandler } from 'void';
import { preflightResponse } from '../../../../src/http';
import { GITHUB_STATUSPAGE, parseStatuspageEndpoint, proxyStatuspage } from '../../../../src/statuspage';

export const GET = defineHandler((c) =>
	proxyStatuspage(GITHUB_STATUSPAGE, parseStatuspageEndpoint(c.req.param('endpoint') ?? '')),
);
export const OPTIONS = defineHandler(() => preflightResponse());
