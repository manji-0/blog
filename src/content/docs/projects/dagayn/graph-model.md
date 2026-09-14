---
title: "グラフモデル"
description: "dagayn のノード・エッジ・メトリクス・検索"
sidebar:
  order: 11
---

このページは、dagaynのグラフ語彙、Markdown/Terraform連携、構造メトリクス、ハイブリッド検索を扱います。取り込みパイプラインは [アーキテクチャ](/projects/dagayn/architecture/) へ。MCPからの呼び方は [MCP ツール](/projects/dagayn/mcp-tools/) へ。

## 対応アーティファクト

| 種別 | 拡張子 / 形式 | 備考 |
| --- | --- | --- |
| ソースコード | `.py`, `.rs`, `.ts`, `.go`, `.java` 等 | 40言語以上 |
| Markdown | `.md` | directive、コードスパン |
| Terraform | `.tf`, `.tfvars` | block 種別ごとのノード |
| Notebook | `.ipynb`、marimo の `.py` / `.md` | セル単位。marimoは `notebook_format: "marimo"` |

フロントエンド（Vue / Svelte / Astro）、スクリプト（Bash / PowerShell）、スマートコントラクト（Solidity）も同一グラフに載ります。

## ノード種別

### ソースコード

| kind | 意味 | qualified name 例 |
| --- | --- | --- |
| `File` | ソースファイル | `src/auth.py` |
| `Class` | クラス / 構造体 | `src/auth.py::AuthService` |
| `Function` | 関数 / メソッド | `src/auth.py::login` |
| `Type` | 型定義 | `src/models.py::UserId` |
| `Test` | テスト関数 | `tests/test_auth.py::test_login` |

### Markdown

| kind | 意味 | qualified name 例 |
| --- | --- | --- |
| `File` | ドキュメント | `docs/architecture.md` |
| `DocSection` | 見出し | `docs/arch.md::api-design` |
| `DocBody` | セクション配下本文 | `docs/arch.md::api-design--body-1` |

`DocSection` を `Class` と分離しているのは、シンボル検索のノイズを減らすためです。

### Terraform

| block | kind | qualified name 例 |
| --- | --- | --- |
| `resource` / `data` / `module` | Class | `resource.aws_s3_bucket.logs` |
| `variable` / `local` / `output` | Function | `var.region` |
| `check` | Test | `check.valid` |

## エッジ種別

| kind | 方向性 | 典型用途 |
| --- | --- | --- |
| `CONTAINS` | 親→子 | ファイル→シンボル、見出し階層 |
| `CALLS` | 呼び出し元→先 | impact 分析、フロー |
| `IMPORTS_FROM` | 依存元→先 | パッケージ依存 |
| `INHERITS` | 子→親 | 継承 |
| `IMPLEMENTS` | 実装→契約 | trait / interface 適合 |
| `DEPENDS_ON` | 依存元→先 | directive、TF constraint |
| `REFERENCES` | 参照元→先 | MD セクションリンク、TF 式 |
| `TESTED_BY` | 被テスト→テスト | `login` → `test_login` |
| `CROSS_ARTIFACT` | 文書→コード等 | 境界を越えた参照 |

エッジkindは **意味分類** です。同時に **探索時の index selector** でもあります。

### kindごとの使い分け

| 分析 | 含める kind | 除外する kind |
| --- | --- | --- |
| ADP / SDP / SAP | `IMPORTS_FROM`, `DEPENDS_ON`, `INHERITS`, `IMPLEMENTS` | `CALLS`, `REFERENCES` |
| Impact radius（呼び出し） | `CALLS` 含む | — |
| Doc 影響 | `CROSS_ARTIFACT`, `DEPENDS_ON` | — |

動的言語で `CALLS` を依存分析に混ぜると `len()` 等でノイズが増えます。

## CROSS_ARTIFACT解決

Markdownのインラインコードスパン `` `SymbolName` `` は後処理でコードグラフと照合されます。

| マッチ数 | 結果 |
| --- | --- |
| 0 | エッジ破棄 |
| 1 | `CROSS_ARTIFACT` 保持（confidence HIGH） |
| 2+ | エッジ破棄（曖昧） |

識別子ルール（要約）：3文字未満かつ `_` / `.` なしはスキップ。英数字・`_`・`.` のドット区切り識別子を対象とします。`dagayn:` 形式のdirectiveは作者宣言の依存として未解決でも `DEPENDS_ON` に残る場合があります。

`query_graph_tool` の `docs_for`（コード→doc）と `implementations_of`（doc→実装）がこの向きをたどります。

