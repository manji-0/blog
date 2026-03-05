---
title: サイトの現在のデザインについて Astroカスタム編 
description: LINE Seed JPとFira Codeの適用、Light/Darkテーマの調整、URL単独行をビルド時にリンクカード化する実装をまとめる。
---

以下の記事はAIに生成させたもので、内容はまともにチェックされていません。

---

このブログは Astro + Starlight で構築しています。
最近、見た目と記事体験を一気に整えるために、以下の3点をカスタムしました。

1. 本文フォントとコードブロックのフォントを分離
2. Light/Dark それぞれのカラーテーマを再設計
3. URL単独行をビルド時にリンクカードへ変換

この記事では「どこをどう変えると実現できるか」を、実際の構成に沿って整理します。

## 前提: どこで設定するか

カスタムの入口は `astro.config.mjs` です。

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

ポイントは以下です。

- Markdown変換時の挙動は `remarkPlugins` に寄せる
- 見た目は `customCss` に寄せる
- OGPメタ注入のようなHTMLヘッダ操作は route middleware で行う

## 1. フォント設定: 本文はLINE Seed JP、コードはFira Code

本文側は `--sl-font-system`、コードブロック側は `--sl-font-code-block` として分離しています。

```css
@import url('https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;500;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap');

:root {
  --sl-font-system: 'LINE Seed JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI',
    'Yu Gothic', Meiryo, 'Segoe UI', system-ui, -apple-system, sans-serif;
  --sl-font-code-block: 'Fira Code', var(--__sl-font-mono);
}

.sl-markdown-content .expressive-code {
  --ec-codeFontFml: var(--sl-font-code-block);
}
```

Starlight のコードブロックは Expressive Code を使っているので、`--ec-codeFontFml` を指定するのが効きます。

### リガチャを有効化する

`Fira Code` の見た目を活かすために、コードブロックだけリガチャをONにしています。

```css
.sl-markdown-content .expressive-code pre > code,
.sl-markdown-content .expressive-code .ec-line .code {
  font-variant-ligatures: common-ligatures contextual;
  font-feature-settings: 'liga' 1, 'clig' 1, 'calt' 1;
}
```

`=>` や `!=` のような記号連続が読みやすくなるので、視認性の改善効果が高いです。

## 2. カラーテーマ: Light/Darkを別思想で設計

配色は `src/styles/custom.css` のCSS変数でまとめて管理しています。

- Darkテーマ: Zenn系の落ち着いた配色をベースに、青の主張を少し弱める
- Lightテーマ: atom-toro-syntax / One Light系の紙っぽいトーン

実装上は `:root` をDark、`:root[data-theme='light']` をLightとして切り替えています。

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

CSS変数だけでほぼ全体のトーンを統制できるので、コンポーネント単位で色をベタ書きしなくて済みます。

## 3. URL単独行をリンクカード化する（ビルド時）

Markdown内で URL だけの行を置くと、`remark-link-card` がカードHTMLに置換します。

```md
https://astro.build/
```

実装の流れは次のとおりです。

1. paragraph ノードが URL単独行か判定
2. URLに `fetch` してメタ情報を取得
3. `og:title` / `twitter:title` / `<title>` などからタイトルを決定
4. `type: 'html'` ノードとしてカードDOMに置換

```js
// src/plugins/remark-link-card.mjs (抜粋)
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

メタ取得に失敗してもフォールバックがあり、最低限 `hostname` を使って表示できます。
つまり「外部サイト側の都合で壊れても記事が崩れにくい」構成です。

### カードの見た目はCSSで管理

生成されるDOMは `.link-card` 系のクラスを持つので、見た目は普通のCSSで調整できます。

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

## 補足: OGP画像とTwitterカードの固定

記事ページ向けには、ビルド後フックで OGP画像（1200x840）を生成しています。
さらに route middleware 側で `twitter:card` を `summary_large_image` に固定しています。

```js
// src/starlight/og-image-middleware.mjs
removeMeta(route.head, 'name', 'twitter:card');
tags.push({ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } });
```

はてなブックマーク対策として縦840px生成にしつつ、主要コンテンツは縦630px内に収める設計にしています。

## まとめ

Astro/Starlight のカスタムは、責務ごとに置き場所を分けると管理しやすくなります。

- Markdown変換: `remarkPlugins`
- 見た目: `custom.css`
- メタタグ制御: route middleware
- 画像生成: integration の build hook

この分離を守ると、あとで配色やカードデザインを変えるときも影響範囲が読みやすいです。
