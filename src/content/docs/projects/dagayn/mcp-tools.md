---
title: "MCP ツール"
description: "dagayn MCP サーバが提供するツール"
sidebar:
  order: 2
---

このページは、dagayn MCPサーバが公開するツール面と推奨ワークフローを扱います。CLI側の同等コマンドは [CLI リファレンス](/projects/dagayn/cli-reference/) へ。グラフ語彙は [グラフモデル](/projects/dagayn/graph-model/) へ。

## ツール面

`dagayn serve` の既定はコンパクトなワークフロー面です。既定のツールは次の9つです。

- `get_minimal_context_tool`、`ensure_graph_tool`、`review_tool`
- `flow_tool`、`architecture_analysis_tool`、`refactor_tool`
- `query_graph_tool`、`semantic_search_nodes_tool`、`get_docs_section_tool`

`dagayn tool --list` で全ツールを確認できます。`--tools` / `CRG_TOOLS` に `all` / `full` / `*` を渡すと拡張面も出ます。

## 応答の共通ルール

主要ツール（`get_minimal_context_tool`、`semantic_search_nodes_tool`、`query_graph_tool`、`review_tool`、`flow_tool`、`architecture_analysis_tool`、`refactor_tool`）の応答は、最後に `next` を返します。`next` は次に呼ぶ最大3件の呼び出しで、各要素が完全な引数と理由（`why`）を持ちます。答えが完結していれば `[]` です。

- `detail_level` を取る6つの分析ツールでは、`"minimal"` は8K文字、`"standard"` は32K文字に収まります。収まらない分は `truncated` や `*_omitted` で件数が示されます。
- `missingness` は、その応答を制限している欠落（別コミットのグラフ、未コミットの編集、曖昧な対象など）だけを挙げます。
- 対象が曖昧なときは `status="ambiguous"` になり、候補ごとの再試行が `next` に入ります。
- 以前の `_hints`、`next_action`、`next_tool_suggestions` は返しません。`guidance` は `detail_level="verbose"` のときだけ返します。

ワークフロー全体は `get_docs_section_tool(section_name="workflow")`、証拠の強さの順位は `section_name="trust"` で読めます。

## レビュー・変更分析

### review_tool

変更検出・レビューコンテキスト・変更に届くエントリポイント・impact radiusをモード切替で取得します。

| mode | 用途 |
| --- | --- |
| `changes` | 差分起点のレビュー（まずここから） |
| `impact` | 影響範囲（blast radius）の分析 |
| `context` | レビュー用コンテキスト取得 |
| `affected_flows` | 変更された関数に届くエントリポイントと呼び出し経路 |

```text
review_tool(mode="changes", detail_level="minimal")
```

`mode="changes"` は `findings` を返します。差分そのものには見えないが、マージ前に確認すべきことの一覧です。種類は `dangling_reference`、`unchanged_caller`、`contract_doc_not_updated`、`bridge_touched`、`unstable_dependency`、`untested_change`、`tests_to_run` です。各findingは `kind`、見る場所、`claim`、`evidence` または `sites`、`action` を持ちます。空なら差分以外に確認すべきことはありません。`base` を省くと、未コミットの変更があれば `HEAD`、なければ `HEAD~1` と比べます。

### get_minimal_context_tool

タスクの説明から最初に呼ぶべきツールを `next` で返し、グラフの鮮度（`sync.state`）と `graph_health` を報告します。グラフが空や古いときはバックグラウンドで更新を積みます。タスクがノードやファイルを名指ししていない場合や、グラフが古いかもしれない場合に呼びます。対象が分かっているなら、その用途のツールを直接呼ぶ方が速いです。

## グラフ探索

### query_graph_tool

定義済みパターンで関係をたどります。検索ヒットのあと、ファイル全体を開き直す前に `source_of` でノードのライブ断片を取るのが推奨です（上限4,000文字。`truncated` / `source_stale` を返すことがあります）。

| pattern | 意味 |
| --- | --- |
| `source_of` | 1ノードの現行ワークツリー断片 |
| `callers_of` | 呼び出し元 |
| `callees_of` | 呼び出し先 |
| `imports_of` | import 関係 |
| `importers_of` | 被import（ファイルパス対象） |
| `tests_for` | テスト対応 |
| `docs_for` | 関連ドキュメント |
| `implementations_of` | ドキュメントからコード実装 |
| `file_summary` | ファイル概要 |
| `inheritors_of` / `children_of` | 継承先 / ファイルやクラスのメンバー |
| `bridges_from` | 高信頼のクロスアーティファクト橋 |

