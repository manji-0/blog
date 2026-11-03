// GET /card: NFC business card, gated by the CARD_KEY secret.
import { defineHandler } from 'void';
import { handleCard } from '../../src/card';

export const GET = defineHandler((c) => handleCard(c.req.raw));
