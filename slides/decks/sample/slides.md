---
theme: seriph
colorSchema: light
title: Slidev Sample Deck
info: |
  ## Slidev Sample Deck
  Cloudflare Worker 配信の動作確認用
class: text-center
drawings:
  persist: false
transition: false
routerMode: history
fonts:
  sans: Noto Serif JP
  serif: Noto Serif JP
  mono: PT Mono
---

---
layout: cover
---

# Slidev on Cloudflare Workers

manj.io スライド基盤のサンプルデッキ

<div class="pt-12 text-xl opacity-80">
  www.manj.io/slides
</div>

---
class: toc-slide
---

# アジェンダ

<AgendaToc
  :current="1"
  :items="[
    { n: 1, title: '基盤と配信', sub: 'Slidev, Worker, ディープリンク' },
    { n: 2, title: 'レイアウト', sub: 'cover, toc, center, statement' },
    { n: 3, title: 'まとめ', sub: 'テンプレートの使い方' },
  ]"
/>

---
layout: center
---

# 基盤と配信

- Slidev で Markdown からスライドを生成
- `slidev build` で静的 SPA を出力
- Worker が `/slides/{deck-id}/` 以下を配信

---
layout: statement
---

# 1スライド = 1メッセージ

---
layout: center
---

# コード例

ディープリンク `/slides/sample/5` も SPA フォールバックで表示される

```ts
export function greet(name: string) {
  return `Hello, ${name}!`
}
```

---
layout: center
---

# まとめ

- 共有コンポーネント: `slides/components/AgendaToc.vue`
- 共有スタイル: `slides/styles/manjio.css`
- 新規デッキ: `.cursor/skills/create-slidev-deck/template/slides.md`

<div class="pt-8 text-lg opacity-70">
  ご清聴ありがとうございました
</div>