## Markdown連携

### 見出しslug規則

GitHub Markdown互換：英数字は小文字化、空白・ハイフンは `-` に統一、その他記号は除去、重複見出しは `-1`, `-2` サフィックス。

### Directiveコメント

```markdown
<!-- constrained-by ./decisions/adr-001.md#context -->
<!-- blocked-by ./specs/open-issue.md -->
<!-- supersedes ./old-api.md#endpoint-design -->
<!-- derived-from ./research/background.md#findings -->
```

各directiveは `DEPENDS_ON` エッジです。`markdown_directive_kind` 属性に種別が記録されます。

### リンク形式

| 形式 | エッジ |
| --- | --- |
| `[text](./path.md#section)` | `IMPORTS_FROM` + `REFERENCES` |
| `[text](#local-section)` | 同一ファイル内 `REFERENCES` |

外部URL（`http://`, `mailto:`）は無視します。執筆ガイドはupstream `docs/MARKDOWN-AUTHORING.md` を参照してください。

## Terraform連携

fork `tree-sitter-terraform` で `.tf` / `.tfvars` をパースします。

| kind | 抽出元 |
| --- | --- |
| `REFERENCES` | `var.x`, `local.x`, `module.x`, `resource.type.name` 等 |
| `CALLS` | `merge()`, `length()` 等の組込関数 |
| `IMPORTS_FROM` | `module` の `source`、`terraform.required_providers` |
| `CONTAINS` | ファイル → block |

`module` blockの `source` がローカルパスの場合、impact radiusがモジュール境界を越えて追跡できます。`.tfvars` のトップレベル属性は `var.name` ノードとなり、対応する `variable` blockへ `REFERENCES` で接続されます。

## 構造メトリクス

`dagayn build` 後処理で計算します。`architecture_analysis_tool` が1ショットで返します。

### コミュニティ

Leidenアルゴリズムで分割し、凝集度（cohesion = コミュニティ内エッジ数 / 接続全エッジ数）を計算します。低い凝集度の大きな塊は内部境界が無い候補です。

### Hub / Bridge

入次数・出次数が異常に高いhub、betweenness centralityが高いbridgeは変更の波及コストが大きいチョークポイントです。

### 実行フロー

CLIコマンド、HTTPハンドラ、MCPツールハンドラなどのエントリポイントから葉に向かう経路を事前計算します。hook日常運用では `--skip-flows` で省略し、大きな変更後にフル再計算します。

### ADP / SDP / SAP

| 原則 | 問い |
| --- | --- |
| **ADP** | 依存部分グラフに循環がないか |
| **SDP** | 依存の向きが安定度（instability）に沿っているか |
| **SAP** | 抽象度と安定度のバランスが main sequence 近傍か |

ADPの母集団は `IMPORTS_FROM`, `DEPENDS_ON`, `INHERITS`, `IMPLEMENTS` です。`CALLS` は含めません。CLIは `detect-adp` / `sdp-metrics` 等、MCPは `detect_adp_violations_tool` 等が相当します。

## ハイブリッド検索

`semantic_search_nodes_tool` はFTS5とベクトル類似度をRRF（k=10）で融合します。埋め込みが無い環境ではFTSのみで動作します。

### 埋め込みモード

| モード | 概要 | ネットワーク |
| --- | --- | --- |
| `fts-only` | FTS5 のみ | 不要 |
| `local-embedding` | BGE-M3 GGUF + llama.cpp sidecar | 初回モデル取得のみ |
| `local-embedding-llama` / `low` | Qwen3-Embedding sidecar | 同上 |
| リモート API | OpenAI / Google / MiniMax 等 | 要 |

```bash
dagayn build --local-embedding
dagayn update --local-embedding
```

### FTS5索引

build後は常に利用可能です。日本語はLindera IPADIC + CJKバイグラムで索引します。クエリは全文BM25と識別子トークン（snake_case / PascalCase）の二段発火です。

### ベクトル検索

`embeddings.db` にcosine similarityで近傍を取ります。`material`（名前・docstring中心）と `narrative`（呼び出し・ループ等の静的ファクト）の2種ベクトルを保持できます。

### フォールバック

```text
hybrid → fts_only → embedding_only → keyword_fallback (LIKE)
```

`fts-only` 運用ではネットワーク不要です。ローカル埋め込みはソース全文をsidecar内で完結します。

## 次に読む

差分レビューでの使い方は [レビューと影響分析](/projects/dagayn/review-analysis/) です。インストールとビルドは [使い方](/projects/dagayn/usage/) へ。
