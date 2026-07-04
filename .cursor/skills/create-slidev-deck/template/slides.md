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

---
layout: cover
---

# プレゼンタイトル

サブタイトルやイベント名

<div class="pt-12 text-xl opacity-80">
  発表者名 / YYYY年M月D日
</div>

---
class: toc-slide
---

# アジェンダ

<!--
items を章構成に合わせて編集する。
:current は現在の章番号（このスライドが属する章）。
-->

<AgendaToc
  :current="1"
  :items="[
    { n: 1, title: '章タイトル 1', sub: 'キーワード, キーワード' },
    { n: 2, title: '章タイトル 2', sub: 'キーワード, キーワード' },
    { n: 3, title: 'まとめ', sub: '結論, Q&A' },
  ]"
/>

---
layout: center
---

# 本題（章 1）

- 要点を箇条書き（3〜5 行）
- 図は `./public/` 配下に置く

```ts
export function example(): string {
  return 'Slidev on manj.io'
}
```

---
layout: statement
---

# 区切りの一文 — 聴衆に残したいメッセージ

---
layout: center
---

# 本題（章 2）

- 2章目の内容
- `layout: center` が本文の基本形

---
class: toc-slide
---

# アジェンダ

<AgendaToc
  :current="2"
  :items="[
    { n: 1, title: '章タイトル 1', sub: 'キーワード, キーワード' },
    { n: 2, title: '章タイトル 2', sub: 'キーワード, キーワード' },
    { n: 3, title: 'まとめ', sub: '結論, Q&A' },
  ]"
/>

---
layout: center
---

# まとめ

- 結論 1
- 結論 2

<div class="pt-8 text-lg opacity-70">
  ご清聴ありがとうございました
</div>
