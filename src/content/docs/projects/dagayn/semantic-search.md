---
title: "セマンティック検索"
description: "dagayn の埋め込みモードとハイブリッド検索"
sidebar:
  order: 7
---

dagaynの `semantic_search_nodes_tool` はFTS5全文検索とベクトル類似度を組み合わせたハイブリッド検索を提供する。埋め込みが無い環境でもFTSのみで動作する。

## 埋め込みモード

`dagayn install --mode <mode>` で既定の埋め込み戦略を選ぶ。

| モード | 概要 |
| --- | --- |
| `fts-only` | FTS5のみ。外部API不要。セットアップが最も軽い |
| `local-embedding` | ローカル埋め込み（BGE-M3 GGUF、管理付きllama.cpp sidecar） |
| `local-embedding-llama` / `low` | Qwen3-Embedding sidecar（`llama-qwen3`） |
| リモートAPI | OpenAI / Google / MiniMax等のクラウド埋め込みAPI |

機密リポジトリでは `fts-only` または `local-embedding` を選べば、ソースコードをクラウドへ送らずに運用できる。

## ローカル埋め込みの生成

```bash
dagayn build --local-embedding
dagayn update --local-embedding
```

MCPからは `embed_graph_tool` で同等の操作ができる。

sidecar関連オプション：

- `--local-embedding-timeout` — サーバ起動待ち
- `--local-embedding-request-timeout` — 1リクエストのタイムアウト
- `--local-embedding-batch-size` — 既定1（sidecar）
- `--local-embedding-bin auto` — `llama-server` を自動選択

## ハイブリッド検索の仕組み

1. **FTS5 BM25** — `nodes_fts` 仮想テーブル。シンボル名、qualified name、docstring、Markdown本文を索引。日本語はMeCab互換トークナイザ（利用可能時）で分割。
2. **Cosine similarity** — `.dagayn/embeddings.db` のベクトルストア。埋め込み構築後のみ有効。

両方のランキングをReciprocal Rank Fusion（RRF, k=10）でマージする。

### 後処理ブースト

| 処理 | 効果 |
| --- | --- |
| Kind boost | PascalCase→Class、snake_case→Function、dotted→qualified name |
| Context-file boost | `context_files` 指定ファイル内ノードを1.5倍 |
| Intent rerank | クエリ種別（識別子 / 目的説明 / 手順）に応じて material / narrative テキストを選択 |
| Test deboost | テストコードを0.6倍（明示的なテストクエリ時は除外） |

### フォールバック

hybrid → fts_only → embedding_only → keyword_fallback（LIKE）

レスポンスの `search_mode` で実際に使われた経路が分かる。

## 埋め込みテキストモード

同一ノードに `material` と `narrative` の2種類のベクトルを保持できる。識別子中心のクエリはFTSが強く、目的説明やプロセスパターンのクエリは埋め込みテキストモードが効く。

## プライバシー

- `fts-only`: ネットワーク通信不要
- ローカル埋め込み： モデル初回取得以外はオフライン
- リモートAPI: シンボル名や要約テキストに限り、フルソースの一括アップロードは行わない設計

## status で確認

```bash
dagayn status
```

provider別ベクトル数、欠落ノード、孤立embedding行、状態（complete / partial / stale等）を表示する。

## 関連ページ

- [インストール](/projects/dagayn/installation/)
- [CLI リファレンス](/projects/dagayn/cli-reference/)
- [MCP ツール](/projects/dagayn/mcp-tools/)
