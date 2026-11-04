// Deck manifest JSON.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveSlidesManifest } from '../../server/slides';

export const prerender = false;

export const GET: APIRoute = ({ request }) => serveSlidesManifest(request, env.ASSETS);
