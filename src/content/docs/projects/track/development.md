---
title: "開発環境"
description: "track リポジトリの開発・コントリビュート"
sidebar:
  order: 6
---

利用者向け [インストール](/projects/track/installation/) とは別の、ソース開発向け情報です。

## ビルドとテスト

```bash
git clone https://github.com/manji-0/track.git
cd track
cargo build
cargo test
cargo build --release
```

## 技術スタック

| 領域 | 技術 |
|---|---|
| 言語 | Rust（Edition 2021） |
| CLI | clap |
| DB | SQLite（rusqlite bundled） |
| Web UI | Axum、MiniJinja、HTMX、SSE |
| 日時 | chrono |

## upstreamドキュメント

| ファイル | 内容 |
|---|---|
| `DESIGN.md` | 設計 |
| `docs/FUNCTIONAL_SPEC.md` | 機能仕様 |
| `docs/JJ_INTEGRATION.md` | JJ二層スタック |
| `docs/TODAY_TASK.md` | Todayタスク |
| `docs/USAGE_EXAMPLES.md` | 利用例 |
| `docs/LLM_INTEGRATION.md` | LLM / エージェント連携 |
| `PROJECT_STRUCTURE.md` | ディレクトリ構成 |
| `CHANGELOG.md` | リリースノート |

## ライセンス

MIT

## 関連ページ

- [はじめに](/projects/track/)
- [CLIリファレンス](/projects/track/cli-reference/)
