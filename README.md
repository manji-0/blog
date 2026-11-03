# manj.io blog

Personal site built with Astro + Starlight.
The blog, coding notes, and resume are published as `docs` content.

## Stack

- Astro 6
- @astrojs/starlight
- beautiful-mermaid (renders Mermaid code blocks to SVG at build time)
- [Void](https://void.cloud) (serves the built site and its API routes on Cloudflare Workers)

## Site structure

- `src/content/docs/index.md`: top page
- `src/content/docs/resume.md`: resume
- `src/content/docs/blog/<year>/`: blog posts
- `src/content/docs/coding/`: coding notes
- `src/content/docs/assets/`: static assets used in posts
- `src/plugins/remark-beautiful-mermaid.mjs`: remark plugin for Mermaid rendering
- `src/styles/custom.css`: site-wide styles
- `slides/`: Slidev decks
- `site-worker/`: Void app that serves the site, decks, and `/api/*`

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

The build output goes to `dist/`.

## Deploy

`www.manj.io` is deployed to Cloudflare Workers as a Void app (`site-worker/`).
The same Worker serves the latest Fediverse and Bluesky posts and the Cloudflare and GitHub Status proxies under `/api/*`.

```bash
pnpm run cf:deploy:local   # build and assemble (includes the R2 upload)
pnpm --filter site-worker run preview
pnpm run cf:deploy         # deploy with Void
```

Slidev decks live in `slides/` and are built into `site-worker/public/slides/`.
See `site-worker/README.md` for routes and deployment details.
