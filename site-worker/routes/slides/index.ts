// GET /slides: deck manifest JSON.
import { defineHandler } from 'void';
import { serveSlidesManifest } from '../../src/slides';

export const GET = defineHandler((c) => serveSlidesManifest(c.req.raw, c.env.ASSETS));