`callers_of`、`importers_of`、`imports_of` は `depth`（1〜6）を取り、推移的な連鎖を1回で返します。各行は `depth` と `via` を持ちます。集合が閉じたかどうかは `reachability` で分かります。`importers_of` / `imports_of` は `import_kind`（`directive`、`link`、`lazy_export`、`path`、`statement`）で辿る辺の種類を絞れます。`path_prefix="src/"` を渡すと、そのパス配下の行だけを残します。出力予算で切られた応答も、見つかった行のファイルを `files` に並べます（最大200件、`minimal` では60件）。`tests_for` は最寄りのテストまでの距離を `test_reach` で返します。

### semantic_search_nodes_tool

FTS5と埋め込みベクトルのハイブリッド検索です。埋め込みが無い場合はFTSにフォールバックします。詳細は [グラフモデル](/projects/dagayn/graph-model/) の検索節を参照してください。

### traverse_graph_tool

検索語で起点を選び、BFSかDFSで深さ1〜6までグラフを走査します。既定のコンパクト面には含まれません（拡張面）。

## アーキテクチャ分析

### architecture_analysis_tool

`mode="overview"` は、リポジトリが宣言するユニット（Cargo crate、npm package、Go module、Python import package、Terraform module）の地図を `units` と `unit_edges` で返し、構造上の `findings` を添えます。findingの種類は `import_cycle`、`unstable_dependency`、`untested_core`、`broken_doc_link` です。リポジトリ初見診断の起点として使います。

| mode | 用途 |
| --- | --- |
| `overview` | ユニットの地図と構造findings |
| `communities` / `community` | コミュニティ一覧と個別詳細 |
| `sdp_metrics` / `sdp_violations` | 宣言ユニット単位のSDP |
| `sap_metrics` / `sap_violations` | 宣言ユニット単位のSAP |
| `import_cycles` | ファイル・ディレクトリ・ユニット間のimport循環をすべて列挙 |

以前の `hubs`、`bridges`、`knowledge_gaps`、`surprising_connections`、`adp_violations` モードはv10.0.0で削除されました。

### flow_tool

`mode="entry_points"` だけを持ちます。`target` を渡すと、そのシンボルに届くエントリポイント（`main`、フレームワークのハンドラ、FFI export、トレイトやフレームワークからだけ呼ばれるメソッドなど）を、最短の呼び出し経路つきで返します。`target` を省くと、宣言ユニットごとのエントリポイントを種類別に数えて返します。クエリ時に計算するため、保存済みのフローは要りません。以前の保存フロー（`mode="list"` / `"get"`）はv10.0.0で削除されました。

## グラフ管理

既定面では `ensure_graph_tool` がグラフの作成／更新の入口です。

| ツール | 用途 | 面 |
| --- | --- | --- |
| `ensure_graph_tool` | グラフが無ければ build、あれば更新 | 既定 |
| `build_or_update_graph_tool` | MCP から build / update | 拡張 |
| `run_postprocess_tool` | 後処理のみ実行 | 拡張 |
| `list_graph_stats_tool` | ノード数、最終更新等 | 拡張 |
| `embed_graph_tool` | 埋め込み生成 | 拡張 |

## リファクタ・Wiki

| ツール | 用途 |
| --- | --- |
| `refactor_tool` | 既定の `suggest` は `findings`（`unused_symbol`、`complex_hotspot`、`undocumented_surface`）を返す。`dead_code` と `rename` プレビューも持つ |
| `apply_refactor_tool` | `rename` プレビューの適用。同じ `dagayn serve` セッション内で使う（拡張面） |
| `find_large_functions_tool` | 大きな関数の検出 |
| `generate_wiki_tool` / `get_wiki_page_tool` | リポジトリWiki生成 |
| `get_docs_section_tool` | Markdown セクション取得 |

## マルチリポジトリ

| ツール | 用途 |
| --- | --- |
| `list_repos_tool` | 登録リポジトリ一覧 |
| `cross_repo_search_tool` | 複数リポジトリ横断検索 |

## 推奨ワークフロー

```diagram-design dagayn-mcp-workflow
```

## hooksとの連携

`dagayn install` が登録する編集hookは `dagayn queue add update` で更新をキューに積み、workerが構造を更新します。MCPツールはその更新後のグラフを読みます。グラフが空の場合は先に `ensure_graph_tool()` を実行してください。並列エージェントのworktreeでは、メイン側に健全なグラフがあるなら `dagayn worktree sync` を優先します。

## 次に読む

差分レビューの手順は [レビューと影響分析](/projects/dagayn/review-analysis/) です。インストールは [使い方](/projects/dagayn/usage/) へ。
