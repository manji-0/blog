---
title: "はじめに"
description: "ローカル知識グラフで AI コードレビューを支える dagayn の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [dagayn](https://github.com/manji-0/dagayn) · 対象バージョン: **v4.14.0**

**DAG is All You Need**。dagaynは、リポジトリをローカルの有向グラフとして持ち、AIコーディングアシスタントが構造クエリでコードベースを辿れるようにするツールです。

## 目的

エージェントがファイルを開き直してgrepする反復を減らし、caller・import・テスト対応・設計書とコードの橋をグラフから取れるようにします。

## 背景

CursorやClaude Codeのようなエージェントは、タスクのたびにファイルを開き全文検索で関連箇所を探します。リポジトリが大きいほど、その反復がトークンと待ち時間を消費します。「この関数のcallerは誰か」「この変更の影響範囲はどこまでか」「この設計書はどの実装を指しているか」は、毎回読み直すより一度パースした構造に聞く方が合理的です。

コアの着想は [code-review-graph](https://github.com/tirth8205/code-review-graph) にあります。dagaynはTerraform、Markdown directive、設計書とコードをつなぐ `CROSS_ARTIFACT`、パッケージ健全性のADP / SDP / SAP、marimoノートブック、日本語FTS、複数ツール向けの `dagayn install` などを足しています。Pythonのグラフエンジンは廃止済みで、`DAGAYN_BACKEND=python` はエラーになります。

## 関連文書

| 種別 | リンク |
| --- | --- |
| ブログ | [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/) |
| ブログ | [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/) |
| upstream | [ARCHITECTURE.md](https://github.com/manji-0/dagayn/blob/main/docs/ARCHITECTURE.md)、[SCHEMA.md](https://github.com/manji-0/dagayn/blob/main/docs/SCHEMA.md) |

## 目標

差分レビューでエージェントが読むトークン量を下げ、構造クエリの応答時間をgrep反復より短くします。設計書・Terraform・ソースを同一グラフで横断し、影響範囲の見落としを減らします。`fts-only` 運用ではソースを外部へ送らずに検索できます。

## 対象外

grepとLSPが足りる小さな単一言語リポジトリには向きません。初回 `dagayn build` とhook更新のコストを払えない場合、ローカルMCPが使えないクラウドIDEだけの環境でも、利点は小さくなります。

## シナリオ

1. 開発者が認証モジュールの関数シグネチャを変更し、ステージしてコミット前にCursorでレビューを依頼する。
2. エージェントが `review_tool(mode="changes")` で差分ノードと `guidance` を取得する。
3. `query_graph_tool(pattern="callers_of")` と `tests_for` で呼び出し元とテスト不足を確認する。
4. 設計書の `CROSS_ARTIFACT` 先を `docs_for` でたどり、doc更新の要否を判断する。
5. hookが走った `dagayn update --skip-flows` 後のグラフを読み、影響範囲の指摘を返す。

## 構成

```diagram-design dagayn-pipeline
```

対応言語のソース、Markdown、Terraform、ノートブック（`.ipynb` とmarimoの `.py` / `.md`）をTree-sitterでパースし、SQLiteに載せます。グラフエンジン、フロー、コミュニティ、FTSはRustコア（`dagayn._core`）です。その上で日本語向けFTS（Lindera IPADIC + CJKバイグラム）、実行フロー、各種メトリクスを計算し、MCP経由でエージェントから問い合わせます。

## 制約

グラフは各開発者の `.dagayn/` にローカル保存され、チーム共有はgitignoreのまま各自ビルドが基本です。hookの既定は `dagayn update --skip-flows` です。フロー再計算は重いため、日常では省略します。MCPのコンパクト面はレビュー向けツールに絞り、拡張面は `--tools all` や `CRG_TOOLS` で出します。

## インタフェース

| 面 | 入口 |
| --- | --- |
| CLI | `dagayn build` / `update` / `detect-changes` / `serve` 等 |
| MCP | `review_tool`、`query_graph_tool`、`semantic_search_nodes_tool` 等 |
| セットアップ | `dagayn install`（MCP設定、hooks、skills） |

ファイルを開き直してgrepする代わりに、callerやimport、テスト対応、設計書とコードの橋、ヒットしたノードのソース断片（`source_of`）をグラフから取れます。

## 依存

| 依存 | 役割 |
| --- | --- |
| Python 3.12+ | CLI・MCP・オーケストレーション |
| `dagayn._core`（Rust/PyO3） | パース、SQLite、FTS、フロー、コミュニティ |
| Tree-sitter grammars | 40言語以上、Markdown/Terraform fork |
| SQLite | `graph.db` / `embeddings.db` |
| Git worktree | 変更検出（staged / unstaged / untracked） |

同じリポジトリに [rdra-ish](/projects/rdra-ish/) やkamae系を置くと `CROSS_ARTIFACT` で設計書と実装をつなげます。どれも必須ではありません。

## 検討して捨てた案

**リモート常時同期グラフ**：エージェントが触るのは手元リポジトリの構造であり、ネットワークグラフDBの運用コストに見合いませんでした。

**リクエスト時のNetworkX組み立て**：MCPレイテンシを抑えるため、フロー・コミュニティ・FTSをビルド後にmaterializeする方式を採りました。

**Pythonのみのグラフエンジン**：大規模リポジトリのパースと探索でRustコアへ移行済みです。`DAGAYN_BACKEND=python` はエラーになります。

## 次に読む

動かすなら [使い方](/projects/dagayn/usage/) です。パイプラインの詳細は [アーキテクチャ](/projects/dagayn/architecture/) へ。
