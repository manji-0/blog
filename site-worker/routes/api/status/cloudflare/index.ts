// GET /api/status/cloudflare: alias of /api/status/cloudflare/status.
import { defineHandler } from 'void';
import { preflightResponse } from '../../../../src/http';
import { CLOUDFLARE_STATUSPAGE, proxyStatuspage } from '../../../../src/statuspage';

export const GET = defineHandler(() => proxyStatuspage(CLOUDFLARE_STATUSPAGE, 'status'));
export const OPTIONS = defineHandler(() => preflightResponse());
