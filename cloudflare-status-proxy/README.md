# Cloudflare Status Proxy

<!-- derived-from ../github-status-proxy/README.md -->

Cloudflare Workers proxy for the Cloudflare Status API.

## Endpoints

- `GET /`
- `GET /status`
- `GET /summary`
- `GET /incidents`

`/` and `/status` return `https://www.cloudflarestatus.com/api/v2/status.json`.
`/summary` and `/incidents` return their matching Cloudflare Status API payloads.
Successful responses are cached at the edge for one day.

## Local Development

```bash
npm install
npm run types
npm run dev
```

## Deploy

```bash
npm run deploy
```

The GitHub Actions workflow expects these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
