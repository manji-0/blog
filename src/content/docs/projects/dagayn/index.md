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

## 対応アーティファクト

| 種別 | 内容 |
| --- | --- |
| **ソースコード** | Python、TypeScript / JavaScript、Rust、Go、Java、C#、Ruby、PHP、Scala、Swift、Kotlin、Julia など |
| **Markdown** | 設計書・README。directiveとコードスパンから文書間・文書→コードのエッジを抽出 |
| **Terraform** | `resource` / `module` / `data` などblock種別ごとの専用ノード |
| **Notebook** | Jupyter `.ipynb` のセル単位解析 |

ポリグロットなリポジトリ（アプリ + インフラ + 設計書）を1つのグラフに載せ、横断クエリできるのがdagaynの設計上の強みである。

## グラフの語彙

### ノード

代表的なノード種別は次のとおりである。

| 種別 | 意味 |
| --- | --- |
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

## 構造メトリクス

`dagayn build` の後処理で、リファクタリングの **観測フェーズ** に使える数値指標を計算する。ソースを1行も読まずに「どこに手を入れるべきか」を絞り込める。

### コミュニティ・Hub・Bridge

| 指標 | 意味 |
| --- | --- |
| **Community cohesion** | Leiden分割後の凝集度。低くてサイズが大きいコミュニティは内部境界が無い塊の候補 |
| **Hub nodes** | 入次数・出次数が異常に高いノード。type couplingやdispatcher couplingの兆候 |
| **Bridge nodes** | betweenness centralityが高いノード。変更時のblast radiusが大きいチョークポイント |

`get_architecture_overview_tool` がこれらを1ショットで返す。リポジトリ初見診断の起点として使う。

### 実行フロー（Flows）

CLIコマンド、HTTPハンドラ、MCPツールハンドラなどのエントリポイントから葉に向かう到達経路を事前計算する。`get_affected_flows_tool` で「この関数を変えたらどのフローが壊れるか」を調べられる。

### ADP / SDP / SAP

Robert C. Martinのパッケージ設計原則のうち、計測可能な3つを実装している。依存グラフの母集団は `IMPORTS_FROM` / `DEPENDS_ON` / `INHERITS` / `IMPLEMENTS`（`CALLS` は除外）。

| 原則 | 問い | 主な出力 |
| --- | --- | --- |
| **ADP** | パッケージ間に循環がないか | severity付きサイクル一覧 |
| **SDP** | 依存は安定側へ向いているか | 不安定度 `I` と違反エッジ |
| **SAP** | 安定パッケージは抽象的か | 抽象度 `A`、main sequenceからの距離 `D` |

リファクタ前後で同じコマンドを叩けば、主観ではなく数値で改善を検証できる。

## CLI ワークフロー

典型的な流れは次のとおりである。

| コマンド | 役割 |
| --- | --- |
| `dagayn install` | MCP設定・hooks・skillsをAIツールへ登録 |
| `dagayn build` | フルビルド（初回または再構築） |
| `dagayn update` | 変更ファイルのインクリメンタル更新 |
| `dagayn serve` | MCPサーバ起動 |
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

補助として `architecture_analysis_tool`（コミュニティ・hub・bridgeの俯瞰）、`flow_tool`（実行フロー）、`get_minimal_context_tool`（タスク向け最小コンテキスト）、ADP / SDP / SAP系ツールなども用意されている。全体で40個前後のMCPツールを提供する。

## hooks

`dagayn install` はファイル保存時にグラフを更新するhookを登録できる。典型的には `dagayn update --skip-flows` を走らせ、パースとエッジ更新を自動化する。フロー再計算はコストが高いため、日常のhookではスキップし、必要時にフルビルドする運用が現実的である。

## 埋め込みモード

セマンティック検索には複数のモードがある。

