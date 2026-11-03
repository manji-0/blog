// GET /slides/{deck}/*: deck files, with a Slidev SPA fallback for deep links.
import { defineHandler } from 'void';
import { serveDeck } from '../../../src/slides';

export const GET = defineHandler((c) => serveDeck(c.req.raw, c.env.ASSETS, c.req.param('deck') ?? ''));
