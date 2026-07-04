# Site Worker

`www.manj.io` を Cloudflare Workers Static Assets で配信する。

Astro の静的ビルド成果物、Slidev デッキ、R2 画像プロキシを 1 本の Worker にまとめる。

## ビルドとデプロイ

```bash
pnpm run cf:deploy
```

手順:

1. `pnpm run build` — Astro → `dist/`
2. `pnpm run r2:upload-assets` — 大きい画像を R2 へ、`dist/` の HTML を書き換え
3. `pnpm --filter site-worker run assemble` — `dist/` を `site-worker/public/` に統合
4. `pnpm --filter slides run build` — Slidev → `site-worker/public/slides/`
5. `pnpm --filter site-worker run deploy`

## ローカル確認

```bash
pnpm run cf:deploy:local   # assemble まで
pnpm --filter site-worker run dev
```

## Worker が担うルート

| パス | 処理 |
|------|------|
| 静的ファイル (Astro / slides assets) | ASSETS binding (自動) |
| `/assets/r2/*` | R2 プロキシ (`run_worker_first`) |
| `/slides` | デッキ manifest JSON |
| `/slides/{deck}/{n}` | Slidev SPA フォールバック |
| `/docs/kamae-*` | `_redirects` で `/projects/kamae-*` へ 308 |
