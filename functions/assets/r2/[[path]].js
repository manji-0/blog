const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const NEGATIVE_CACHE_CONTROL = 'public, max-age=60';

function getAssetKey(request) {
	const url = new URL(request.url);
	const routePrefix = '/assets/r2/';

	if (!url.pathname.startsWith(routePrefix)) {
		return null;
	}

	const encodedKey = url.pathname.slice(routePrefix.length);
	if (!encodedKey) {
		return null;
	}

	const key = decodeURIComponent(encodedKey);
	if (key.includes('..') || key.startsWith('/')) {
		return null;
	}

	return key;
}

function responseFromObject(object, request) {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Cache-Control', CACHE_CONTROL);
	headers.set('ETag', object.httpEtag);

	if (request.method === 'HEAD') {
		return new Response(null, { headers });
	}

	return new Response(object.body, { headers });
}

async function handleRequest(context) {
	const key = getAssetKey(context.request);
	if (!key) {
		return new Response('Not found', {
			status: 404,
			headers: { 'Cache-Control': NEGATIVE_CACHE_CONTROL },
		});
	}

	const cache = caches.default;
	const cached = await cache.match(context.request);
	if (cached) {
		return cached;
	}

	const object = await context.env.R2_ASSETS.get(key);
	if (!object) {
		return new Response('Not found', {
			status: 404,
			headers: { 'Cache-Control': NEGATIVE_CACHE_CONTROL },
		});
	}

	const response = responseFromObject(object, context.request);
	if (context.request.method === 'GET') {
		context.waitUntil(cache.put(context.request, response.clone()));
	}

	return response;
}

export const onRequestGet = handleRequest;
export const onRequestHead = handleRequest;
