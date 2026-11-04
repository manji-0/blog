export function corsHeaders(): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
		'Access-Control-Allow-Headers': 'Accept',
	};
}

export function jsonResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			...corsHeaders(),
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			...init.headers,
		},
	});
}

export function preflightResponse(): Response {
	return new Response(null, {
		status: 204,
		headers: { ...corsHeaders(), 'Cache-Control': 'no-store' },
	});
}
