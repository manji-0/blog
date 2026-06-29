import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { getPrevNextLinks, getSidebarFromConfig } from '@starlight/navigation';
import config from 'virtual:starlight/user-config';
import {
	getProjectSidebarConfig,
	getProjectSlugFromRouteId,
} from '../sidebar-config.mjs';

/** @param {import('@astrojs/starlight/schemas/sidebar').SidebarItem[]} items */
function normalizeSidebarConfig(items) {
	return items.map((item) => {
		if (typeof item === 'string') return { slug: item, translations: {} };
		if ('slug' in item) return { translations: {}, ...item };
		if ('link' in item) return { translations: {}, ...item };
		if ('items' in item) {
			return { translations: {}, ...item, items: normalizeSidebarConfig(item.items) };
		}
		return item;
	});
}

export const onRequest = defineRouteMiddleware(async (context, next) => {
	await next();

	const route = context.locals.starlightRoute;
	if (!route?.entry) return;

	const projectSlug = getProjectSlugFromRouteId(route.id);
	if (!projectSlug) return;

	const sidebarConfig = normalizeSidebarConfig(getProjectSidebarConfig(projectSlug));
	route.sidebar = getSidebarFromConfig(sidebarConfig, context.url.pathname, route.locale);
	route.pagination = getPrevNextLinks(route.sidebar, config.pagination, route.entry.data);
});
