---
title: "アーキテクチャ"
description: "dagayn の内部構成と処理パイプライン"
sidebar:
  order: 8
---

dagaynはリポジトリ内容をローカル知識グラフに変換し、CLIとMCPから同じデータセットをクエリする。

## 処理パイプライン

1. **ファイル発見と言語検出** — 拡張子、shebang、設定に基づく
2. **パーサ抽出** — Tree-sitter（および必要なフォールバック）でノード・エッジ生成
3. **SQLite永続化** — `.dagayn/graph.db`
4. **後処理** — フロー、コミュニティ、FTS、centrality、（任意）埋め込み
5. **クエリ時分析** — レビュー、検索、リファクタ提案

## パーサ

Tree-sitterを基本とし、fork固有のgrammarをcommit pinで取得する。

- **Terraform** — fork `tree-sitter-terraform`
- **Markdown** — fork `tree-sitter-markdown`（directive対応）
- **Notebook** — セル単位、span overlapで行番号ずれに耐性

Rust backendが既定。Markdown、Terraform、Rust、Python/notebook、主要なJS/TS系などはRust所有パスでパースされる。source checkoutで `dagayn._core` が無い場合は明確に失敗し、旧Pythonパーサにはフォールバックしない。

## ストレージ

グラフデータはSQLiteに保存される。ノード・エッジはファイルidentity、qualified name、分析用メタデータを持つ。

登録パスはリポジトリルート相対が期待され、symlink経由の一時パス差を吸収する。

### GraphStore 境界

Python `GraphStore` がCLI・MCP・テスト向けの安定APIを提供する。Rust graph backend（`dagayn_core`）はPyO3経由でホットパスを加速する。

- Python: スキーマ互換、トランザクション、キャッシュ無効化、フォールバック
- Rust: バッチ格納、フロー/コミュニティJSON、Markdown artifact解決、hub/bridge score計算

新規コードはRust binding直接ではなく `GraphStore` メソッドに依存する。

## 後処理

| レイヤ | 出力 |
| --- | --- |
| FTS5 | `nodes_fts` 仮想テーブル（build後常に利用可） |
| 埋め込み | `.dagayn/embeddings.db` |
| Centrality | `hub_scores`, `bridge_scores` テーブル |
| フロー | エントリポイント→葉の到達経路 |
| コミュニティ | Leiden分割結果 |

## クエリ面

MCP layerとCLIは同一GraphStoreを読む。`review_tool`、`query_graph_tool`、`architecture_analysis_tool`、`refactor_tool` はすべてローカルデータセット上で $O(\text{graph})$ 操作である。

## Rust 移行方針

探索・集計のホットパスは段階的にRustへ移行している。Python層はCLI・MCP・オーケストレーションを担う。

詳細な移行状況はupstream `docs/RUST-CORE-MIGRATION-WIP.md` を参照。

## 関連記事

- [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/)

## 関連ページ

- [グラフモデル](/projects/dagayn/graph-model/)
- [セマンティック検索](/projects/dagayn/semantic-search/)
- [開発環境](/projects/dagayn/development/)
