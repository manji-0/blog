---
title: "開発環境"
description: "track リポジトリの開発・コントリビュート"
sidebar:
  order: 6
---

利用者向けの [インストール](/projects/track/installation/) とは別に、ソースをいじる人向けのメモです。

```bash
git clone https://github.com/manji-0/track.git
cd track
cargo build
cargo test
cargo build --release
```

言語はRust（Edition 2021）、CLIはclap、DBはbundledのrusqliteです。Web UIはAxumにMiniJinja、HTMX、SSEを載せています。日時はchronoです。

設計や機能の詳細はリポジトリ内のドキュメントを見てください。`DESIGN.md` と `docs/FUNCTIONAL_SPEC.md`、jjまわりの `docs/JJ_INTEGRATION.md`、Todayタスクの `docs/TODAY_TASK.md` があります。利用例は `docs/USAGE_EXAMPLES.md`、エージェント連携は `docs/LLM_INTEGRATION.md`、構成は `PROJECT_STRUCTURE.md`、変更履歴は `CHANGELOG.md` です。

ライセンスはMITです。サイト側の入口は [はじめに](/projects/track/) と [CLI リファレンス](/projects/track/cli-reference/) です。
