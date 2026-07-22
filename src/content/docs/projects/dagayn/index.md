---
title: "はじめに"
description: "ローカル知識グラフで AI コードレビューを支える dagayn の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [dagayn](https://github.com/manji-0/dagayn)

**DAG is All You Need** — dagaynは、リポジトリをローカルの有向グラフとして持ち、AIコーディングアシスタントが構造クエリでコードベースを辿れるようにするツールです。

対応言語のソースやMarkdown、TerraformをTree-sitterでパースし、ノードとエッジにしてSQLiteに載せます。その上でFTS、コミュニティ分割、実行フロー、各種メトリクスを計算し、MCP経由でエージェントから問い合わせます。ファイルを開き直してgrepする代わりに、callerやimport、テスト対応、設計書とコードの橋をグラフから取れる、というのが狙いです。

## なぜ必要か

CursorやClaude Codeのようなエージェントは、タスクのたびにファイルを開き、全文検索で関連箇所を探します。リポジトリが大きくなるほど、その反復がトークンと待ち時間の両方を食います。

「この関数のcallerは誰か」「この変更の影響範囲（blast radius）はどこまでか」「この設計書はどの実装を指しているか」は、毎回ファイルを読み直すより、一度パースした構造に聞く方が合理的です。

コアの着想は [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) にあります。dagaynはそこにTerraform、Markdown directive、設計書とコードをつなぐ `CROSS_ARTIFACT`、パッケージ健全性のADP / SDP / SAP、複数ツール向けの `dagayn install` などを足しています。経緯の長めの話は [ブログ記事](/blog/2026/dagayn-knowledge-graph-for-code-review/) へ。用語の定義は [グラフモデル](/projects/dagayn/graph-model/) と [構造メトリクス](/projects/dagayn/metrics/) にあります。

## どこから読むか

| 目的 | 読む順 |
| --- | --- |
| まず動かす | [インストール](/projects/dagayn/installation/) → [クイックスタート](/projects/dagayn/quickstart/) |
| エージェントから使う | [MCP ツール](/projects/dagayn/mcp-tools/) |
| 語彙・グラフ構造 | [グラフモデル](/projects/dagayn/graph-model/) |
| 差分レビュー | [レビューと影響分析](/projects/dagayn/review-analysis/) |

CLIは [CLI リファレンス](/projects/dagayn/cli-reference/)、設計書連携は [Markdown / Terraform 連携](/projects/dagayn/integrations/)、意味検索は [セマンティック検索](/projects/dagayn/semantic-search/)（最短手順の `fts-only` では埋め込みなし）。パイプライン全体は [アーキテクチャ](/projects/dagayn/architecture/)、詰まったら [トラブルシューティング](/projects/dagayn/troubleshooting/) へ。

## まわりのツールとの関係

同じリポジトリに [rdra-ish](/projects/rdra-ish/) の要件モデルやkamae系のドメインコードを置いておくと、dagaynが `CROSS_ARTIFACT` で設計書と実装をつなげます。要件の型チェック自体はrdra-ish、idiomaticなドメイン設計はkamae側の仕事です。どれも必須ではありません。

## 向いていること / 向いていないこと

エージェントが同じファイルを何度も読み直しているときや、caller・import・テスト対応といった構造クエリがボトルネックのときに効きます。

設計書やTerraformまで同じグラフで追いたい用途にも向いています。差分からblast radiusを機械的に出したいときも同様です。`fts-only` なら、ソースを外部へ送らずに運用できます（意味検索を本格利用するときは [セマンティック検索](/projects/dagayn/semantic-search/) を参照）。

grepとLSPで足りる小さな単一言語リポジトリには過剰です。初回の `dagayn build` とhookによる更新のコストを許容できないとき、ローカルMCPが使えないクラウドIDEだけ、といった環境でも利点は小さくなります。

## もう少し深い話

- [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/)
- [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/)

動かしてみるなら [クイックスタート](/projects/dagayn/quickstart/) からどうぞ。
