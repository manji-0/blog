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
---

# Slidev on Cloudflare Workers

小さなサンプルデッキ

<div class="pt-12 text-xl opacity-80">
  www.manj.io/slides 向けの基盤
</div>

---
layout: center
---

# 2枚目

- Slidev で Markdown からスライドを生成
- `slidev build` で静的 SPA を出力
- Worker が `/slides/{deck-id}/` 以下を配信

---
layout: center
---

# 3枚目

ディープリンク `/slides/sample/3` も SPA フォールバックで表示される

```ts
export function greet(name: string) {
  return `Hello, ${name}!`
}
```
