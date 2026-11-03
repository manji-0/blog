// GET /api/statuses: latest public posts from the Fediverse and Bluesky.
import { defineHandler } from 'void';
import { preflightResponse } from '../../src/http';
import { handleStatuses } from '../../src/statuses';

export const GET = defineHandler(() => handleStatuses());
export const OPTIONS = defineHandler(() => preflightResponse());
