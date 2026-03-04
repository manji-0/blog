import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

const OGP_IMAGE_WIDTH = '1200';
const OGP_IMAGE_HEIGHT = '840';
const TWITTER_CARD_VALUE = 'summary_large_image';

export const onRequest = defineRouteMiddleware(async (context, next) => {
	await next();

	const route = context.locals.starlightRoute;
	const slug = route?.entry?.slug;
	if (typeof slug !== 'string' || slug.length === 0) return;
	if (!slug.startsWith('blog/')) return;
	if (slug === '404' || slug.endsWith('/404')) return;

	const hasOgImage = hasMeta(route.head, 'property', 'og:image');
	const hasTwitterImage = hasMeta(route.head, 'name', 'twitter:image');

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

	removeMeta(route.head, 'name', 'twitter:card');
	tags.push({ tag: 'meta', attrs: { name: 'twitter:card', content: TWITTER_CARD_VALUE } });
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

/**
 * @param {import('@astrojs/starlight/route-data').StarlightRouteData['head']} head
 * @param {'name' | 'property'} key
 * @param {string} value
 */
function removeMeta(head, key, value) {
	for (let index = head.length - 1; index >= 0; index -= 1) {
		const tag = head[index];
		if (tag.tag === 'meta' && tag.attrs?.[key] === value) head.splice(index, 1);
	}
}
