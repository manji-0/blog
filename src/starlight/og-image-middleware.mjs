import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

const OGP_IMAGE_WIDTH = '1200';
const OGP_IMAGE_HEIGHT = '630';

export const onRequest = defineRouteMiddleware(async (context, next) => {
	await next();

	const route = context.locals.starlightRoute;
	const slug = route?.entry?.slug;
	if (typeof slug !== 'string' || slug.length === 0) return;
	if (!slug.startsWith('blog/')) return;
	if (slug === '404' || slug.endsWith('/404')) return;

	const hasOgImage = hasMeta(route.head, 'property', 'og:image');
	const hasTwitterImage = hasMeta(route.head, 'name', 'twitter:image');
	if (hasOgImage && hasTwitterImage) return;

	const ogImagePath = `/og/${slug}.png`;
	const ogImageUrl = context.site ? new URL(ogImagePath, context.site).href : ogImagePath;
	const tags = [];

	if (!hasOgImage) {
		tags.push(
			{ tag: 'meta', attrs: { property: 'og:image', content: ogImageUrl } },
			{ tag: 'meta', attrs: { property: 'og:image:width', content: OGP_IMAGE_WIDTH } },
			{ tag: 'meta', attrs: { property: 'og:image:height', content: OGP_IMAGE_HEIGHT } },
		);
	}

	if (!hasTwitterImage) {
		tags.push({ tag: 'meta', attrs: { name: 'twitter:image', content: ogImageUrl } });
	}

	route.head.push(...tags);
});

/**
 * @param {import('@astrojs/starlight/route-data').StarlightRouteData['head']} head
 * @param {'name' | 'property'} key
 * @param {string} value
 * @returns {boolean}
 */
function hasMeta(head, key, value) {
	return head.some((tag) => tag.tag === 'meta' && tag.attrs?.[key] === value);
}
