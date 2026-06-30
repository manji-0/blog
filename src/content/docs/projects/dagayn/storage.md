---
title: "ストレージと SQLite"
description: "dagayn のグラフ永続化、スキーマ、更新戦略"
sidebar:
  order: 9
---

dagaynの知識グラフはリポジトリ直下の `.dagayn/` に保存される。中核は `graph.db`（SQLite）で、埋め込みは別ファイル `embeddings.db` に分離する。

## ファイル構成

| パス | 内容 |
| --- | --- |
| `.dagayn/graph.db` | ノード・エッジ・派生テーブル |
| `.dagayn/embeddings.db` | ベクトル埋め込み（任意） |
| `.dagayn/` 配下その他 | フローJSON、コミュニティ、Wiki生成物など |

グラフはローカル完結である。チーム共有は通常gitignoreのまま、各開発者がローカルで `dagayn build` する運用を基本とする。

## なぜ SQLite か

- インストール不要で単一ファイル配布できる
- インメモリ相当の読み取り性能（WAL + mmap）
- recursive CTEで到達集合を1クエリで取れる
- Python / Rust双方から安定してバインドできる

ネットワークグラフDBは過剰である。エージェントが毎タスクで触るのは「このリポジトリの構造」であり、クラスタ横断のリアルタイム同期は要件に入らない。

## スキーマの考え方

### nodes テーブル

各シンボル・文書セクション・Terraform blockは1行になる。

| 列 | 役割 |
| --- | --- |
| `kind` | `Function`, `Class`, `DocSection` 等 |
| `qualified_name` | グラフ上の安定ID（**UNIQUE**） |
| `file_path` | リポジトリルート相対パス |
| `line_start` / `line_end` | ソース位置 |
| `language` | パーサ種別 |
| `is_test` | テストコード判定 |
| `extra` | JSON。言語固有メタデータ |

### edges テーブル

エッジは `source_id` / `target_id` ではなく **`qualified_name` 文字列** で結ぶ。

```sql
CREATE TABLE edges (
    kind TEXT NOT NULL,
    source_qualified TEXT NOT NULL,
    target_qualified TEXT NOT NULL,
    file_path TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    confidence_tier TEXT DEFAULT 'EXTRACTED',
    extra TEXT DEFAULT '{}'
);
```

この設計の利点：

- パーサがnode IDを知らない段階でエッジを吐ける
- ファイル単位の差し替え更新が単純
- Markdown / Terraform / コードを同じkey空間に載せられる
- MCPレスポンスが人間可読

整数ID joinの方が速い場面は、派生テーブルやクエリ時のmaterializeで補う。

### 主要インデックス

探索は「このノードから出るエッジ」「入るエッジ」「kindで絞る」の繰り返しである。

```sql
CREATE INDEX idx_edges_source ON edges(source_qualified);
CREATE INDEX idx_edges_target ON edges(target_qualified);
CREATE INDEX idx_edges_kind ON edges(kind);
CREATE INDEX idx_edges_target_kind ON edges(target_qualified, kind);
CREATE INDEX idx_edges_source_kind ON edges(source_qualified, kind);
```

## SQLite 接続設定

書き込みベンチマークでも効く地味な設定：

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;
PRAGMA mmap_size=268435456;
PRAGMA temp_store=MEMORY;
```

WALは読み取りと書き込みの並行に強く、hookによる頻繁な `update` とMCPクエリの共存に向く。

## DAG 制約は保存時に入れない

import循環、ドキュメント相互参照、Terraform module参照は現実に存在する。保存時に循環を弾くと**壊れた構造を観測できない**。

- `CONTAINS` はほぼ木
- `CALLS` は循環が普通
- `IMPORTS_FROM` は循環してほしくない

DAGとしての検査（ADP）は後処理で、依存エッジの部分グラフに対して行う。詳細は [構造メトリクス](/projects/dagayn/metrics/) を参照。

## インクリメンタル更新

`dagayn update` はファイル単位のatomic replacementである。

```text
changed file
  → parse file
  → DELETE old nodes/edges for file_path
  → INSERT new nodes/edges
```

パーサは「このファイルから見えたノード / エッジ」だけを吐けばよい。過去との差分計算はDB側で古い行を消して差し替える。

変更検出はtracked diffに加え、staged / unstaged / **untracked** も含む。新規ファイルはステージしなくてもパース対象になる。

複数ファイルは `store_file_batch` でまとめて書き込み、トランザクション境界を粗く保つ。

## 派生テーブル（materialize）

リクエスト時に毎回計算しないもの：

| 派生 | テーブル / 成果物 |
| --- | --- |
| 全文検索 | `nodes_fts`（FTS5 仮想テーブル） |
| 実行フロー | `flows`, `flow_memberships` |
| コミュニティ | `communities` |
| Hub / Bridge | `hub_scores`, `bridge_scores` |
| リスク指標 | `risk_index` |

```text
raw graph          derived (postprocess)
─────────          ───────────────────
nodes       →      nodes_fts
edges       →      flows / communities / hub_scores
```

MCPツールはユーザー操作の前段にある。毎回全edgeを読みNetworkXでcentralityを計算する形にはしない。

## グラフ探索の2方式

### Frontier batching

BFS / DFSでnodeごとにSQLを投げるとN+1になる。frontierを層ごとにまとめる。

```text
frontier = [start]
while frontier:
  nodes = SELECT * FROM nodes WHERE qualified_name IN (frontier)
  edges = SELECT * FROM edges
          WHERE source_qualified IN (frontier)
             OR target_qualified IN (frontier)
  next_frontier = build in memory
```

edge kindごとの重み、token budget、双方向探索、応答整形が必要なら、アプリ側traversalを選ぶ。

### Recursive CTE

届くノード集合だけ欲しいときは、SQLiteのrecursive CTEが相性良い。

```sql
WITH RECURSIVE impacted(qn, depth) AS (
  SELECT ?, 0
  UNION
  SELECT e.target_qualified, impacted.depth + 1
  FROM edges e
  JOIN impacted ON e.source_qualified = impacted.qn
  WHERE impacted.depth < ?
)
SELECT qn, depth FROM impacted;
```

impact radiusのような到達集合の一括取得に使う。詳細は [レビューと影響分析](/projects/dagayn/review-analysis/) を参照。

## GraphStore 境界

Python `GraphStore` がCLI・MCP・テスト向けの安定APIを提供する。Rust `dagayn_core` はPyO3経由でホットパスを加速する。

| 層 | 責務 |
| --- | --- |
| Python GraphStore | スキーマ互換、トランザクション、パス正規化、キャッシュ |
| Rust backend | バッチ格納、パース、フロー/コミュニティ永続化、centrality 計算 |

新規コードはRust binding直接ではなく `GraphStore` メソッドに依存する。

## 関連記事

- [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/) — frontier batching、Rust移行の詳細

## 関連ページ

- [アーキテクチャ](/projects/dagayn/architecture/)
- [構造メトリクス](/projects/dagayn/metrics/)
- [グラフモデル](/projects/dagayn/graph-model/)
