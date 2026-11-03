// GET /card/*: keeps the built card page and vCard behind the CARD_KEY check.
import { defineHandler } from 'void';
import { handleCard } from '../../src/card';

export const GET = defineHandler((c) => handleCard(c.req.raw));
