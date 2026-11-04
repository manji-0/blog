// Deck files are static assets; this route only runs for Slidev deep links
// such as /slides/{deck}/5, which fall back to the deck's index.html.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveDeck } from '../../../server/slides';

export const prerender = false;

export const GET: APIRoute = ({ request, params }) => serveDeck(request, env.ASSETS, params.deck ?? '');
