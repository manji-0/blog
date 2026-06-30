---
title: "はじめに"
description: "ローカル知識グラフで AI コードレビューを支える dagayn の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [dagayn](https://github.com/manji-0/dagayn)

**DAG is All You Need** — dagaynは、リポジトリを有向グラフ（DAG）としてローカルに保持し、AIコーディングアシスタントが構造クエリでコードベースを探索するためのツールである。

## 何をするか

dagaynは対応言語のソース、Markdown、TerraformなどをTree-sitterでパースし、ノードとエッジに分解してSQLiteに格納する。その上でFTSインデックス、コミュニティ分割、実行フロー、各種メトリクスを計算し、MCPサーバとしてAIエージェントからクエリ可能にする。

エージェント側は「ファイルを全部読む」代わりに「グラフをたどる」ことで、caller / callee、import関係、テスト対応、ドキュメントとコードの橋渡しなどをトークン効率よく取得できる。

## 背景

CursorやClaude Codeなどのエージェントは、タスクごとにファイルを開き直し、grepや全文検索で関連箇所を探す。リポジトリが大きくなるほど、この反復はトークン消費とレイテンシの両方でコストになる。

「この関数のcallerは誰か」「この変更のblast radiusはどこまでか」「この設計書はどのコードを説明しているか」といった問いは、ファイル単位のコンテキストでは効率よく答えにくい。構造を毎回再構築するのではなく、一度パースして永続化したグラフに問い合わせる方が合理的である。

## code-review-graph からの fork

dagaynのコアコンセプトは [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) に由来する。原作はTirth Kanani氏によるMITライセンスのプロジェクトで、Tree-sitterパース、SQLite格納、impact radius、コミュニティ検出、フロー抽出までを既に確立していた。

dagaynはその上にTerraformの1st-class対応、Markdown directiveによる文書間依存、`CROSS_ARTIFACT` エッジ、ADP / SDP / SAPメトリクス、複数AIツール向けの `dagayn install` 統合などを積み重ねている。

## ドキュメントの読み方

### 初めて使う

1. [インストール](/projects/dagayn/installation/)
2. [クイックスタート](/projects/dagayn/quickstart/)
3. [MCP ツール](/projects/dagayn/mcp-tools/) — エージェントからの主要な問い合わせ

### 日常運用

| 関心 | ページ |
| --- | --- |
| CLI 全般 | [CLI リファレンス](/projects/dagayn/cli-reference/) |
| ノード・エッジ・対応言語 | [グラフモデル](/projects/dagayn/graph-model/) |
| 設計書・Terraform 連携 | [Markdown / Terraform 連携](/projects/dagayn/integrations/) |
| 埋め込み検索 | [セマンティック検索](/projects/dagayn/semantic-search/) |

### 仕組みを理解する

1. [アーキテクチャ](/projects/dagayn/architecture/) — パイプライン全体とGraphStore境界
2. [ストレージと SQLite](/projects/dagayn/storage/) — スキーマ、更新、探索戦略
3. [構造メトリクス](/projects/dagayn/metrics/) — コミュニティ、フロー、ADP / SDP / SAP
4. [レビューと影響分析](/projects/dagayn/review-analysis/) — 変更検出とblast radius
5. [開発環境](/projects/dagayn/development/)
6. 困ったときは [トラブルシューティング](/projects/dagayn/troubleshooting/)

## 他プロジェクトとの関係

| レイヤ | 役割 |
| --- | --- |
| **dagayn** | コード・設計書・Terraformを横断する構造グラフとレビュー支援 |
| **[rdra-ish](/projects/rdra-ish/)**（任意） | 要件モデル（`.rdra`）の型チェックと図表生成（上流） |
| **kamae / kamae-rs 等** | 各言語でのidiomaticなドメイン設計（実装） |

rdra-ishで書いた要件モデルやkamaeで書いたドメインコードを、同じリポジトリ内でdagaynが `CROSS_ARTIFACT` エッジとして結びつける。設計書→コード、要件→実装のトレースに使える。

## 使うべき場面 / 使わない場面

**向いているケース**

- リポジトリ規模が大きく、エージェントが同じファイルを繰り返し読んでいる
- caller / callee、import関係、テスト対応など**構造クエリ**がレビューやリファクタのボトルネックになっている
- コードに加え **Markdown設計書** や **Terraform** を横断して追跡したい
- 変更のblast radiusや実行フロー影響を、差分から機械的に洗い出したい
- ローカル完結（`fts-only`）で運用でき、ソースを外部に出したくない

**向いていないケース**

- 小規模な単一言語リポジトリでgrepとLSPで十分
- `dagayn build` の初回コストと、hookによるインクリメンタル更新の運用コストを許容できない
- リモートのみで動くクラウドIDEなど、ローカルMCPが使えない環境

## 関連記事

- [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/) — 背景、メトリクス詳説、dagayn自身への適用例
- [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/) — SQLite最適化とRust移行の方針

dagaynは「ファイルを全部読む」エージェントを「グラフをたどる」エージェントに変える道具である。まず [クイックスタート](/projects/dagayn/quickstart/) から試すのが手堅い。
