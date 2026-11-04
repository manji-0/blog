// Latest public posts from the Fediverse and Bluesky.
import type { APIRoute } from 'astro';
import { preflightResponse } from '../../server/http';
import { handleStatuses } from '../../server/statuses';

export const prerender = false;

export const GET: APIRoute = () => handleStatuses();
export const OPTIONS: APIRoute = () => preflightResponse();
