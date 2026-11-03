// GET /api/status/github: alias of /api/status/github/status.
import { defineHandler } from 'void';
import { preflightResponse } from '../../../../src/http';
import { GITHUB_STATUSPAGE, proxyStatuspage } from '../../../../src/statuspage';

export const GET = defineHandler(() => proxyStatuspage(GITHUB_STATUSPAGE, 'status'));
export const OPTIONS = defineHandler(() => preflightResponse());
