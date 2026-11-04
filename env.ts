import { defineEnv, string } from 'void/env';

export default defineEnv({
	// Shared secret embedded in the NFC business card URL (`/card?k=...`).
	// When unset, every `/card` request answers 404.
	CARD_KEY: string().optional(),
});
