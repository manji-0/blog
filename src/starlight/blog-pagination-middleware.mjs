import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

/** @param {string} href */
function isBlogHref(href) {
	return /\/blog(\/|$)/.test(href.split('?')[0]);
}

/** @param {import('@astrojs/starlight/route-data').StarlightRouteData} route */
function isBlogRoute(route) {
	const id = route.id;
	return id === 'blog' || id.startsWith('blog/');
}

export const onRequest = defineRouteMiddleware(async (context, next) => {
	await next();

	const route = context.locals.starlightRoute;
	if (!route?.pagination) return;

	if (!isBlogRoute(route)) {
		route.pagination = { prev: undefined, next: undefined };
		return;
	}

	const prevLink = route.pagination.prev;
	const nextLink = route.pagination.next;
	route.pagination = {
		prev: prevLink && isBlogHref(prevLink.href) ? prevLink : undefined,
		next: nextLink && isBlogHref(nextLink.href) ? nextLink : undefined,
	};
});
