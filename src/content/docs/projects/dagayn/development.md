---
title: "開発環境"
description: "dagayn リポジトリの開発・コントリビュート手順"
sidebar:
  order: 12
---

dagayn本体の開発・パッチ提出向けの手順である。利用者向けの [インストール](/projects/dagayn/installation/) とは別物。

## リポジトリの取得

```bash
git clone https://github.com/manji-0/dagayn.git
cd dagayn
```

## 依存関係

| ツール | 用途 |
| --- | --- |
| Python 3.12+ | CLI・MCP・テスト |
| uv | 推奨パッケージマネージャ |
| Rust toolchain | `dagayn._core` ビルド |
| C compiler | PyO3 拡張 |

## ローカル開発セットアップ

```bash
uv sync
uvx maturin develop --release
```

source checkoutでは `maturin develop` でRust拡張をeditable installする。

## テスト

```bash
uv run pytest
```

skills関連：

```bash
uv run pytest tests/test_skills.py -q
```

## 型チェック

CIは `ty` をPython 3.13想定で実行する。

```bash
ty check dagayn --python-version 3.13 --ignore unresolved-import
```

## ドキュメント

upstreamリポジトリの `docs/` に詳細な技術ノートがある。

| ドキュメント | 内容 |
| --- | --- |
| `ARCHITECTURE.md` | パイプライン、GraphStore |
| `COMMANDS.md` | CLI・MCP全表面 |
| `SCHEMA.md` | SQLiteスキーマ |
| `MARKDOWN-AUTHORING.md` | 設計書の書き方 |
| `LOCAL-EMBEDDINGS.md` | sidecar設定 |

## fork との関係

dagaynは [code-review-graph](https://github.com/tirth8205/code-review-graph) のforkである。upstreamのNOTICEに帰属を記載。dagaynリポジトリ内のドキュメントがdagayn向けの正とする。

## 関連ページ

- [アーキテクチャ](/projects/dagayn/architecture/)
- [トラブルシューティング](/projects/dagayn/troubleshooting/)
