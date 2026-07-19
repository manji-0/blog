---
title: "開発環境"
description: "bmd リポジトリの開発・コントリビュート"
sidebar:
  order: 5
---

利用者向け [インストール](/projects/bmd/installation/) とは別の、ソース開発向け情報です。

## ビルド（devbox）

```bash
git clone https://github.com/manji-0/bmd.git
cd bmd
devbox shell
devbox run setup
devbox run build
devbox run build-release
devbox run test
devbox run run -- sample.md
devbox run clippy
devbox run fmt
devbox run prek
```

| スクリプト | 内容 |
|---|---|
| `build` / `build-release` | デバッグ / リリース |
| `build-linux-x86_64` | macOSから静的Linux x86_64（musl） |
| `package` | `dist/*.tar.gz` とcrates.io用クレート |

devboxはプロジェクトローカルの `RUSTUP_HOME` / `CARGO_HOME` / `SCCACHE_DIR` と `RUSTFLAGS="-C linker=clang"`、`RUSTC_WRAPPER=sccache` を設定します。devboxと素の `cargo` を混ぜると `RUSTFLAGS`差でインクリメンタルが壊れやすいです。

## アーキテクチャ

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

設計メモはupstreamの [`PLAN.md`](https://github.com/manji-0/bmd/blob/main/PLAN.md)（日本語）。機能確認用Markdownは `docs/func-check/`。

## 主要依存

| 目的 | クレート |
|---|---|
| TUI | ratatui、crossterm |
| Markdown | pulldown-cmark |
| ハイライト | syntect |
| Mermaid | merman（raster） |
| 画像 | ratatui-image、image |

## ライセンス

Apache-2.0

## 関連ページ

- [はじめに](/projects/bmd/)
- [設定](/projects/bmd/configuration/)
