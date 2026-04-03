---
title: Astro/Starlightでフォント・配色テーマ・リンクカードをカスタムする
description: LINE Seed JPとFira Code、Light/Dark配色、URL単独行のリンクカード化をAstro/Starlightでまとめてやってみた。
sidebar:
  order: 4
---

以下はAIに自分の文体を学習させて一発生成した記事であり、まともにレビューされていません。

---

このブログは Astro + Starlight で動いてるんですが、最近また見た目周りを大きめに触りました。

やったことは以下の3つ。

1. 本文フォントとコードフォントを分離（LINE Seed JP + Fira Code）
2. Light / Dark それぞれの配色を作り直し
3. URL単独行をビルド時にリンクカードへ変換

「どこを触ると実現できるのか」を、実装ファイルの場所付きでメモしておきます。

## まず、どこで設定するか

入口は `astro.config.mjs` です。

- Markdown変換時の挙動: `markdown.remarkPlugins`
- 見た目の調整: `starlight({ customCss: [...] })`
- headのmeta調整: `routeMiddleware`
- ビルド時の画像生成: integration

今の構成はざっくりこんな感じ。

```js
// astro.config.mjs
export default defineConfig({
  markdown: {
    remarkPlugins: [remarkBeautifulMermaid, remarkLinkCard],
  },
  integrations: [
    ogImageBuildIntegration(),
    starlight({
      customCss: ['./src/styles/custom.css'],
      routeMiddleware: ['./src/starlight/og-image-middleware.mjs'],
    }),
  ],
});
```

この分離にしておくと、後で配色だけ変えたいとか、カード生成だけ止めたいとかがやりやすいです。

## 1. フォント: 本文はLINE Seed JP、コードはFira Code

フォントは `src/styles/custom.css` で管理しています。

```css
@import url('https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;500;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap');

:root {
  --sl-font-system: 'LINE Seed JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI',
    'Yu Gothic', Meiryo, 'Segoe UI', system-ui, -apple-system, sans-serif;
  --sl-font-code-block: 'Fira Code', var(--__sl-font-mono);
}
```

Starlight のコードブロックは Expressive Code 側の変数を触るのが効くので、`--ec-codeFontFml` を指定しています。

```css
.sl-markdown-content .expressive-code {
  --ec-codeFontFml: var(--sl-font-code-block);
}
```

### リガチャの有効化

せっかく Fira Code を入れるなら、`=>` や `!=` の見た目も活かしたいのでリガチャをONにしています。

```css
.sl-markdown-content .expressive-code pre > code,
.sl-markdown-content .expressive-code .ec-line .code {
  font-variant-ligatures: common-ligatures contextual;
  font-feature-settings: 'liga' 1, 'clig' 1, 'calt' 1;
}
```

本文側は可読性優先でLINE Seed JP、コード側は視認性優先でFira Code、という切り分けです。

## 2. カラーテーマ: Light / Darkを別思想で作る

配色は同じく `src/styles/custom.css` のCSS変数で管理しています。

- Dark: Zennっぽい落ち着いた系をベースにしつつ、青の主張は少し弱める
- Light: atom-toro-syntax / One Light寄りの紙っぽいトーン

実装としては `:root` をDark、`:root[data-theme='light']` をLightにして切り替えています。

```css
:root {
  --sl-color-accent: hsl(210, 72%, 62%);
  --sl-color-bg: hsl(222, 14%, 9%);
  /* ... */
}

:root[data-theme='light'],
[data-theme='light'] ::backdrop {
  --sl-color-accent: hsl(217, 67%, 53%);
  --sl-color-bg: hsl(42, 45%, 98%);
  /* ... */
}
```

このやり方だと、コンポーネント単位で色を散らさずに済むので、あとからの調整がかなり楽です。

## 3. URL単独行をビルド時にリンクカード化する

Markdown内でURLだけ書いた段落を、`remark-link-card` でカードHTMLに置換しています。

```md
https://astro.build/
```

処理の流れはこうです。

1. paragraphノードが「URL単独行」か判定
2. URLへ `fetch` してメタ情報を取得
3. `og:title` / `twitter:title` / `<title>` などから表示情報を決定
4. `type: 'html'` ノードに置換

実際の実装は `src/plugins/remark-link-card.mjs`。

```js
visit(tree, 'paragraph', (node, index, parent) => {
  const url = getStandaloneUrl(node);
  if (!url) return;
  targets.push({ parent, index, url });
});

const metadata = await getMetadata(target.url, settings, metadataCache);
target.parent.children[target.index] = {
  type: 'html',
  value: toCardHtml(metadata),
};
```

取得に失敗したときは `hostname` でフォールバックするようにしてるので、外部サイトのメタが壊れてても記事全体は壊れにくいです。

### カードの見た目はCSS側で調整

カードDOMは `.link-card` 系クラスを持ってるので、見た目は普通のCSSで調整できます。

```css
.link-card {
  display: flex;
  border: 1px solid var(--sl-color-hairline);
  border-radius: 0.75rem;
  overflow: hidden;
}

@media (max-width: 640px) {
  .link-card {
    flex-direction: column;
  }
}
```

実際のカード化サンプル（この行はコードブロックではなく、URL単独行です）:

https://astro.build

## 補足: OGP画像とTwitterカード

ついでにSNS向けの調整も入れてます。

- OGP画像はビルド後フックで自動生成（1200x840）
- 主要コンテンツは縦630px内に収める
- `twitter:card` は `summary_large_image` に固定

`twitter:card` の固定は `src/starlight/og-image-middleware.mjs` でやっています。

```js
removeMeta(route.head, 'name', 'twitter:card');
tags.push({ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } });
```

OGP画像の生成処理は `src/integrations/astro-og-image-build.mjs` にまとめてあります。

## まとめ

Astro/Starlight のカスタム、触る箇所が分かれてるので最初は散らかって見えるんですが、

- Markdown変換は remark plugin
- 見た目は custom.css
- headメタは middleware
- 生成処理は integration

みたいに責務で分けると急に管理しやすくなります。

このあたりは今後も微調整すると思うので、また崩したら追記します。
