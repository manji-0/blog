const CACHE_CONTROL = {
	html: 'public, max-age=60, stale-while-revalidate=300',
	manifest: 'public, max-age=60, stale-while-revalidate=300',
} as const;

type DeckManifest = {
	generatedAt: string;
	decks: Array<{ id: string; path: string }>;
};

function withCache(response: Response, cacheControl: string): Response {
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', cacheControl);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export async function serveSlidesManifest(request: Request, assets: Pick<Fetcher, 'fetch'>): Promise<Response> {
	const response = await assets.fetch(new URL('/slides/manifest.json', request.url));
	if (!response.ok) {
		return Response.json({ error: 'manifest_unavailable' }, {
			status: 503,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	const manifest = (await response.json()) as DeckManifest;
	return Response.json(manifest, {
		headers: { 'Cache-Control': CACHE_CONTROL.manifest },
	});
}

/**
 * Serves a file from the deck build when one exists, and the deck's
 * `index.html` otherwise, so Slidev deep links such as `/slides/{deck}/5`
 * reach the client router.
 */
export async function serveDeck(request: Request, assets: Pick<Fetcher, 'fetch'>, deckId: string): Promise<Response> {
	const asset = await assets.fetch(request);
	if (asset.ok) {
		return asset;
	}

	const { pathname } = new URL(request.url);
	if (pathname.startsWith(`/slides/${deckId}/assets/`)) {
		return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
	}

	const index = await assets.fetch(
		new Request(new URL(`/slides/${deckId}/index.html`, request.url), {
			method: request.method,
			headers: request.headers,
		}),
	);
	if (!index.ok) {
		return Response.json({ error: 'deck_not_found', deckId }, {
			status: 404,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	return withCache(index, CACHE_CONTROL.html);
}
