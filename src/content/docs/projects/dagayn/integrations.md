---
title: "Markdown / Terraform 連携"
description: "dagayn の Markdown と Terraform パース"
sidebar:
  order: 6
---

dagaynはアプリケーションコードだけでなく、設計書とインフラ定義を同じグラフに載せる。ポリグロットリポジトリで **コード ↔ 設計書 ↔ インフラ** を横断クエリできるのがforkの主要な差分である。

## Markdown

### ノード階層

```text
File (docs/architecture.md)
  └── DocSection (docs/arch.md::overview)
        ├── DocSection (docs/arch.md::api-design)  [CONTAINS]
        └── DocBody (docs/arch.md::overview--body-1)  [CONTAINS]
```

| 要素 | qualified name | kind |
| --- | --- | --- |
| ドキュメント | ファイルパス | `File` |
| `# Heading` … `######` | `file::slug` | `DocSection` |
| Setext H1/H2 | 同上 | `DocSection` |
| 段落・リスト・表・コードブロック | `file::slug--body-N` | `DocBody` |

### 見出し slug 規則

GitHub Markdown互換：

- 英数字は小文字化
- 空白・ハイフンは `-` に統一
- その他記号は除去
- 重複見出しは `-1`, `-2` サフィックス

例：`## API Reference` → `api-reference`、`## user_id lookup` → `user_id-lookup`

### エッジ種別

| kind | トリガー |
| --- | --- |
| `CONTAINS` | 見出しの親子関係 |
| `REFERENCES` | `[text](./other.md#section)` または `[text](#local)` |
| `IMPORTS_FROM` | 別ファイルへのリンク |
| `DEPENDS_ON` | directive コメント |
| `CROSS_ARTIFACT` | インラインコードスパン（後処理で解決） |

外部URL（`http://`, `mailto:`）は無視する。

### Directive コメント

HTMLコメント形式で文書間依存を機械可読にする。

```markdown
<!-- constrained-by ./decisions/adr-001.md#context -->
<!-- blocked-by ./specs/open-issue.md -->
<!-- supersedes ./old-api.md#endpoint-design -->
<!-- derived-from ./research/background.md#findings -->
```

| directive | 意味 | 典型用途 |
| --- | --- | --- |
| `constrained-by` | 参照先が設計を制約 | ADR → 設計書 |
| `blocked-by` | 参照先解決まで実装ブロック | 未決 issue |
| `supersedes` | この文書が参照先を置換 | 旧 API doc |
| `derived-from` | このセクションが参照先から派生 | 調査メモ → 設計 |

各directiveは `DEPENDS_ON` エッジ。`markdown_directive_kind` 属性に種別が記録される。

### リンク形式

| 形式 | エッジ |
| --- | --- |
| `[text](./path.md#section)` | `IMPORTS_FROM` + `REFERENCES` |
| `[text](#local-section)` | 同一ファイル内 `REFERENCES` |
| `[ref]: path` 参照定義スタイル | 同上 |

### コードスパンと CROSS_ARTIFACT

`` `BridgeDetector` `` のようなインラインコードはシンボル名として解決される。

| 結果 | 動作 |
| --- | --- |
| 0 件 | エッジ破棄 |
| 1 件 | `CROSS_ARTIFACT`（confidence HIGH） |
| 複数件 | エッジ破棄 |

短い汎用語（`list`, `parser` 等）はフィルタされる。モジュール修飾名（`module.Class`）を使うと一意解決しやすい。

`query_graph_tool`：

- `docs_for` — コード → 関連doc
- `implementations_of` — doc → 実装コード

### 設計書の書き方

upstream `docs/MARKDOWN-AUTHORING.md` にdagayn向けの執筆ガイドがある。directiveの置き場所、セクション依存の順序、コードスパンの選び方をまとめている。

## Terraform

fork `tree-sitter-terraform` で `.tf` / `.tfvars` をパースする。HCL全般ではなく **Terraform 運用に必要な構造** を直接クエリする。

### block → ノード

| block | qualified name | kind |
| --- | --- | --- |
| `resource "type" "name"` | `resource.type.name` | Class |
| `data "type" "name"` | `data.type.name` | Class |
| `variable "name"` | `var.name` | Function |
| `locals { k = … }` | `local.k`（属性ごと） | Function |
| `output "name"` | `output.name` | Function |
| `module "name"` | `module.name` | Class |
| `provider "name"` | `provider.name` | Class |
| `terraform {}` | `terraform` | Class |
| `check "name"` | `check.name` | Test |
| `ephemeral "type" "name"` | `ephemeral.type.name` | Class |

`import {}` / `moved {}` / `removed {}` はエッジのみ（ノードなし）。

### エッジ

| kind | 抽出元 |
| --- | --- |
| `REFERENCES` | `var.x`, `local.x`, `module.x`, `data.type.name`, `resource.type.name` 等の式 |
| `CALLS` | `merge()`, `length()` 等の組込関数 |
| `IMPORTS_FROM` | `module` の `source`、`terraform.required_providers`、`import` block |
| `CONTAINS` | ファイル → block |
| `DEPENDS_ON` | `required_providers` のバージョン制約 |

組込プレフィックス（`count`, `each`, `path`, `self`, `terraform`）はREFERENCES抽出から除外する。

### クロスモジュール

`module` blockの `source` がローカルパスの場合：

```text
module.vpc  ──IMPORTS_FROM──>  modules/vpc/（ディレクトリ）
```

impact radiusがモジュール境界を越えて追跡できる。

### .tfvars

トップレベル属性は `var.name` ノードとなり、対応する `variable` blockへ `REFERENCES` で接続される。変数の **定義と値** をグラフ上でつなげる。

## 横断クエリの例

| 問い | たどり方 |
| --- | --- |
| この ADR はどのコードを制約するか | doc `DEPENDS_ON` → `CROSS_ARTIFACT` → callers |
| この TF module 変更の影響は | `module.x` の REFERENCES / IMPORTS_FROM を impact |
| この関数の説明 doc は | `implementations_of` |

## レビュー観点

- directiveが意図どおり `DEPENDS_ON` になっているか
- コードスパンが `CROSS_ARTIFACT` に一意解決するか
- TF module `source` がグラフ上で追跡できるか
- doc間リンクの `#anchor` が実在セクションを指すか

## 関連ページ

- [グラフモデル](/projects/dagayn/graph-model/)
- [レビューと影響分析](/projects/dagayn/review-analysis/)
- [rdra-ish](/projects/rdra-ish/) — 要件モデルとコードの上流連携
