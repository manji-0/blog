# Site Worker

Deploys `www.manj.io` to Cloudflare Workers as a [Void](https://void.cloud) app.

`public/` collects the Astro build and the Slidev decks. The handlers in `routes/` (R2 image proxy, NFC business card, slides, and APIs) ship with them in one Worker.

## Build and deploy

```bash
pnpm run cf:deploy
```

Steps:

1. `pnpm run build`: Astro → `dist/`
2. `pnpm run r2:upload-assets`: uploads large images to R2 and rewrites the HTML in `dist/`
3. `pnpm --filter site-worker run assemble`: copies `dist/` to `site-worker/public/` and moves the card page to `site-worker/private/card/`
4. `pnpm --filter slides run build`: Slidev → `site-worker/public/slides/`
5. `pnpm --filter site-worker run deploy`: `void deploy --platform cloudflare`, which runs `vite build`

CI (`.github/workflows/deploy.yml`) runs the same steps with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Commit `void.lock.json` whenever `void deploy` creates or updates it.

## Local preview

```bash
pnpm run cf:deploy:local   # up to assemble
pnpm --filter site-worker run build
pnpm --filter site-worker run preview
```

Put local values such as `CARD_KEY` in `site-worker/.env`, which Git ignores.

## NFC business card

```bash
pnpm run card:url                                    # generates a key and checks the NTAG215 budget
pnpm --filter site-worker exec void secret put CARD_KEY
```

Write the printed URL to the NFC tag. Changing the key makes old tag URLs return 404.

## Routes

Void runs the Worker for every request (`run_worker_first: ["/**"]`), but it serves a file that exists in `public/` before any route runs.
The key-gated card therefore stays out of `public/`; `src/card.ts` bundles it into the Worker.

| Path | Handler |
|------|---------|
| Static files (Astro, slide assets) | `public/` |
| `/assets/r2/*` | R2 proxy (`routes/assets/r2/[...key].ts`) |
| `/card` | NFC card profile. 404 unless `?k=` matches the `CARD_KEY` secret |
| `/card/manji0.vcf` | vCard behind the same key, downloaded as `萬治渉.vcf` (fallback `manji0.vcf`) |
| `/slides` | Deck manifest JSON |
| `/slides/{deck}/{n}` | Slidev SPA fallback |
| `/api/statuses` | Latest 5 public posts from the Fediverse (`fedi.manji.app`) and Bluesky (`manj.io`) |
| `/api/status/cloudflare[/status\|/summary\|/incidents]` | Cloudflare Status API proxy, cached for one day |
| `/api/status/github[/status\|/summary\|/incidents]` | GitHub Status API proxy, cached for one day |
| `/docs/kamae-*` | 308 to `/projects/kamae-*` via `_redirects` |

If one source of `/api/statuses` fails, the route returns the posts it fetched plus an `errors` array. If both fail, it returns `502`.
