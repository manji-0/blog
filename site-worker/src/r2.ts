const R2_ROUTE_PREFIX = '/assets/r2/';

const CACHE_CONTROL = {
	hit: 'public, max-age=31536000, immutable',
	miss: 'public, max-age=60',
} as const;

function notFound(): Response {
	return new Response('Not Found', {
		status: 404,
		headers: { 'Cache-Control': CACHE_CONTROL.miss },
	});
}

function getR2AssetKey(pathname: string): string | null {
	if (!pathname.startsWith(R2_ROUTE_PREFIX)) {
		return null;
	}

	const encodedKey = pathname.slice(R2_ROUTE_PREFIX.length);
	if (!encodedKey) {
		return null;
	}

	const key = decodeURIComponent(encodedKey);
	if (key.includes('..') || key.startsWith('/')) {
		return null;
	}

	return key;
}

export async function handleR2Asset(request: Request, bucket: R2Bucket): Promise<Response> {
	const key = getR2AssetKey(new URL(request.url).pathname);
	if (!key) {
		return notFound();
	}

	const object = await bucket.get(key);
	if (!object) {
		return notFound();
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Cache-Control', CACHE_CONTROL.hit);
	headers.set('ETag', object.httpEtag);

	return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}
