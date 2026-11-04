// Large images uploaded by scripts/upload-r2-assets.mjs.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleR2Asset } from '../../../server/r2';

export const prerender = false;

export const GET: APIRoute = ({ request }) => handleR2Asset(request, env.R2_ASSETS);
