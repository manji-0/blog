---
title: "レビューと影響分析"
description: "dagayn の変更検出・impact radius・レビューワークフロー"
sidebar:
  order: 12
---

このページは、差分検出、impact radius、推奨レビューフローを扱います。変更検出のデータ構造はCLI/MCP共通です。MCPツールの引数は [MCP ツール](/projects/dagayn/mcp-tools/) へ。

## 変更検出

`dagayn detect-changes` とMCP `review_tool(mode="changes")` は同じ変更検出エンジンを使います。

### 検出対象

| ソース | 内容 |
| --- | --- |
| `base_diff` | `git diff` 対 base ref |
| `worktree` | ワークツリー上の変更全体 |
| `staged` | ステージ済み変更 |
| `unstaged` | ワークツリー未ステージ |
| `untracked` | Git 未追跡ファイル（全体を新規として扱う） |

untrackedファイルにはline hunkが無いため、ファイル全体が変更として扱われます。

### レスポンスの構造

- `change_file_sources`：上記バケット別のファイル一覧
- `changed_files`：互換用のフラットリスト
- `change_status`：ノード / エッジごとに `existing` / `added` / `unknown`
- `change_entity_summary`：種別ごとの件数集計

base refのdiffとローカルworktree変更を区別したいときは `change_file_sources` を見てください。`review_tool(mode="changes")` は既定ではバケット別の件数（`change_file_source_counts`）だけを返し、一覧は `detail_level="verbose"` で出ます。

`base` を省くと、追跡ファイルに未コミットの変更があれば `HEAD`（作業中の変更）、なければ `HEAD~1`（直前のコミット）と比べます。ブランチをレビューするときは `main` とのmerge baseを渡します。

## 推奨レビューフロー

```diagram-design dagayn-review-flow
```

1. **`get_minimal_context_tool`**：グラフの鮮度確認と最初の呼び出し（グラフが空や古いときだけでよい）
2. **`review_tool(mode="changes")`**：まず `findings` を読む。空なら差分以外に確認すべきことはない
3. 各findingの `action` と、応答末尾の `next` に従って深掘りする
4. **`query_graph_tool(pattern="source_of")`** やテスト実行で、findingを事実として確かめる

`findings` の種類は次のとおりです。

| kind | 意味 |
| --- | --- |
| `dangling_reference` | 削除・改名・移動したシンボルやファイルが、変更の外でまだ参照されている |
| `unchanged_caller` | 必須引数が増えた、または引数が減ったのに、変更の外の呼び出し元が直っていない |
| `contract_doc_not_updated` | 変更したコードにつながる契約ドキュメントが更新されていない |
| `bridge_touched` | クロスアーティファクト橋の片側だけを変えた |
| `unstable_dependency` | 変更によって、より不安定なユニットへの依存が生まれた |
| `untested_change` | 変更した本番関数に届くテストが無い |
| `tests_to_run` | 変更に直結するテストと、その実行コマンド |

各kindは10件までで、残りは `findings_omitted` に数えられます。コメントや空白だけの変更は変更として扱いません。

## Impact radius

「このシンボルを変えたら、グラフ上で何に届くか」を調べます。

### 探索方向

| 方向 | 典型用途 |
| --- | --- |
| outgoing | 変更が下流に波及する範囲 |
| incoming | 誰がこのシンボルに依存しているか |
| 双方向 | レビュー時の総合的な影響 |

エッジkindでフィルタできます。依存分析では `CALLS` を除外し、impact分析では含める使い分けが可能です。

### 実装方式

- **Recursive CTE**：到達集合を一括取得
- **Frontier batching**：kind重み付け、depth制限、token budget、応答整形が必要な場合

MCPでは `review_tool(mode="impact")`、または `depth` 付きの `query_graph_tool(pattern="callers_of")` / `importers_of` が相当します。

## 構造クエリとの組み合わせ

差分レビューでよく使う `query_graph_tool` パターン：

| pattern | 問い |
| --- | --- |
| `callers_of` | 誰が呼んでいるか |
| `callees_of` | 何を呼んでいるか |
| `tests_for` | テストはどこか |
| `docs_for` | 関連ドキュメントはどこか |
| `implementations_of` | この doc が説明するコードはどこか |
| `imports_of` | import 関係 |

変更ファイル内のシンボルから出発し、1〜2 hopだけたどるとトークン効率が良いです。「直接または間接に」を問うなら `depth=6` を渡し、`reachability` で集合が閉じたかを確かめます。

呼び出しグラフが辿れない動的ディスパッチを使うテストは、テスト側のコメントで対象を宣言できます。`// dagayn: tests <path>::<symbol>` と書くと、`tests_for`、`untested_change`、`tests_to_run` が直接のテストとして扱います。

## クロスアーティファクト追跡

Markdownの `CROSS_ARTIFACT` エッジを使うと、設計書変更の影響をコード側へ、コード変更の影響をdoc側へ追えます。

```text
設計書のコードスパン更新
  → CROSS_ARTIFACT 先シンボル
  → callers / tests_for / entry points
```

要件モデル（[rdra-ish](/projects/rdra-ish/)）と実装コードを同じリポジトリに置けば、上流から下流までグラフでたどれます。

## hookとの連携

`dagayn install` が登録する編集hookは `dagayn queue add update` で更新をキューに積み、1つのworkerが構造だけを更新します。コミット前のgit hookは `dagayn update --skip-flows` のあと `dagayn detect-changes --brief` でfindingsを表示します。

| 変数 / 挙動 | 意味 |
| --- | --- |
| `DAGAYN_HOOK_UPDATE=1` | hook 経由の更新中（キューのworkerが設定） |
| 重複抑制 | 連続した編集は1つの更新タスクにまとまる |
| 120秒の予算 | hook経由の更新はこれを超えると止まる（hook自体のタイムアウトは150秒） |

MCPレビューはhook更新後のグラフを読みます。鮮度は `dagayn status` または `list_graph_stats_tool` で確認してください。

## レビュー観点チェックリスト

- **グラフ鮮度**：`status` で最終更新とノード数
- **差分網羅**：`change_file_sources` にuntrackedが含まれるか
- **テスト対応**：`tests_for` で変更シンボルをカバーしているか
- **doc 連携**：directiveと `CROSS_ARTIFACT` が意図どおりか
- **エントリポイント**：`review_tool(mode="affected_flows")` で変更に届くエントリポイントを確認したか
- **アーキテクチャ**：`unstable_dependency` や `import_cycle` が増えていないか

## 次に読む

MCPツールの一覧は [MCP ツール](/projects/dagayn/mcp-tools/) です。エッジkindの定義は [グラフモデル](/projects/dagayn/graph-model/) へ。
