// GET /assets/r2/*: large images uploaded by scripts/upload-r2-assets.mjs.
import { defineHandler } from 'void';
import { handleR2Asset } from '../../../src/r2';

export const GET = defineHandler((c) => handleR2Asset(c.req.raw, c.env.R2_ASSETS));
