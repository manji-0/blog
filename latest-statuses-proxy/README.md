# latest-statuses-proxy

Cloudflare Worker API for `manj.io` latest statuses.

## Endpoints

- `GET /`
- `GET /statuses`

Both endpoints return recent public statuses from:

- `https://fedi.manji.app/users/manji0/statuses`
- `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=manj.io`

Responses are normalized to:

```json
{
  "fetchedAt": "2026-06-04T00:00:00.000Z",
  "statuses": [
    {
      "id": "bluesky:at://...",
      "source": "bluesky",
      "url": "https://bsky.app/profile/manj.io/post/...",
      "created_at": "2026-06-04T00:00:00.000Z",
      "text": "..."
    }
  ]
}
```

If one upstream fails, the Worker returns the statuses it could fetch plus an
`errors` array. If both upstreams fail, it returns `502`.
