---
title: mkdocsでブログを作ってみる
description: mkdocs便利 分かりやすい 最高
---

# mkdocsでブログを作ってみる

仕事で[mkdocs](https://www.mkdocs.org/)を触ってて、ブログのテンプレートとしてもかなり優秀なんじゃないかと感じたので早速自分のブログを作り直してみた。1年に2回くらい作り直してんなこいつ。

## ザックリとした構成
* Theme: `mkdocs-material`
* Features:
    - `navigation.expand`
    - `navigation.top`
    - `search.highlight`
* Plugins:
    - `search`
    - `markdownextradata`
* Markdown Extentions:
    - `toc`
    - `meta`
    - `mdx_include`
    - `mdx_math`
    - `admonition`
    - `codehilite`
    - `def_list`
    - `extra`
    - `footnotes`
    - `fontawesome_markdown`
    - `pymdownx.critic`
    - `pymdownx.caret`
    - `pymdownx.keys`
    - `pymdownx.mark`
    - `pymdownx.tilde`
    - `pymdownx.smartsymbols`
    - `pymdownx.superfences`
    - `pymdownx.tabbed`
    - `pymdownx.tasklist`

## mkdocs-material
`mkdocs`が便利というより`mkdocs-material`が超便利なんですよね。とても沢山機能がある。

<div class="blog-card" style="padding:12px;margin:15px 0;border:1px solid #ddd;word-wrap:break-word;width:auto;border-radius:5px;"><div class="blog-card-thumbnail" style="float:left;"><a href="https://squidfunk.github.io/mkdocs-material/" class="blog-card-thumbnail-link" target="_blank"><img src="http://capture.heartrails.com/120x120/shorten?https://squidfunk.github.io/mkdocs-material/" class="blog-card-thumb-image wp-post-image" alt="12436288584_94d6bc46d2_b.jpg" style="width:100px;height:100px;"></a></div><div class="blog-card-content" style="margin-left:110px;line-height:120%;"><div class="blog-card-title" style="margin-bottom:5px;"><a href="%url%" class="blog-card-title-link" style="font-weight:bold;text-decoration:none;color:#111;" target="_blank">Material for MkDocs - Material for MkDocs</a></div><div class="blog-card-excerpt" style="color:#333;font-size:90%;">Material for MkDocs - Material for MkDocs</div></div><div class="blog-card-footer" style="font-size:70%;color:#777;margin-top:10px;clear:both;"><span class="blog-card-hatena"><a href="http://b.hatena.ne.jp/entry/https://squidfunk.github.io/mkdocs-material/" target="_blank"><img border="0" src="https://b.hatena.ne.jp/entry/image/https://squidfunk.github.io/mkdocs-material/" border="0" alt="" /></a></span></div></div>

* 検索機能がついてる(static siteで動くし結構早い)
* CSS, JS, HTMLをoverrideできる
    * 色とかフォントを弄ったり
    * `head.meta` をゴリゴリに調整したり
    * 追加のWebFontを読み込むようにしたり(`FontAwsome`とか)

自分がカスタムしたのは以下。

### `meta`タグをちゃんとつけた
ちゃんとつけないとTwitterとかにリンク貼ったときの見た目が悪いので...

<script src="https://gist.github.com/manji-0/523b98ddf5f6120c307dcd350339825a.js"></script>

`og:image`は適当。記事ファイル内で`image`を設定してないときはマジ卍な自画像が出るようになっている。

### 見出しとかフォントの調整
デザインは自分の好み、フォントはAppleユーザ以外をバッサリ切り捨てている。

```css
:root {
  --md-text-font-family: "Helvetica Neue", "Hiragino Sans"; 
  --md-code-font-family: "Menlo";
}

.md-typeset h1 {
  font-weight: 600;
}

.md-typeset h2 {
  font-weight: 500;
  padding: 0.2em 0em;
  border-bottom: solid 3px rgba(0, 82, 153, 0.728);
}

.md-typeset h3 {
  font-weight: 500;
  position: relative;
  padding-left: 1.3em;
  line-height: 1.4;
}

.md-typeset h3:before {
  font-family: "FontAwesome";
  content: "\f00c";
  font-weight: 900;
  position: absolute;
  font-size: 1em;
  left: 0;
  top: 0;
  color: rgba(0, 61, 153, 0.776);
  font-weight: 900;
}
```
`FontAwesome`を読み込むために`mkdocs.yml`内でcssを追加で読むようにしている。

```yaml
extra_css:
- "https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css"
```

### テーブルをソートできるようにする
公式ドキュメントでも解説されてたカスタム。便利なときもあるかもしれないし、邪魔になるわけでもないので入れてみた。

<div class="blog-card" style="padding:12px;margin:15px 0;border:1px solid #ddd;word-wrap:break-word;width:auto;border-radius:5px;"><div class="blog-card-thumbnail" style="float:left;"><a href="https://squidfunk.github.io/mkdocs-material/reference/data-tables/?h=table#sortable-tables" class="blog-card-thumbnail-link" target="_blank"><img src="http://capture.heartrails.com/120x120/shorten?https://squidfunk.github.io/mkdocs-material/reference/data-tables/?h=table#sortable-tables" class="blog-card-thumb-image wp-post-image" alt="12436288584_94d6bc46d2_b.jpg" style="width:100px;height:100px;"></a></div><div class="blog-card-content" style="margin-left:110px;line-height:120%;"><div class="blog-card-title" style="margin-bottom:5px;"><a href="%url%" class="blog-card-title-link" style="font-weight:bold;text-decoration:none;color:#111;" target="_blank">Data tables - Material for MkDocs</a></div><div class="blog-card-excerpt" style="color:#333;font-size:90%;">Data tables - Material for MkDocs</div></div><div class="blog-card-footer" style="font-size:70%;color:#777;margin-top:10px;clear:both;"><span class="blog-card-hatena"><a href="http://b.hatena.ne.jp/entry/https://squidfunk.github.io/mkdocs-material/reference/data-tables/?h=table#sortable-tables" target="_blank"><img border="0" src="https://b.hatena.ne.jp/entry/image/https://squidfunk.github.io/mkdocs-material/reference/data-tables/?h=table#sortable-tables" border="0" alt="" /></a></span></div></div>

| value | mod 3 | mod 4 |
| --- | --- | --- |
| 010 | 1 | 2 |
| 029 | 2 | 1 |
| 111 | 0 | 3 |

みたいな感じ。

## まとめ
簡単でデザインもスッキリしててカスタムもかなり柔軟性が高くて検索ができる、便利。

なんとなくホスト先を AWS Amplify にしてみたけど、Vercelと違って有料なので、ちょっとだけ心配している。爆発しねえよな...?
