---
title: "dagayn とは"
description: "ローカル知識グラフで AI コードレビューを支える dagayn の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [dagayn](https://github.com/manji-0/dagayn)

**DAG is All You Need** — dagaynは、リポジトリを有向グラフ（DAG）としてローカルに保持し、AIコーディングアシスタントが構造クエリでコードベースを探索するためのツールである。

## 背景：AI は同じリポジトリを何度も読む

CursorやClaude Codeなどのエージェントは、タスクごとにファイルを開き直し、grepや全文検索で関連箇所を探す。リポジトリが大きくなるほど、この反復はトークン消費とレイテンシの両方でコストになる。

さらに「この関数のcallerは誰か」「この変更のblast radiusはどこまでか」「この設計書はどのコードを説明しているか」といった問いは、ファイル単位のコンテキストでは効率よく答えにくい。構造を毎回再構築するのではなく、一度パースして永続化したグラフに問い合わせる方が合理的である。

## dagayn がすること

dagaynは対応言語のソース、Markdown、TerraformなどをTree-sitterでパースし、ノードとエッジに分解してSQLiteに格納する。その上でFTSインデックス、コミュニティ分割、実行フロー、各種メトリクスを計算し、MCPサーバとしてAIエージェントからクエリ可能にする。

エージェント側は「ファイルを全部読む」代わりに「グラフをたどる」ことで、caller / callee、import関係、テスト対応、ドキュメントとコードの橋渡しなどをトークン効率よく取得できる。

## code-review-graph からの fork

dagaynのコアコンセプトは [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) に由来する。原作はTirth Kanani氏によるMITライセンスのプロジェクトで、Tree-sitterパース、SQLite格納、impact radius、コミュニティ検出、フロー抽出までを既に確立していた。

dagaynはその上にTerraformの1st-class対応、Markdown directiveによる文書間依存、`CROSS_ARTIFACT` エッジ、ADP / SDP / SAPメトリクス、複数AIツール向けの `dagayn install` 統合などを積み重ねている。forkとして明示的にクレジットを記載している。

## アーキテクチャ

中核は **Tree-sitter + SQLite** である。パーサがASTからシンボルと関係を抽出し、グラフストアがノード・エッジを永続化する。探索・集計のホットパスは段階的に **Rust**（`dagayn_core`）へ移行しており、Python層はCLI・MCP・オーケストレーションを担う。

```mermaid
flowchart LR
  A[ソースファイル] --> B[Tree-sitter パース]
  B --> C[ノード / エッジ抽出]
  C --> D[(SQLite グラフ)]
  D --> E[後処理<br/>FTS / コミュニティ / フロー]
  E --> F[MCP / CLI クエリ]
  F --> G[AI エージェント]
```

グラフはリポジトリ直下の `.dagayn/graph.db`（および関連アーティファクト）に保存される。ビルドはインクリメンタル更新に対応し、ファイル変更後は `dagayn update` で差分反映できる。

## グラフの語彙

### ノード

代表的なノード種別は次のとおりである。

| 種別 | 意味 |
|------|------|
| `File` | ソースファイル |
| `Class` | クラス / 構造体など |
| `Function` | 関数 / メソッド |
| `Type` | 型定義 |
| `Test` | テスト関数 |

Terraformでは `resource_block` / `module_block` などblock種別ごとの専用ノードを持つ。Markdownはファイルおよびセクション単位で扱う。

### エッジ

関係はエッジ種別で区別する。例として `CONTAINS`（包含）、`CALLS`（呼び出し）、`IMPORTS_FROM`（import）、`INHERITS` / `IMPLEMENTS`（継承・実装）、`DEPENDS_ON`（汎用依存）、`TESTED_BY`（テスト対応）、`REFERENCES`、`CROSS_ARTIFACT`（ドキュメントとコードの橋）がある。

エッジ種別を分けることで、依存分析では `CALLS` を除外してノイズを抑えつつ、impact分析では呼び出し関係も含められる。

## Terraform と Markdown

**Terraform** はforkした `tree-sitter-terraform` により、`resource` / `data` / `module` などを個別ノード型として抽出する。HCL全般ではなくTerraform運用に必要な構造を直接クエリできる。

**Markdown** はforkした `tree-sitter-markdown` でHTMLコメント形式のdirective（`<!-- constrained-by path/to/doc.md -->` など）を認識し、文書間の `DEPENDS_ON` としてグラフ化する。さらにインラインコードスパンからシンボル名を解決し、ドキュメントからコードへの `CROSS_ARTIFACT` エッジを張る。`docs_for` / `implementations_of` クエリで双方向にたどれる。

