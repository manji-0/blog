# manj.io blog

Astro + Starlight で構築した個人サイトです。  
ブログ、コーディングメモ、履歴書ページを `docs` コンテンツとして公開しています。

## Stack

- Astro 5
- @astrojs/starlight
- beautiful-mermaid (Mermaid コードブロックをビルド時に SVG 化)

## Site structure

- `src/content/docs/index.md`: トップページ
- `src/content/docs/resume.md`: 履歴書ページ
- `src/content/docs/blog/<year>/`: ブログ記事
- `src/content/docs/coding/`: コーディングメモ
- `src/content/docs/assets/`: 記事内で使う静的アセット
- `src/plugins/remark-beautiful-mermaid.mjs`: Mermaid レンダリング用 remark plugin
- `src/styles/custom.css`: サイト共通の追加スタイル

## Code block rendering

`astro.config.mjs` の `starlight({ expressiveCode: ... })` でコードブロック表示を調整しています。

- dark/light テーマ自動切替
- コントラスト最適化
- デフォルト折り返し (シェル系は折り返し無効)
- 文字サイズ・行間・余白の調整
- コピー操作 UI の調整

## Development

```bash
npm install
npm run dev
```

ローカル起動先: `http://localhost:4321`

## Build

```bash
npm run build
npm run preview
```

ビルド成果物は `dist/` に出力されます。
