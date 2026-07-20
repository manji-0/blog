---
title: "グラフモデル"
description: "dagayn のノード・エッジ・対応アーティファクト"
sidebar:
  order: 5
---

dagaynはリポジトリ内のソース、ドキュメント、インフラ定義を統一されたグラフ語彙で表現する。エッジkindは **意味分類** であると同時に **探索時の index selector** でもある。取り込みからクエリまでの流れは [アーキテクチャ](/projects/dagayn/architecture/) を参照。

## 対応アーティファクト

| 種別 | 拡張子 / 形式 | 備考 |
| --- | --- | --- |
| ソースコード | `.py`, `.rs`, `.ts`, `.go`, `.java` 等 | 40言語以上 |
| Markdown | `.md` | directive、コードスパン |
| Terraform | `.tf`, `.tfvars` | block 種別ごとのノード |
| Notebook | `.ipynb` | セル単位 |

フロントエンド（Vue / Svelte / Astro）、スクリプト（Bash / PowerShell）、スマートコントラクト（Solidity）も同一グラフに載る。

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

`DocSection` を `Class` と分離しているのは、シンボル検索のノイズを減らすためである。

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
| `IMPORTS_FROM` | 依存元→先 | パッケージ依存、module source |
| `INHERITS` | 子→親 | 継承 |
| `IMPLEMENTS` | 実装→契約 | trait / interface 適合 |
| `DEPENDS_ON` | 依存元→先 | directive、TF constraint |
| `REFERENCES` | 参照元→先 | MD セクションリンク、TF 式 |
| `TESTED_BY` | 被テスト→テスト | `login` → `test_login` |
| `CROSS_ARTIFACT` | 文書→コード等 | 境界を越えた参照 |

### エッジメタデータ

`extra` JSONと列属性で保持：

| フィールド | 意味 |
| --- | --- |
| `confidence` | 0.0–1.0 |
| `confidence_tier` | `EXTRACTED`, `INFERRED`, `HIGH` 等 |
| `markdown_directive_kind` | `constrained-by` 等 |
| `bridge_kind` | `CROSS_ARTIFACT` の種別 |
| `original_symbol_name` | MD 解決前のスパン文字列 |

### kind ごとの使い分け

| 分析 | 含める kind | 除外する kind |
| --- | --- | --- |
| ADP / SDP / SAP | `IMPORTS_FROM`, `DEPENDS_ON`, `INHERITS`, `IMPLEMENTS` | `CALLS`, `REFERENCES` |
| Impact radius（呼び出し） | `CALLS` 含む | — |
| Doc 影響 | `CROSS_ARTIFACT`, `DEPENDS_ON` | — |

動的言語で `CALLS` を依存分析に混ぜると `len()` 等でノイズが増える。

## CROSS_ARTIFACT 解決

Markdownのインラインコードスパン `` `SymbolName` `` は後処理でコードグラフと照合される。

| マッチ数 | 結果 |
| --- | --- |
| 0 | エッジ破棄 |
| 1 | `CROSS_ARTIFACT` 保持（confidence HIGH） |
| 2+ | エッジ破棄（曖昧） |

識別子ルール（要約）：

- 3文字未満かつ `_` / `.` なし → スキップ
- 英数字・`_`・`.` のドット区切り識別子

`dagayn:` 形式のdirectiveは作者宣言の依存として未解決でも `DEPENDS_ON` に残る場合がある。

## TESTED_BY の向き

被テストの本番シンボル → テストシンボル。

```text
src/auth.py::login  ──TESTED_BY──>  tests/test_auth.py::test_login
```

`query_graph_tool(pattern="tests_for")` はこの向きをたどる。

## 構造メトリクス（概要）

`dagayn build` 後処理で計算。詳細は [構造メトリクス](/projects/dagayn/metrics/) を参照。

| カテゴリ | 指標 |
| --- | --- |
| コミュニティ | Leiden 分割、cohesion |
| チョークポイント | hub（fan-in/out）、bridge（betweenness） |
| フロー | エントリポイント→葉の経路 |
| パッケージ原則 | ADP / SDP / SAP |

## 関連ページ

- [Markdown / Terraform 連携](/projects/dagayn/integrations/)
- [ストレージと SQLite](/projects/dagayn/storage/)
- [構造メトリクス](/projects/dagayn/metrics/)
- [MCP ツール](/projects/dagayn/mcp-tools/)
