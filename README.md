# manj.io blog

Personal site built with Astro + Starlight.
The blog, coding notes, and resume are published as `docs` content.

## Stack

- Astro 7
- @astrojs/starlight
- beautiful-mermaid (renders Mermaid code blocks to SVG at build time)
- [Void](https://void.cloud) in framework mode: `void deploy` builds the Astro app with `@astrojs/cloudflare` and deploys it to Cloudflare Workers

## Site structure

- `src/content/docs/index.md`: top page
- `src/content/docs/resume.md`: resume
- `src/content/docs/blog/<year>/`: blog posts
- `src/content/docs/coding/`: coding notes
- `src/content/docs/assets/`: static assets used in posts
- `src/plugins/remark-beautiful-mermaid.mjs`: remark plugin for Mermaid rendering
- `src/styles/custom.css`: site-wide styles
- `src/pages/`: the NFC card and the routes that render on demand (`/api/*`, `/assets/r2/*`, `/slides/*`)
- `src/server/`: request handlers behind those routes
- `slides/`: Slidev decks
- `void.config.ts`: Worker name, domain, bindings, and the build command `void deploy` runs

## Code block rendering

`starlight({ expressiveCode: ... })` in `astro.config.mjs` tunes code blocks:

- automatic dark/light theme switching
- contrast optimization
- wrapping by default (disabled for shell languages)
- font size, line height, and padding
- copy button UI

## Development

The toolchain (Node.js 26, pnpm, fonttools, SQLite) is pinned by the Nix flake.

```bash
nix develop
pnpm install
pnpm run dev
```

The dev server runs at `http://localhost:4321`.

## Build

```bash
pnpm run build
pnpm run preview
```

The build writes static files to `dist/client/` and the Worker to `dist/server/`.
`pnpm run preview` serves both with workerd.
Put local secrets such as `CARD_KEY` in `.env`, which Git ignores. Void copies them into the preview Worker; it rejects a `.dev.vars` file.

## Deploy

`www.manj.io` is the Worker `manjio` on Cloudflare Workers.
Every page except `/card` is prerendered and served as a static asset; the Worker runs only for the routes below.

```bash
pnpm run check    # Void codegen and TypeScript
pnpm run deploy   # void deploy --platform cloudflare
```

`void deploy` runs `pnpm run build:deploy`, which subsets the fonts, builds the Slidev decks into `public/slides/`, builds the site, and uploads large images to R2.
The R2 upload rewrites image URLs in `dist/client/`, so it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
CI (`.github/workflows/deploy.yml`) deploys on every push to `main`.
Commit `void.lock.json` whenever `void deploy` creates or updates it.

### Routes

| Path | Handler |
|------|---------|
| Prerendered pages and slide assets | Static assets in `dist/client/` |
| `/card` | NFC card profile. 404 unless `?k=` matches the `CARD_KEY` secret |
| `/card/manji0.vcf` | vCard behind the same key, downloaded as `萬治渉.vcf` (fallback `manji0.vcf`) |
| `/assets/r2/*` | R2 proxy |
| `/slides` | Deck manifest JSON |
| `/slides/{deck}/{n}` | Slidev SPA fallback |
| `/api/statuses` | Latest 5 public posts from the Fediverse (`fedi.manji.app`) and Bluesky (`manj.io`) |
| `/api/status/{cloudflare,github}[/status\|/summary\|/incidents]` | Statuspage API proxy, cached for one day |
| `/docs/kamae-*` | 308 to `/projects/kamae-*` via `public/_redirects` |

If one source of `/api/statuses` fails, the route returns the posts it fetched plus an `errors` array. If both fail, it returns `502`.

### NFC business card

```bash
pnpm run card:url                     # generates a key and checks the NTAG215 budget
pnpm exec void secret put CARD_KEY
```

Write the printed URL to the NFC tag. Changing the key makes old tag URLs return 404.
