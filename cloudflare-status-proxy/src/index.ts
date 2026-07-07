const CLOUDFLARE_STATUS_ENDPOINTS = {
  "/": "https://www.cloudflarestatus.com/api/v2/status.json",
  "/status": "https://www.cloudflarestatus.com/api/v2/status.json",
  "/summary": "https://www.cloudflarestatus.com/api/v2/summary.json",
  "/incidents": "https://www.cloudflarestatus.com/api/v2/incidents.json",
} as const;
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const STALE_WHILE_REVALIDATE_SECONDS = 60 * 5;

const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

function withResponseHeaders(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders(),
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function fetchCloudflareStatus(upstreamUrl: string): Promise<Response> {
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "cloudflare-status-proxy",
    },
  });

  if (!upstreamResponse.ok) {
    return jsonResponse(
      {
        error: "cloudflare_status_unavailable",
        upstreamStatus: upstreamResponse.status,
      },
      { status: 502 },
    );
  }

  return withResponseHeaders(upstreamResponse);
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders(), "Cache-Control": "no-store" },
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const upstreamUrl = CLOUDFLARE_STATUS_ENDPOINTS[url.pathname as keyof typeof CLOUDFLARE_STATUS_ENDPOINTS];
  if (!upstreamUrl) {
    return jsonResponse({ error: "not_found" }, { status: 404 });
  }

  return fetchCloudflareStatus(upstreamUrl);
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
} satisfies ExportedHandler<Env>;