## CLI ワークフロー

典型的な流れは次のとおりである。

| コマンド | 役割 |
|----------|------|
| `dagayn install` | MCP 設定・hooks・skills を AI ツールへ登録 |
| `dagayn build` | フルビルド（初回または再構築） |
| `dagayn update` | 変更ファイルのインクリメンタル更新 |
| `dagayn serve` | MCP サーバ起動 |
| `dagayn status` | グラフの有無・鮮度・統計を表示 |

`dagayn install` はCursor / Claude Code / Copilot / Codex CLIなどの設定形式差分を吸収し、ワンコマンドでMCPエントリを書き込む。

### クイックスタート

```bash
# インストール（pip または uv）
uv tool install dagayn
# pip install dagayn でも可

# AI ツールへ MCP・hooks を登録
dagayn install --platform all --mode fts-only -y

# リポジトリでグラフを構築
cd your-repo
dagayn build

# 状態確認
dagayn status
```

## MCP ツール

dagaynはMCPサーバとして起動し、エージェントからグラフ操作ツールを公開する。代表的なものは次のとおりである。

- **`review_tool`** — 変更検出・レビューコンテキスト・影響フロー・impact radiusをモード切替で取得する。`mode=changes` で差分起点のレビュー、`mode=impact` でblast radius分析ができる。
- **`query_graph_tool`** — `callers_of` / `callees_of` / `imports_of` / `tests_for` / `docs_for` など定義済みパターンで関係をたどる。
- **`semantic_search_nodes_tool`** — 埋め込みベクトルまたはFTS5によるハイブリッド検索。関数名を覚えていなくても意味的に近いシンボルを探せる。

補助として `architecture_analysis_tool`（コミュニティ・hub・bridgeの俯瞰）、`flow_tool`（実行フロー）、`get_minimal_context_tool`（タスク向け最小コンテキスト）なども用意されている。

## hooks

`dagayn install` はファイル保存時にグラフを更新するhookを登録できる。典型的には `dagayn update --skip-flows` を走らせ、パースとエッジ更新を自動化する。フロー再計算はコストが高いため、日常のhookではスキップし、必要時にフルビルドする運用が現実的である。

## 埋め込みモード

セマンティック検索には複数のモードがある。

| モード | 概要 |
|--------|------|
| `fts-only` | FTS5 のみ。外部 API 不要。セットアップが最も軽い |
| `local-embedding` | ローカル埋め込み（OpenAI 互換エンドポイントまたは同梱 sidecar） |
| `local-embedding-llama` | 管理付き llama-server sidecar（Qwen 等） |
| リモート API | OpenAI / Google / MiniMax 等のクラウド埋め込み API |

`semantic_search_nodes_tool` は埋め込みが無い場合FTSにフォールバックする。機密リポジトリでは `fts-only` または `local-embedding` を選べば、ソースコードをクラウドへ送らずに運用できる。

## プライバシーと local-first

グラフの構築・保存・クエリはすべてローカルで完結する。`fts-only` モードではネットワーク通信は不要である。リモート埋め込みを使う場合も、送信されるのはシンボル名や要約テキストに限られ、フルソースの一括アップロードは行わない設計である。

リポジトリの構造情報は `.dagayn/` 以下に留まり、チームで共有したい場合はこのディレクトリをgitignoreしたまま、各開発者がローカルでビルドする運用が基本である。

## レビュー観点

dagaynを導入するか判断するときのチェックリストである。

- リポジトリ規模が大きく、エージェントが同じファイルを繰り返し読んでいる
- caller / callee、import関係、テスト対応など**構造クエリ**がレビューやリファクタのボトルネックになっている
- コードに加え **Markdown 設計書** や **Terraform** を横断して追跡したい
- 変更のblast radiusや実行フロー影響を、差分から機械的に洗い出したい
- ローカル完結（`fts-only`）で運用でき、ソースを外部に出したくない
- Cursor / Claude Code / Copilot等で **MCP** が使える環境にある
- `dagayn build` の初回コストと、hookによるインクリメンタル更新の運用コストを許容できる
- 数値メトリクス（コミュニティ凝集度、ADP / SDP / SAP、hub / bridge）でアーキテクチャ診断を補助したい

逆に、小規模な単一言語リポジトリでgrepとLSPで十分なら、導入の優先度は下がる。まず `dagayn build` と `dagayn status` でグラフ規模を確認し、MCP経由の `review_tool` で差分レビューを試すのが手堅い評価手順である。
