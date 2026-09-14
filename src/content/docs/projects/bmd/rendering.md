---
title: "レンダリング"
description: "bmd のMermaid・画像・端末フォールバック"
sidebar:
  order: 10
---

このページは、bmdのMarkdownレンダリングパイプライン、Mermaid描画、端末別フォールバックを扱います。利用手順は [使い方](/projects/bmd/usage/) へ。キー操作は [キーバインド](/projects/bmd/keybindings/) へ。

## パイプライン概要

```text
src/
├── main.rs           # エントリと端末初期化
├── app/              # ループ、入力、描画、ナビ
├── domain/           # ドメインモデルと型付き状態遷移
├── parse/            # pulldown-cmark → ドメイン
├── render/           # ドメイン → ratatui
├── config.rs         # config.toml
├── keymap.rs         # モード別キー
├── browser.rs        # OSでリンクを開く
└── error.rs
```

pulldown-cmarkでMarkdownをドメインモデルに変換し、ratatuiでTUIに描画します。コードブロックはsyntectでハイライトします。編集やチェックボックスのファイル書き戻しは行いません。

## Mermaid描画

Mermaidコードブロックは [merman](https://crates.io/crates/merman) でラスター化します。外部のNode CLIやブラウザランタイムは要りません。

| 端末 | 描画方式 |
| --- | --- |
| Kitty、Ghostty、iTerm2、WezTerm等 | グラフィックスプロトコルでインライン表示 |
| その他 | Unicodeハーフブロックにフォールバック |

Previewモードでは `+` / `-` / `0` でズーム、`Esc` / `o` で閉じます。Mermaidブロック由来のリンクは `o` / `Enter` で描画プレビューを開きます。

## 画像プレビュー

`![alt](path.png)` 形式の画像はratatui-imageでフローティングプレビューします。グラフィックス対応端末で見た目が最も良くなります。

## タスクリスト

チェックボックスはセッション内でのトグルのみです。`x` キーまたは左クリックで切り替えますが、Markdownファイルへは書き戻しません。マーカー表示は `BMD_CHECKLIST_STYLE` または [設定](/projects/bmd/configuration/) の `auto` / `unicode` / `emoji` で選べます。

## リンク処理

| 種類 | 例 | 動作 |
| --- | --- | --- |
| Web | `[text](https://…)` | OSのブラウザで開く |
| Anchor | `[text](#section)` | 見出しへジャンプ（履歴スタックあり） |
| Document | `[text](./other.md)` | 同ビューで開く（ファイルスタック） |
| Image | `![alt](path.png)` | フローティングプレビュー |
| Mermaid | mermaidコードブロック | 描画プレビュー |

`O` はプレビュー閉鎖とナビ戻りの両方に使います。アンカーと文書ナビが両方あるときはアンカーが優先されます。

## 主要依存

| 目的 | クレート |
|---|---|
| TUI | ratatui、crossterm |
| Markdown | pulldown-cmark |
| ハイライト | syntect |
| Mermaid | merman（raster） |
| 画像 | ratatui-image、image |

## ソース開発

devbox推奨のビルド手順：

```bash
git clone https://github.com/manji-0/bmd.git
cd bmd
devbox shell
devbox run setup
devbox run build
devbox run build-release
devbox run test
devbox run clippy
devbox run fmt
devbox run prek
```

| スクリプト | 内容 |
|---|---|
| `build` / `build-release` | デバッグ / リリース |
| `build-linux-x86_64` | macOSから静的Linux x86_64（musl） |
| `package` | `dist/*.tar.gz` とcrates.io用クレート |

devboxはプロジェクトローカルの `RUSTUP_HOME` / `CARGO_HOME` / `SCCACHE_DIR` と `RUSTFLAGS="-C linker=clang"`、`RUSTC_WRAPPER=sccache` を設定します。devboxと素の `cargo` を混ぜると `RUSTFLAGS` 差でインクリメンタルが壊れやすいです。

設計メモはupstreamの [`PLAN.md`](https://github.com/manji-0/bmd/blob/main/PLAN.md) です。機能確認用Markdownは `docs/func-check/` にあります。

## 次に読む

キー操作は [キーバインド](/projects/bmd/keybindings/) です。テーマ設定は [設定](/projects/bmd/configuration/) へ。