| モード | 概要 |
| --- | --- |
| `fts-only` | FTS5のみ。外部API不要。セットアップが最も軽い |
| `local-embedding` | ローカル埋め込み（OpenAI互換エンドポイントまたは同梱sidecar） |
| `local-embedding-llama` | 管理付きllama-server sidecar（Qwen等） |
| リモートAPI | OpenAI / Google / MiniMax等のクラウド埋め込みAPI |

`semantic_search_nodes_tool` は埋め込みが無い場合FTSにフォールバックする。機密リポジトリでは `fts-only` または `local-embedding` を選べば、ソースコードをクラウドへ送らずに運用できる。

## プライバシーと local-first

グラフの構築・保存・クエリはすべてローカルで完結する。`fts-only` モードではネットワーク通信は不要である。リモート埋め込みを使う場合も、送信されるのはシンボル名や要約テキストに限られ、フルソースの一括アップロードは行わない設計である。

リポジトリの構造情報は `.dagayn/` 以下に留まり、チームで共有したい場合はこのディレクトリをgitignoreしたまま、各開発者がローカルでビルドする運用が基本である。

## 他プロジェクトとの関係

| レイヤ | 役割 |
| --- | --- |
| **dagayn** | コード・設計書・Terraformを横断する構造グラフとレビュー支援 |
| **rdra-ish**（任意） | 要件モデル（`.rdra`）の型チェックと図表生成（上流） |
| **kamae / kamae-rs 等** | 各言語でのidiomaticなドメイン設計（実装） |

rdra-ishで書いた要件モデルやkamaeで書いたドメインコードを、同じリポジトリ内でdagaynが `CROSS_ARTIFACT` エッジとして結びつける。設計書→コード、要件→実装のトレースに使える。

## 使うべき場面 / 使わない場面

**向いているケース**

- リポジトリ規模が大きく、エージェントが同じファイルを繰り返し読んでいる
- caller / callee、import関係、テスト対応など**構造クエリ**がレビューやリファクタのボトルネックになっている
- コードに加え **Markdown設計書** や **Terraform** を横断して追跡したい
- 変更のblast radiusや実行フロー影響を、差分から機械的に洗い出したい
- ローカル完結（`fts-only`）で運用でき、ソースを外部に出したくない
- Cursor / Claude Code / Copilot等で **MCP** が使える環境にある
- 数値メトリクス（コミュニティ凝集度、ADP / SDP / SAP、hub / bridge）でアーキテクチャ診断を補助したい

**向いていないケース**

- 小規模な単一言語リポジトリでgrepとLSPで十分
- `dagayn build` の初回コストと、hookによるインクリメンタル更新の運用コストを許容できない
- リモートのみで動くクラウドIDEなど、ローカルMCPが使えない環境

まず `dagayn build` と `dagayn status` でグラフ規模を確認し、MCP経由の `review_tool` で差分レビューを試すのが手堅い評価手順である。

## レビュー観点

dagaynを導入したあと、次の観点で運用を確認すると効果的である。

- **グラフ鮮度**: `dagayn status` で最終更新時刻とノード数が期待どおりか
- **差分レビュー**: `review_tool` の `mode=changes` で変更のimpactが過不足なく取れているか
- **構造クエリ**: `query_graph_tool` でcaller / tests_for / docs_forが実務の問いに答えられるか
- **アーキテクチャ診断**: `get_architecture_overview_tool` とADP / SDP / SAPでリファクタ候補が妥当か
- **ドキュメント連携**: Markdown directiveとコードスパンが意図どおり `CROSS_ARTIFACT` になっているか
- **hook負荷**: 日常の `dagayn update --skip-flows` が保存体感を壊していないか

## 関連記事

- [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/) — 背景、メトリクス詳説、dagayn自身への適用例
- [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/) — SQLite最適化とRust移行の方針

dagaynは「ファイルを全部読む」エージェントを「グラフをたどる」エージェントに変える道具である。構造を一度パースして永続化し、MCP経由で問い合わせる運用が最も効く。
