const R2_ROUTE_PREFIX = '/assets/r2/';
const DECK_PATH = /^\/slides\/([^/]+)(?:\/(.*))?$/;

const CACHE_CONTROL = {
	r2: 'public, max-age=31536000, immutable',
	r2Miss: 'public, max-age=60',
	html: 'public, max-age=60, stale-while-revalidate=300',
	manifest: 'public, max-age=60, stale-while-revalidate=300',
} as const;

type DeckManifest = {
	generatedAt: string;
	decks: Array<{ id: string; path: string }>;
};

function isAssetPath(rest: string | undefined): boolean {
	return rest?.startsWith('assets/') ?? false;
}

function withCache(response: Response, cacheControl: string): Response {
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', cacheControl);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
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

function responseFromR2Object(object: R2ObjectBody, request: Request): Response {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Cache-Control', CACHE_CONTROL.r2);
	headers.set('ETag', object.httpEtag);

	if (request.method === 'HEAD') {
		return new Response(null, { headers });
	}

	return new Response(object.body, { headers });
}

async function handleR2Asset(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	const key = getR2AssetKey(new URL(request.url).pathname);
	if (!key) {
		return new Response('Not Found', {
			status: 404,
			headers: { 'Cache-Control': CACHE_CONTROL.r2Miss },
		});
	}

	const cache = caches.default;
	const cached = await cache.match(request);
	if (cached) {
		return cached;
	}

	const object = await env.R2_ASSETS.get(key);
	if (!object) {
		return new Response('Not Found', {
			status: 404,
			headers: { 'Cache-Control': CACHE_CONTROL.r2Miss },
		});
	}

	const response = responseFromR2Object(object, request);
	if (request.method === 'GET') {
		ctx.waitUntil(cache.put(request, response.clone()));
	}

	return response;
}

async function readSlidesManifest(env: Env): Promise<DeckManifest | null> {
	const response = await env.ASSETS.fetch('http://site.local/slides/manifest.json');
	if (!response.ok) {
		return null;
	}

	return (await response.json()) as DeckManifest;
}

async function serveSlidesManifest(env: Env): Promise<Response> {
	const manifest = await readSlidesManifest(env);
	if (!manifest) {
		return Response.json({ error: 'manifest_unavailable' }, { status: 503 });
	}

	return Response.json(manifest, {
		headers: { 'Cache-Control': CACHE_CONTROL.manifest },
	});
}

async function serveDeckSpaFallback(
	request: Request,
	env: Env,
	deckId: string,
): Promise<Response> {
	const url = new URL(request.url);
	const indexUrl = new URL(`/slides/${deckId}/index.html`, url.origin);
	const indexRequest = new Request(indexUrl, {
		method: request.method,
		headers: request.headers,
	});

	const response = await env.ASSETS.fetch(indexRequest);
	if (!response.ok) {
		return Response.json({ error: 'deck_not_found', deckId }, { status: 404 });
	}

	return withCache(response, CACHE_CONTROL.html);
}

async function handleAssetMiss(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);

	if (url.pathname === '/slides') {
		return serveSlidesManifest(env);
	}

	const match = url.pathname.match(DECK_PATH);
	if (!match) {
		return new Response('Not Found', { status: 404 });
	}

	const [, deckId, rest] = match;
	if (isAssetPath(rest)) {
		return new Response('Not Found', { status: 404 });
	}

	return serveDeckSpaFallback(request, env, deckId);
}

async function handleRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	const { pathname } = new URL(request.url);
	if (pathname.startsWith(R2_ROUTE_PREFIX)) {
		return handleR2Asset(request, env, ctx);
	}

	return handleAssetMiss(request, env);
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return handleRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
