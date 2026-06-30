---
title: "Markdown / Terraform 連携"
description: "dagayn の Markdown と Terraform パース"
sidebar:
  order: 6
---

dagaynはアプリケーションコードだけでなく、設計書とインフラ定義を同じグラフに載せる。これにより「このADRはどのモジュールを制約しているか」「このTerraform module変更のblast radiusはどこか」を横断的にたどれる。

## Markdown

### 抽出されるノード

| 要素 |  qualified name | 種別 |
| --- | --- | --- |
| ドキュメント | ファイルパス | File |
| `# Heading` … | `file::slug` | DocSection |
| 見出し配下の本文 | `file::slug--body-N` | DocBody |

見出しslugはGitHub Markdown規約に従う（小文字化、空白→`-`、非英数字除去）。同一ファイル内の重複見出しには `-1`, `-2` サフィックス。

### エッジ

- **CONTAINS** — 見出し階層
- **REFERENCES** — `[text](./other.md#section)` や `[text](#local)`
- **IMPORTS_FROM** — 別ファイルへのリンク
- **DEPENDS_ON** — directiveコメント
- **CROSS_ARTIFACT** — インラインコードスパン `` `SymbolName` `` からコードシンボルへ（一意に解決できた場合のみ）

### Directive コメント

HTMLコメント形式で文書間依存を機械可読に記述する。

```markdown
<!-- constrained-by ./decisions/adr-001.md#context -->
<!-- blocked-by ./specs/open-issue.md -->
<!-- supersedes ./old-api.md#endpoint-design -->
<!-- derived-from ./research/background.md#findings -->
```

| directive | 意味 |
| --- | --- |
| `constrained-by` | 参照先がこのセクションの設計を制約する |
| `blocked-by` | 参照先が解決するまで実装をブロック |
| `supersedes` | この文書が参照先を置き換える |
| `derived-from` | このセクションが参照先から派生 |

各directiveは **DEPENDS_ON** エッジになる。`markdown_directive_kind` 属性に種別が記録される。

### コードスパンと CROSS_ARTIFACT

バッククォートで囲んだ識別子（3文字以上、または `_` / `.` を含む）はコードグラフ上のシンボルと照合される。

- 0件または複数件マッチ → エッジは破棄
- 1件マッチ → `CROSS_ARTIFACT` エッジ（confidence HIGH）

`query_graph_tool` の `docs_for` / `implementations_of` で双方向にたどれる。

設計書の書き方の詳細はupstreamの `docs/MARKDOWN-AUTHORING.md` も参照。

## Terraform

`.tf` と `.tfvars` を専用Tree-sitter grammarでパースする。

### block 種別

| block | qualified name 例 | 種別 |
| --- | --- | --- |
| `resource "aws_s3_bucket" "logs"` | `resource.aws_s3_bucket.logs` | Class |
| `variable "region"` | `var.region` | Function |
| `module "vpc"` | `module.vpc` | Class |
| `output "endpoint"` | `output.endpoint` | Function |
| `check "valid"` | `check.valid` | Test |

### エッジ

- **REFERENCES** — `var.x`, `local.x`, `module.x`, `data.type.name`, `resource.type.name` 等の式参照
- **CALLS** — `merge()`, `length()` 等の組込関数
- **IMPORTS_FROM** — `module` の `source`、provider source、`import` block
- **CONTAINS** — ファイル→block
- **DEPENDS_ON** — `required_providers` のバージョン制約

### クロスモジュール

`module` blockの `source` がローカルパスの場合、呼び出し元からターゲットディレクトリへの `IMPORTS_FROM` が記録され、impact radiusがモジュール境界を越えて追跡できる。

### .tfvars

トップレベル属性は `var.name` ノードとなり、対応する `variable` blockへREFERENCESで接続される。

## レビュー観点

- Markdown directiveが意図どおり `DEPENDS_ON` になっているか
- コードスパンが一意に解決して `CROSS_ARTIFACT` になっているか（曖昧な短い名前は避ける）
- Terraform moduleの `source` パスがグラフ上で追跡できるか

## 関連ページ

- [グラフモデル](/projects/dagayn/graph-model/)
- [MCP ツール](/projects/dagayn/mcp-tools/) — `docs_for`, `implementations_of`
- [rdra-ish](/projects/rdra-ish/) — 要件モデルとコードの上流連携
