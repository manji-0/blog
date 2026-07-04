# Slidev deck reference (manj.io)

## deck-id naming

| パターン | 例 |
|----------|-----|
| 日付 + イベント | `2026.07.03_kyoto_univ` |
| 日付 + トピック | `2026.11.15_dagayn_intro` |

## Shared layout system

全デッキ共通のレイアウト資産（`slides/` 直下）:

| パス | 内容 |
|------|------|
| `components/AgendaToc.vue` | 章番号付きアジェンダ |
| `styles/manjio.css` | seriph 向けレイアウト調整 |
| `decks/{id}/setup/main.ts` | 上記 CSS を import（テンプレート同梱） |

デッキ固有のコンポーネントは `slides/decks/{deck-id}/components/` に置く（Slidev auto-import）。

## Layout guide

### cover — 表紙

```md
---
layout: cover
background: ./public/cover.jpg   # 任意
---

# タイトル

サブタイトル

<div class="pt-12 text-xl opacity-80">
  発表者 / 日付
</div>
```

### toc-slide + AgendaToc — アジェンダ

```md
---
class: toc-slide
---

# アジェンダ

<AgendaToc
  :current="1"
  :items="[
    { n: 1, title: '章タイトル', sub: 'キーワード, キーワード' },
    { n: 2, title: '章タイトル 2', sub: '…' },
  ]"
/>
```

- `:current` — ハイライトする章番号（章切替スライドで更新）
- `:items` — `{ n, title, sub? }[]`（`sub` は省略可）

章の途中で再度 TOC を出す場合は `:current` だけ変える。

### center — 本文（基本形）

```md
---
layout: center
---

# 見出し

- 箇条書き 3〜5 行
- 1スライド 1トピック
```

`manjio.css` により H1 は左寄せ・2rem。

### statement — 区切り・強調

```md
---
layout: statement
---

# 聴衆に残したい一文
```

コードや長い箇条書きは避ける。

### default — コード

frontmatter なし、または `layout: default` で shiki ハイライトのコードブロック向け。

## Directory extras

### `public/` — static assets

```
slides/decks/{deck-id}/public/diagram.png
```

Markdown:

```md
![diagram](./diagram.png)
```

### `components/` — deck-local Vue SFC

```
slides/decks/{deck-id}/components/MyChart.vue
```

```md
<MyChart :data="points" />
```

## Progressive disclosure

```md
---
clicks: 2
---

# 段階表示

<v-clicks>

- 1つ目
- 2つ目

</v-clicks>
```

## Speaker notes

```md
---
---

# スライド

<!--
発表メモ: ここに話す内容
-->
```

## Manifest after build

`pnpm --filter slides run build` 後:

- `site-worker/public/slides/manifest.json` — デッキ一覧
- `GET /slides` — manifest JSON（Worker）

## Troubleshooting

| 症状 | 対処 |
|------|------|
| ビルドで deck が見つからない | `slides/decks/{id}/slides.md` のパスを確認 |
| `AgendaToc` が unknown component | `pnpm --filter slides run build` を `slides/` cwd で実行しているか確認 |
| 画像 404 | `public/` 相対パスか確認。ビルド後 hashed 名になるのは正常 |
| `/slides/{id}/3` が 404 | `pnpm --filter site-worker run dev` で Worker SPA フォールバックを確認 |
| フォントが違う | frontmatter `fonts:` を確認 |
