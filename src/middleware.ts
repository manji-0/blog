import { defineMiddleware } from 'astro:middleware';

const legacyDocPrefixes = [
	['/docs/kamae-rs', '/projects/kamae-rs'],
	['/docs/kamae-py', '/projects/kamae-py'],
	['/docs/kamae-scala', '/projects/kamae-scala'],
] as const;

export const onRequest = defineMiddleware((context, next) => {
	const { pathname } = new URL(context.request.url);

	for (const [from, to] of legacyDocPrefixes) {
		if (pathname === from || pathname.startsWith(`${from}/`)) {
			return context.redirect(`${to}${pathname.slice(from.length)}`, 308);
		}
	}

	return next();
});
