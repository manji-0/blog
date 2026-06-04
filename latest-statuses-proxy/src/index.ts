const FEDIVERSE_STATUSES_ENDPOINT = "https://fedi.manji.app/users/manji0/statuses";
const BLUESKY_AUTHOR_FEED_ENDPOINT =
  "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed";
const BLUESKY_ACTOR = "manj.io";
const STATUS_LIMIT = 5;
const UPSTREAM_LIMIT = 20;
const CACHE_TTL_SECONDS = 60 * 5;
const STALE_WHILE_REVALIDATE_SECONDS = 60 * 5;
const CACHE_STORAGE_TTL_SECONDS = CACHE_TTL_SECONDS + STALE_WHILE_REVALIDATE_SECONDS;
const CACHE_CREATED_AT_HEADER = "X-Proxy-Cache-Created-At";

type StatusSource = "fediverse" | "bluesky";

type LatestStatus = {
  id: string;
  source: StatusSource;
  url: string;
  created_at: string;
  text: string;
};

type UpstreamError = {
  source: StatusSource;
  message: string;
};

type FediverseStatus = {
  id?: unknown;
  url?: unknown;
  uri?: unknown;
  created_at?: unknown;
  text?: unknown;
  reblog?: unknown;
  visibility?: unknown;
};

type BlueskyFeedItem = {
  post?: {
    uri?: unknown;
    cid?: unknown;
    author?: {
      handle?: unknown;
    };
    record?: {
      text?: unknown;
      createdAt?: unknown;
    };
  };
  reason?: unknown;
};

type BlueskyFeedResponse = {
  feed?: unknown;
};

const cacheHeaders = {
  "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`,
} as const;

const cacheStorageHeaders = {
  "Cache-Control": `public, max-age=${CACHE_STORAGE_TTL_SECONDS}`,
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

function cacheableResponse(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers),
      ...cacheStorageHeaders,
      [CACHE_CREATED_AT_HEADER]: String(Date.now()),
    },
  });
}

function isStale(response: Response): boolean {
  const createdAt = Number(response.headers.get(CACHE_CREATED_AT_HEADER));
  return !Number.isFinite(createdAt) || Date.now() - createdAt >= CACHE_TTL_SECONDS * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeFediverseStatuses(payload: unknown): LatestStatus[] {
  if (!Array.isArray(payload)) {
    throw new Error("Fediverse statuses response was not an array");
  }

  return payload
    .filter((status): status is FediverseStatus => isRecord(status))
    .filter((status) => !status.reblog && status.visibility === "public")
    .map<LatestStatus | null>((status) => {
      const id = asString(status.id);
      const createdAt = asString(status.created_at);
      if (!id || !createdAt) return null;

      return {
        id: `fediverse:${id}`,
        source: "fediverse",
        url: asString(status.url) ?? asString(status.uri) ?? FEDIVERSE_STATUSES_ENDPOINT,
        created_at: createdAt,
        text: asString(status.text) ?? "",
      };
    })
    .filter((status): status is LatestStatus => status !== null);
}

function blueskyPostUrl(item: BlueskyFeedItem): string {
  const handle = asString(item.post?.author?.handle) ?? BLUESKY_ACTOR;
  const uri = asString(item.post?.uri);
  const postId = uri?.split("/").pop();

  return postId ? `https://bsky.app/profile/${handle}/post/${postId}` : `https://bsky.app/profile/${handle}`;
}

function normalizeBlueskyFeed(payload: BlueskyFeedResponse): LatestStatus[] {
  if (!Array.isArray(payload.feed)) {
    throw new Error("Bluesky feed response was not an array");
  }

  return payload.feed
    .filter((item): item is BlueskyFeedItem => isRecord(item))
    .filter((item) => item.reason === undefined)
    .map<LatestStatus | null>((item) => {
      const uri = asString(item.post?.uri);
      const createdAt = asString(item.post?.record?.createdAt);
      if (!uri || !createdAt) return null;

      return {
        id: `bluesky:${uri}`,
        source: "bluesky",
        url: blueskyPostUrl(item),
        created_at: createdAt,
        text: asString(item.post?.record?.text) ?? "",
      };
    })
    .filter((status): status is LatestStatus => status !== null);
}

async function fetchJson(upstreamUrl: string): Promise<unknown> {
  const response = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "latest-statuses-proxy",
    },
  });

  if (!response.ok) {
    throw new Error(`upstream returned ${response.status}`);
  }

  return response.json();
}

async function fetchFediverseStatuses(): Promise<LatestStatus[]> {
  return normalizeFediverseStatuses(await fetchJson(FEDIVERSE_STATUSES_ENDPOINT));
}

async function fetchBlueskyStatuses(): Promise<LatestStatus[]> {
  const url = new URL(BLUESKY_AUTHOR_FEED_ENDPOINT);
  url.searchParams.set("actor", BLUESKY_ACTOR);
  url.searchParams.set("limit", String(UPSTREAM_LIMIT));
  url.searchParams.set("filter", "posts_no_replies");

  return normalizeBlueskyFeed((await fetchJson(url.toString())) as BlueskyFeedResponse);
}

async function fetchLatestStatuses() {
  const results = await Promise.allSettled([fetchFediverseStatuses(), fetchBlueskyStatuses()]);
  const errors: UpstreamError[] = [];
  const statuses = results.flatMap((result, index) => {
    const source: StatusSource = index === 0 ? "fediverse" : "bluesky";
    if (result.status === "fulfilled") return result.value;

    errors.push({
      source,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    return [];
  });

  statuses.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));

  return {
    fetchedAt: new Date().toISOString(),
    statuses: statuses.slice(0, STATUS_LIMIT),
    ...(errors.length > 0 ? { errors } : {}),
  };
}

async function refreshStatusesCache(request: Request, cache: Cache, cacheKey: Request): Promise<void> {
  const body = await fetchLatestStatuses();
  if (body.statuses.length === 0) return;

  const response = jsonResponse(request, body, { headers: cacheHeaders });
  await cache.put(cacheKey, cacheableResponse(response));
}

async function handleStatuses(request: Request, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const cacheKey = new Request(new URL("/statuses", url.origin), { method: "GET" });
  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    if (isStale(cachedResponse)) {
      ctx.waitUntil(refreshStatusesCache(request, cache, cacheKey).catch(() => undefined));
    }

    return withResponseHeaders(request, cachedResponse);
  }

  const body = await fetchLatestStatuses();
  if (body.statuses.length === 0) {
    return jsonResponse(request, { error: "statuses_unavailable", errors: body.errors ?? [] }, { status: 502 });
  }

  const response = jsonResponse(request, body, { headers: cacheHeaders });
  ctx.waitUntil(cache.put(cacheKey, cacheableResponse(response.clone())));

  return response;
}

async function handleRequest(request: Request, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(request, { error: "method_not_allowed" }, { status: 405 });
  }

  const { pathname } = new URL(request.url);
  if (pathname === "/" || pathname === "/statuses") {
    return handleStatuses(request, ctx);
  }

  return jsonResponse(request, { error: "not_found" }, { status: 404 });
}

export default {
  fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, ctx);
  },
} satisfies ExportedHandler<Env>;
