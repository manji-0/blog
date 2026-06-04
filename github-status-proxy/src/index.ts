const GITHUB_STATUS_ENDPOINTS = {
  "/": "https://www.githubstatus.com/api/v2/status.json",
  "/status": "https://www.githubstatus.com/api/v2/status.json",
  "/summary": "https://www.githubstatus.com/api/v2/summary.json",
  "/incidents": "https://www.githubstatus.com/api/v2/incidents.json",
} as const;
const CACHE_TTL_SECONDS = 60 * 60 * 24;

const cacheHeaders = {
  "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
} as const;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
  };
}

function jsonResponse(request: Request, body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function withResponseHeaders(request: Request, response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders(),
      ...cacheHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function fetchGithubStatus(request: Request, upstreamUrl: string): Promise<Response> {
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "github-status-proxy",
    },
  });

  if (!upstreamResponse.ok) {
    return jsonResponse(
      request,
      {
        error: "github_status_unavailable",
        upstreamStatus: upstreamResponse.status,
      },
      { status: 502 },
    );
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      ...cacheHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function handleRequest(request: Request, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      request,
      { error: "method_not_allowed" },
      { status: 405 },
    );
  }

  const url = new URL(request.url);
  const upstreamUrl = GITHUB_STATUS_ENDPOINTS[url.pathname as keyof typeof GITHUB_STATUS_ENDPOINTS];
  if (!upstreamUrl) {
    return jsonResponse(request, { error: "not_found" }, { status: 404 });
  }

  const cachePath = url.pathname === "/" ? "/status" : url.pathname;
  const cacheKey = new Request(new URL(cachePath, url.origin), {
    method: "GET",
  });
  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return withResponseHeaders(request, cachedResponse);
  }

  const response = await fetchGithubStatus(request, upstreamUrl);
  if (response.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return withResponseHeaders(request, response);
}

export default {
  fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, ctx);
  },
} satisfies ExportedHandler<Env>;
