---
title: "セマンティック検索"
description: "dagayn の埋め込みモードとハイブリッド検索"
sidebar:
  order: 7
---

dagaynの `semantic_search_nodes_tool` はFTS5全文検索とベクトル類似度を組み合わせたハイブリッド検索を提供する。埋め込みが無い環境でもFTSのみで動作する。

## 埋め込みモード

`dagayn install --mode <mode>` で既定戦略を選ぶ。

| モード | 概要 | ネットワーク |
| --- | --- | --- |
| `fts-only` | FTS5 のみ | 不要 |
| `local-embedding` | BGE-M3 GGUF + llama.cpp sidecar | 初回モデル取得のみ |
| `local-embedding-llama` / `low` | Qwen3-Embedding sidecar | 同上 |
| リモート API | OpenAI / Google / MiniMax 等 | 要 |

機密リポジトリでは `fts-only` または `local-embedding` を推奨する。

## ローカル埋め込みの生成

```bash
dagayn build --local-embedding
dagayn update --local-embedding
dagayn build --local-embedding --mode llama-qwen3
```

MCPからは `embed_graph_tool` が相当する。

| オプション | 用途 |
| --- | --- |
| `--local-embedding-timeout` | sidecar 起動待ち |
| `--local-embedding-request-timeout` | 1リクエストのタイムアウト |
| `--local-embedding-batch-size` | 既定 1（sidecar） |
| `--local-embedding-bin auto` | `llama-server` 自動選択 |

## FTS5 索引（`nodes_fts`）

build後は常に利用可能。porter + unicode61トークナイザ。

### 索引に入るテキスト

| 種別 | 内容 |
| --- | --- |
| シンボル名 | `login`, `AuthService` |
| qualified name | `src/auth.py::login` |
| 生成トークン | `OpenAIEmbeddingProvider` → `open ai embedding provider` |
| シグネチャ / docstring | 関数の型情報・説明 |
| Markdown 本文 | `DocSection` / `DocBody` のテキスト |

### 日本語トークン化

かな・漢字を含むソース / ドキュメントは、利用可能時にMeCab互換トークナイザで分割してからFTSに投入する。ASCII語はそのまま残し、混在文書でも英語シンボル名が検索できる。

### クエリの二段発火

1. クエリ全文をそのままBM25
2. 自然言語から抽出した識別子トークン（snake_case / PascalCase / camelCase）ごとに再検索

例：`"tests for embed_graph"` → `embed_graph` トークンでもヒットする。

## ベクトル検索（`embeddings.db`）

cosine similarityで近傍を取る。埋め込み構築後のみ有効。

### テキストモード（material / narrative）

同一ノードに2種類のベクトルを保持できる。

| モード | 向くクエリ | テキストの出所 |
| --- | --- | --- |
| `material` | 目的説明、「何をする関数か」 | 名前、docstring、隣接コメント |
| `narrative` | 手順・プロセス、「どう動くか」 | 呼び出し・読み書き・ループ等の静的ファクト |

Intent rerankがクエリを軽量ヒューリスティックで分類し、どちらのベクトルを重視するか切り替える。

## RRF 融合

FTSランキングとembeddingランキングを **Reciprocal Rank Fusion**（k=10）でマージする。

\[
\text{RRF score}(d) = \sum_i \frac{1}{k + \text{rank}_i(d)}
\]

k=10はスコアを ~0.05–0.2に広げるキャリブレーション用（教科書的な60より小さい）。単一リストの順序は保ちつつ、別リストからの追加証拠で順位が入れ替わる。

## 後処理ブースト

| 処理 | 条件 | 倍率 |
| --- | --- | --- |
| Kind boost | PascalCase クエリ | Class / Type ×1.5 |
| Kind boost | snake_case クエリ | Function ×1.5 |
| Kind boost | dotted path | qualified name ×2.0 |
| Context-file boost | `context_files` 指定 | ×1.5 |
| Test deboost | `is_test=True` | ×0.6（テスト明示クエリ時は除外） |
| Intent rerank | 識別子 / 目的 / 手順 / doc | material / narrative 切替 |

## フォールバックチェーン

```text
hybrid → fts_only → embedding_only → keyword_fallback (LIKE)
```

| `search_mode` | 意味 |
| --- | --- |
| `hybrid` | FTS + embedding |
| `fts_only` | 埋め込みなし |
| `embedding_only` | FTS 索引破損時 |
| `keyword_fallback` | FTS 未構築時 |

各ヒットの `source` は `fts` / `embedding` / `both` / `keyword`。

## 評価（eval）

`dagayn eval` で検索品質をベンチマークできる。

| benchmark | 用途 |
| --- | --- |
| `doc_fuzzy_search` | 自然言語 → doc セクションの FTS vs embedding 比較 |
| `embedding_materials` | material 戦略（粒度・コメント同梱等）の比較 |
| `guidance_precision` | レビュー guidance の precision@k |

## プライバシー

- `fts-only`：ネットワーク不要
- ローカル埋め込み：ソース全文はsidecar内で完結
- リモートAPI：シンボル名・要約テキストに限り、フルソース一括アップロードはしない設計

## status で確認

```bash
dagayn status
```

provider別ベクトル数、欠落ノード、孤立embedding行、`complete` / `partial` / `stale` / `empty` を表示する。

## 関連ページ

- [インストール](/projects/dagayn/installation/)
- [MCP ツール](/projects/dagayn/mcp-tools/)
- [ストレージと SQLite](/projects/dagayn/storage/)
