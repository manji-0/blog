import { defineMiddleware } from 'astro:middleware';
import { legacyDocsLocation } from './server/legacy-docs';

// Turns the legacy pages still in src/content/docs/docs/ into redirect pages at
// build time, and answers the on-demand routes in src/pages/docs/ at runtime.
export const onRequest = defineMiddleware((context, next) => {
	const location = legacyDocsLocation(context.url);
	return location ? context.redirect(location, 308) : next();
});
