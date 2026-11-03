---
title: "アーキテクチャ"
description: "dagayn の内部構成と処理パイプライン"
sidebar:
  order: 10
---

このページは、dagaynの取り込みパイプライン、SQLite永続化、Rust/Python境界を扱います。ノード種別やエッジkindの語彙は [グラフモデル](/projects/dagayn/graph-model/) へ。利用手順は [使い方](/projects/dagayn/usage/) へ。

## 全体像

```diagram-design dagayn-pipeline
```

dagaynはリポジトリ内容をローカル知識グラフに変換し、CLIとMCPから同じデータセットをクエリします。中核は **Tree-sitter + SQLite** で、ホットパスは **Rust拡張（`dagayn._core`）** が担います。`build` / `update` / `status` のCLIと既定のMCPツールもRust側が応答し、扱えない場合だけPythonに回します。

## 処理パイプライン

### ファイル発見と言語検出

拡張子、shebang、設定ファイルに基づいてパーサを割り当てます。拡張子なしスクリプトはshebangからBash / Python等を推定します。アプリコード、Markdown、Terraform、Notebook（`.ipynb` とmarimo）を同一リポジトリ内で混在できます。

### パーサ抽出

Tree-sitterを基本とし、fork固有grammarは **commit pin** で取得します。Tree-sitterは0.27系で、grammarはCargo featureとして個別に有効化できます。

| 形式 | 備考 |
| --- | --- |
| Terraform | fork `tree-sitter-terraform`。`.tf` / `.tfvars` |
| Markdown | fork `tree-sitter-markdown`。directive コメント対応 |
| Notebook | セル単位。marimo `.py` / `.md`。span overlap で行番号ずれに耐性 |
| Python | Ruffのパーサ（`ruff_python_parser`）で抽出 |
| JS・TS 系 | 言語仕様から作り直した抽出器。`docs/TYPESCRIPT-EXTRACTION.md` に仕様 |

パーサ出力は常に **ファイル単位** のノード・エッジ列です。qualified nameはリポジトリ内で一意です。

### SQLite永続化

`.dagayn/graph.db` に書き込みます。パスはリポジトリルート相対で正規化し、symlink経由の一時パス差を吸収します。埋め込みも同じ `graph.db` 内の `embeddings` テーブルに入ります。

| パス | 内容 |
| --- | --- |
| `.dagayn/graph.db` | ノード・エッジ・派生テーブル |
| `.dagayn/task_queue.db` | hook用のバックグラウンド更新キュー |
| `.dagayn/` 配下その他 | Wiki生成物（`wiki/`）、SCIPインデックス（`scip/`）など |

グラフはローカル完結です。チーム共有は通常gitignoreのまま、各開発者がローカルで `dagayn build` する運用を基本とします。

### スキーマの要点

ノードは `kind`、`qualified_name`（**UNIQUE**）、`file_path`、行番号、`extra` JSONなどを持ちます。エッジは **`qualified_name` 文字列** で結びます。パーサがnode IDを知らない段階でエッジを吐け、ファイル単位の差し替え更新が単純になります。

保存時にDAG制約は入れません。import循環やdoc相互参照は現実に存在するため、循環は問い合わせ時に検出します（`architecture_analysis_tool(mode="import_cycles")`）。

接続設定の例：

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;
PRAGMA mmap_size=0;
```

WALはhookによる頻繁な `update` とMCPクエリの並行に向きます。`mmap_size` は0です。WALとmmapの併用で、別接続のcheckpoint時に `sqlite_master` が壊れたためです。

### インクリメンタル更新

`dagayn update` はファイル単位のatomic replacementです。

```text
changed file
  → parse file
  → DELETE old nodes/edges for file_path
  → INSERT new nodes/edges
```

変更検出はtracked diffに加え、staged / unstaged / **untracked** も含みます。新規ファイルはステージしなくてもパース対象になります。

### 後処理

| 処理 | 出力 | スキップ |
| --- | --- | --- |
| SCIPオーバーレイ | `CALLS` の呼び出し先を確定 | `build --scip` 時のみ |
| 呼び出し先解決 | re-export、戻り値型、標準ライブラリ・パッケージ、`TESTED_BY` の整合 | — |
| ネイティブ橋 | Python ↔ Rust、FFI、WebAssembly の `CROSS_ARTIFACT` | — |
| FTS5 索引 | `nodes_fts` | 常に実行（build 後） |
| コミュニティ | Leiden 分割 + cohesion | `--skip-flows` |
| Centrality | `hub_scores`, `bridge_scores` | — |
| 埋め込み | `graph.db` の `embeddings` | `--local-embedding` 時のみ |

保存フローはv10.0.0で廃止され、スキーマ18で `flows` 系テーブルは削除されます。エントリポイントはクエリ時に計算します。

派生データはmaterializeして保持します。リクエスト時に毎回NetworkXを組み立てません。

### クエリ時分析

レビュー、semantic search、refactor提案はすべて同一GraphStoreを読みます。変更検出はGit worktree状態とグラフを突き合わせます。

## GraphStoreとRust境界

```diagram-design dagayn-layers
```

`from dagayn.graph import GraphStore` はネイティブストアです。`DAGAYN_BACKEND=python` はエラーになります。`dagayn._core` が無いsource checkoutは明確に失敗し、旧Pythonエンジンにはフォールバックしません。

## グラフ探索の2方式

**Frontier batching**：BFS / DFSでnodeごとにSQLを投げるとN+1になります。frontierを層ごとにまとめ、edge kindごとの重み、token budget、応答整形が必要ならアプリ側traversalを選びます。

**Recursive CTE**：届くノード集合だけ欲しいときはSQLiteのrecursive CTEが相性良いです。impact radiusの到達集合を一括取得する用途に使います。詳細は [レビューと影響分析](/projects/dagayn/review-analysis/) を参照。

## マルチリポジトリ

レジストリに複数リポジトリを登録し、`cross_repo_search_tool` で横断検索できます。daemon設定はupstream `docs/DAEMON-CONFIG.md` を参照してください。

## エクスポート

GraphML、Mermaid C4、SVG、Cypher、Obsidian形式などへエクスポート可能です。`dagayn visualize` / `generate_wiki_tool` が相当します。

## 設計上の判断

| 判断 | 理由 |
| --- | --- |
| qualified name でエッジ結合 | パーサ単純化、クロスアーティファクト、人間可読レスポンス |
| 保存時に DAG 制約なし | 循環を観測可能にする。検出は問い合わせ時 |
| ファイル単位 replace 更新 | incremental diff より単純で速い |
| edge kind を分離 | 探索時の index selector 兼意味分類 |
| 派生テーブル materialize | MCP レイテンシを抑える |

## ソース開発

dagayn本体のパッチ提出向け手順はupstreamリポジトリの `docs/` にあります。ローカル開発は `uv sync --extra dev` が基本です。PyO3拡張（`dagayn._core`）もこのときビルドされ、Rust 1.98以上とCコンパイラが要ります。`ARCHITECTURE.md`、`SCHEMA.md`、`COMMANDS.md` を参照してください。

## 次に読む

ノード・エッジの語彙は [グラフモデル](/projects/dagayn/graph-model/) です。差分レビューは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
