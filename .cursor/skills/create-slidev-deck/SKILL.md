# Create Slidev Deck (manj.io)

Slidev デッキを `slides/decks/{deck-id}/` に追加し、Cloudflare Worker 経由で `/slides/{deck-id}/` として配信する。

## Quick workflow

1. **deck-id を決める** — `YYYY.MM.DD_topic` 形式（例: `2026.07.03_kyoto_univ`）
   - 小文字英数字と `_` のみ
   - URL になる: `https://www.manj.io/slides/{deck-id}/`
2. **デッキディレクトリを作る** — `slides/decks/{deck-id}/` に以下を配置
   - `slides.md` — [template/slides.md](template/slides.md) をコピー
   - `setup/main.ts` — [template/setup/main.ts](template/setup/main.ts) をコピー（未配置なら build が自動生成）
3. **画像** — `slides/decks/{deck-id}/public/` に置く（`./photo.png` で参照）
4. **カスタム Vue コンポーネント** — デッキ固有は `components/`、横断共有は `slides/components/`（後述）
5. **プレビュー**
   ```bash
   pnpm --filter slides exec slidev decks/{deck-id}/slides.md --open
   ```
6. **ビルド確認**
   ```bash
   pnpm --filter slides run build
   ```
7. **Worker で確認**（site-worker が assemble 済みの場合）
   ```bash
   pnpm --filter site-worker run dev
   # http://127.0.0.1:8788/slides/{deck-id}/
   ```

## Repository layout

```
slides/
  styles/manjio.css      # レイアウト上書き（toc-slide, center h1 など）
  components/
    AgendaToc.vue        # アジェンダ TOC（全デッキで auto-import）
  decks/
    {deck-id}/
      slides.md          # 必須 — Slidev エントリ
      setup/main.ts      # 共有 CSS 読み込み（テンプレート同梱、未作成時は build が生成）
      public/            # 任意 — 画像・PDF など
      components/        # 任意 — デッキ固有 Vue SFC
  scripts/build.mjs      # 全デッキをビルド
  package.json           # @slidev/cli, theme-seriph
site-worker/public/slides/   # ビルド成果物（gitignore、編集しない）
```

`slides/` を cwd にして `slidev build decks/{id}/slides.md` すると、`slides/components/` が全デッキから auto-import される。CSS は各デッキの `setup/main.ts` 経由（テンプレートに同梱）。

## Layout template（講義・発表向け）

| 順序 | layout / class | 用途 |
|------|----------------|------|
| 1 | `layout: cover` | 表紙 |
| 2 | `class: toc-slide` + `<AgendaToc>` | アジェンダ |
| 3+ | `layout: center` | 本文（基本形） |
| 区切り | `layout: statement` | 強調1文 |
| 章切替 | `class: toc-slide` + `:current="N"` | 進行中の章をハイライト |

詳細は [reference.md](reference.md) の Layout guide を参照。

## Frontmatter defaults

テンプレートに含まれる既定値:

```yaml
---
theme: seriph
colorSchema: light
title: プレゼンタイトル
info: |
  ## プレゼンタイトル
  イベント名 (YYYY-MM-DD)
class: text-center
drawings:
  persist: false
transition: false
routerMode: history
duration: 60min
fonts:
  sans: Noto Serif JP
  serif: Noto Serif JP
  mono: PT Mono
---
```

よく使う per-slide frontmatter:

| キー | 用途 |
|------|------|
| `layout: center` | 中央寄せスライド（本文） |
| `layout: cover` | 表紙 |
| `layout: statement` | 強調1文 |
| `class: toc-slide` | TOC 用（`AgendaToc` と併用） |
| `layout: cover` + `background: ./public/…` | 背景画像付き表紙 |
| `duration: 90min` | プレゼンタイマー |
| `clicks: N` | 段階表示（v-click） |

## Slide authoring rules

- スライド区切りは `---`（horizontal rule）
- スピーカーノートは `<!-- ここにノート -->` または Slidev の note 記法
- コードブロックは shiki ハイライト（`twoslash` は重いので必要時のみ frontmatter で有効化）
- 日本語本文は問題なし。フォントは frontmatter `fonts:` + Google Fonts（ビルド時取得）
- 外部 URL の画像は避け、可能なら `public/` に同梱（オフライン・安定配信）

## Build & deploy

| コマンド | 作用 |
|----------|------|
| `pnpm --filter slides run build` | 全デッキ → `site-worker/public/slides/` + `manifest.json` |
| `pnpm run cf:deploy:local` | Astro + assemble + slides ビルド |
| `pnpm run cf:deploy` | 上記 + Worker デプロイ |

ビルドは `--base /slides/{deck-id}/` を自動設定する。手動で base を変えない。

## Checklist before finishing

- [ ] `slides/decks/{deck-id}/slides.md` が存在する
- [ ] deck-id が既存デッキと重複していない（`slides/decks/` を確認）
- [ ] `pnpm --filter slides run build` が成功する
- [ ] ローカル or workers.dev で `/slides/{deck-id}/` と深いリンク `/slides/{deck-id}/2` を確認
- [ ] `site-worker/public/` を直接編集していない（常に build 経由）

## Do not

- `site-worker/public/slides/` を手編集しない（生成物）
- deck-id に `/` やスペースを含めない
- Pages 向け `_redirects` をデッキに足さない（Worker が SPA フォールバックを担当）

## Additional resources

- 詳細 frontmatter・コンポーネント: [reference.md](reference.md)
- サンプルデッキ: `slides/decks/sample/slides.md`
- 配信アーキテクチャ: `site-worker/README.md`
