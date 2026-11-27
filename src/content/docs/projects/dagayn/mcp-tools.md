---
title: "MCP ツール"
description: "dagayn v11.2.0 の MCP サーバが提供するツールと応答の読み方"
sidebar:
  order: 2
---

このページは、dagayn v11.2.0のMCPサーバが公開するツールと、その引数と応答を扱います。CLIのコマンドとフラグは [CLI リファレンス](/projects/dagayn/cli-reference/) へ。ノードやエッジの語彙は [グラフモデル](/projects/dagayn/graph-model/) へ。

## ツール一覧

`dagayn serve` は16個のツールを登録します。既定で公開するのはそのうち9個です。

| ツール | 面 | 答えること |
| --- | --- | --- |
| `get_minimal_context_tool` | 既定 | グラフの鮮度と、タスクの最初の呼び出し |
| `ensure_graph_tool` | 既定 | グラフが無ければ作り、HEADとずれていれば更新する |
| `review_tool` | 既定 | 差分には見えないがマージ前に確認すべきこと |
| `query_graph_tool` | 既定 | 1ノードの呼び出し元・呼び出し先・import・テスト・ドキュメント・ソース |
| `semantic_search_nodes_tool` | 既定 | 名前・キーワード・意味からノードを探す |
| `flow_tool` | 既定 | シンボルに届くエントリポイント |
| `architecture_analysis_tool` | 既定 | ユニットの地図と構造上の問題、import循環 |
| `refactor_tool` | 既定 | リファクタの候補、未使用コード、リネームのプレビュー |
| `get_docs_section_tool` | 既定 | dagayn自身のLLM向けリファレンスの1節 |
| `build_or_update_graph_tool` | 拡張 | MCPからのbuild / update |
| `run_postprocess_tool` | 拡張 | 後処理（コミュニティ、FTS）だけを実行 |
| `list_graph_stats_tool` | 拡張 | ノード数やエッジ数などの統計 |
| `embed_graph_tool` | 拡張 | 埋め込みの生成 |
| `apply_refactor_tool` | 拡張 | リネームのプレビューを適用 |
| `list_repos_tool` | 拡張 | 登録済みリポジトリの一覧 |
| `cross_repo_search_tool` | 拡張 | 登録済みリポジトリを横断する検索 |

拡張面のツールは `dagayn serve --tools all` か `CRG_TOOLS=all` で公開されます（`full` と `*` も同じ意味です）。`--tools` にツール名をカンマ区切りで渡すと、その名前だけを公開します。公開範囲はサーバ起動時に決まり、動作中のサーバは読み直しません。

ほぼすべてのツールが `repo_root` を取ります。省くとリポジトリを自動で検出します。

stdioでは、ハンドシェイクと既定ツールの多くにRustのフロントエンドが応答します。埋め込みが必要な検索などRustで答えられない呼び出しが来ると、そのセッションの残りはPythonサーバが受けます。

## 応答の共通ルール

`query_graph_tool`、`semantic_search_nodes_tool`、`review_tool`、`flow_tool`、`architecture_analysis_tool`、`refactor_tool` の6つは、同じ形で応答します。

| フィールド | 意味 |
| --- | --- |
| `next` | 次に呼ぶ最大3件の呼び出し。各要素は `{"tool", "args", "why"}` で、`args` はそのまま渡せる。答えが完結していれば `[]` |
| `missingness` | その応答を制限している欠落だけを挙げる（別コミットのグラフ、未コミットの編集、曖昧な対象など） |
| `truncated` / `_truncation` / `*_omitted` / `total` | 出力予算に収まらなかった分の件数 |
| `status` | `ok`、`ambiguous`、`not_found`、`error` など |

実行すべきテストは `{"tool": "shell", "args": {"command": ...}}` の形で `next` に入ります。

`detail_level="minimal"` の応答は8K文字に、`"standard"` は32K文字に収まります。収まらない分は落とさずに件数で示すので、切られた一覧から結論を出す前に呼び出しを絞ってください。

`verbose` 未満の応答は、診断用のフィールド（`_runtime`、`guidance` など）を含みません。グラフ全体の `answerability` も `verbose`（`query_graph_tool` では `full`）のときだけ付きます。グラフ全体の健全性は `get_minimal_context_tool` の `graph_health` で見ます。

推奨の手順は `get_docs_section_tool(section_name="workflow")` で、どの答えを事実として扱えるかは `section_name="trust"` で読めます。

## get_minimal_context_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `task` | `""` | タスクの説明（英語・日本語） |
| `changed_files` | なし | 変更ファイルの一覧。`[]` を渡すと変更の分析を省く |
| `base` | なし | 変更検出の比較先 |

タスクの説明から、レビュー・デバッグ・探索・機能追加・リファクタのどれかの手順を選びます。その最初の呼び出しを引数つきで `next` に入れ、`workflow`、`why`、`confidence` も返します。

グラフの状態は `sync.state`（`unbuilt`、`commit_drift`、`commit_synced`、`worktree_behind`、`worktree_ahead`）と `graph_health`（`status`、`score`、`reason_codes`）で示します。グラフが空かHEADとずれていれば、バックグラウンドで更新を積んですぐに返ります。更新を待つ必要があるときは `ensure_graph_tool` を呼びます。

`changed_files` を省くと、`review_tool(mode="changes")` と同じく `base` との差分を検出します。そのときはfindingの種類ごとの件数を `changes` で返します。

タスクがノードやファイルを名指ししているなら、このツールを飛ばして答えるツールを直接呼ぶ方が速いです。

## ensure_graph_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `force` | `false` | 同期済みに見えても更新する |

空のグラフを作り（後処理は `minimal` でコミュニティ検出なし）、別のコミットを表すグラフを更新します。未コミットの編集は編集hookに任せるので、それも取り込むときは `force=True` を渡します。`dagayn serve --local-embedding` の埋め込み設定を引き継ぎます。完全な再構築はCLIの `dagayn build` で行います。

## review_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `mode` | `"changes"` | `changes` または `affected_flows` |
| `base` | なし | 比較先のGit ref |
| `changed_files` | なし | git diffの代わりに使うファイル一覧 |
| `include_source` | なし | （`changes`）変更された関数のソースを付ける |
| `detail_level` | `"standard"` | `minimal`、`standard`、`verbose` |

`base` を省くと、追跡ファイルに未コミットの変更があれば `HEAD` と比べます。変更が無ければ `HEAD~1` と比べます。ステージ済み・未ステージ・未追跡のファイルはどちらでも含まれます。ブランチをレビューするときは `git merge-base main HEAD` の結果を `base` に渡します。

`mode="changes"` は `findings` を返します。差分そのものには見えないが、マージ前に確認すべきことの一覧です。

| kind | 意味 |
| --- | --- |
| `dangling_reference` | 削除・リネーム・移動したシンボルやファイルを、変更の外がまだ参照している |
| `unchanged_caller` | 必須引数が増えた、または引数が減った関数の呼び出し元を編集していない |
| `contract_doc_not_updated` | 変更したコードに紐づく契約ドキュメントを更新していない |
| `bridge_touched` | マニフェスト・Terraform・FFIの橋の片側だけを変更した |
| `unstable_dependency` | 変更によって、ユニットがより不安定なユニットに依存するようになった |
| `untested_change` | テストが直接にも呼び出し元経由でも届かない本番コードの関数を変更した |
| `tests_to_run` | 変更したコードの直接のテストと、変更したテスト。実行コマンドつき |

各findingは `kind`、見る場所（`qualified_name` や `file`）、`claim`、根拠（`evidence` または `sites`）、`action` を持ちます。種類ごとに10件までを返し、残りは `findings_omitted` に数えます。空なら差分以外に確認すべきことはありません。

findingはグラフのエッジと比較先の再パースに基づく主張です。バグと判断する前に `source_of` か再現で確かめてください。

`untested_change` が数える呼び出し元のhop数は、TypeScriptとJavaScriptが8、それ以外が4です。Rustには上限がありません。

`mode="affected_flows"` は、変更した関数に届くエントリポイントと呼び出し経路を返します。変更したシンボルの呼び出し元は `query_graph_tool(pattern="callers_of", depth=...)` で取ります。

```text
review_tool(mode="changes", detail_level="minimal")
```

findingの詳しい読み方は [レビューと影響分析](/projects/dagayn/review-analysis/) へ。

## query_graph_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `pattern` | 必須 | 下の表のパターン |
| `target` | 必須 | ノード名、修飾名、またはファイルパス |
| `detail_level` | `"standard"` | `minimal`、`standard`、`full` |
| `depth` | `1` | （`callers_of`、`importers_of`、`imports_of`）たどるhop数。1〜6 |
| `import_kind` | なし | （`importers_of`、`imports_of`）たどるimport辺の種類 |
| `path_prefix` | なし | このパスで始まるファイルの行だけを残す |
| `offset` | `0` | 先頭からこの行数を飛ばす |

| pattern | 答えること |
| --- | --- |
| `source_of` | 1ノードの現在のワークツリー上のソース（上限4,000文字） |
| `callers_of` | 呼び出し元 |
| `callees_of` | 呼び出し先 |
| `imports_of` | そのファイルがimportするもの |
| `importers_of` | そのファイルをimportするもの |
| `tests_for` | そのノードを呼ぶテスト |
| `inheritors_of` | 継承先 |
| `children_of` | ファイルやクラスのメンバー |
| `file_summary` | ファイルの概要 |
| `docs_for` | コードやTerraformに紐づくドキュメント |
| `implementations_of` | ドキュメントの節に紐づくコード |
| `bridges_from` | 高信頼のクロスアーティファクト橋 |

検索でノードが見つかったら、ファイル全体を開き直す前に `source_of` でそのノードだけを読みます。グラフ上の範囲やファイルのハッシュが古いときは `truncated` や `source_stale` が付きます。

### 詳細レベル

| detail_level | 形 |
| --- | --- |
| `minimal` | 各ノードの名前・場所・信頼度だけ。8K文字に収まる |
| `standard` | 関連ノードごとに1行。エッジの行番号は `lines` にまとめる |
| `full` | エッジごとに1行と `edges` の一覧。エッジがある理由を見るときに使う |

完全な一覧を得るのに `full` は要りません。`standard` と `full` は同じ関連ノードを返し、`full` の方が早く出力予算に達します。

### 推移的なたどり方

`callers_of`、`importers_of`、`imports_of` は `depth` を取り、推移的な連鎖を1回で返します。「直接または間接に」を知りたいときは `depth=6` を渡します。

- 2hop目以降の行は `depth` と `via`（前のhopへつながるノード）を持ち、各ノードは最短のhopに1回だけ現れます。
- `reachability.state` は、集合が閉じていれば `complete` です。2hop目以降が500行を超えると `truncated` になります。
- `reachability.depth_limit_reached` がtrueなら、`depth` で止まった先にまだノードがあります。そのとき `next` は `depth=6` の同じ呼び出しから始まります。
- `depth` の上限は6です。7以上を渡すと6hopまでたどり、応答に `depth_requested` が付きます。summaryも6hopで止めたことを述べます。

`import_kind` は `directive`、`link`（Markdownの依存ディレクティブとリンク）、`lazy_export`（Pythonの遅延エクスポート表）、`path`（`use` を使わずパスで参照するRustのファイル）、`statement`（import文だけ）から選びます。

### 切られた一覧

出力予算で行が切られると、`results_complete` がfalseになります。続きの取り方は `next` に入ります。

- `minimal` で切られたときは、`next` は `detail_level="standard"` の呼び出しから始まります。
- `standard` と `full` では、表示した行数を `offset` に入れた同じ呼び出しから始まります。
- 切られた応答でも、見つかった行のファイルを `files` に並べます（最大200件、`minimal` では60件）。

### 曖昧な対象

対象の名前を正確に持つノードが1つだけなら、そのノードに解決します（`resolution="exact_name"`）。複数あれば `status="ambiguous"` になり、`candidates` にその候補だけを並べます。

候補が5つ以下なら、v11.1.0から候補ごとの答えを `answers` で返します。各要素は `target`（修飾名）、`result_count`、`results_complete` と、`minimal` の行を最大20件持ちます。切られた答えの完全な呼び出しは `next` に入り、切られたものが無ければ `next` は空です。`source_of` と候補が6つ以上の名前では、候補一覧と候補ごとの再試行を返します。

`candidates_truncated` は、名前に一致したノードが `candidates` に並べた数より多いときだけtrueです。v11.1.0より前は5件並べると常にtrueでした。

メソッドは言語の書き方でも指定できます。Goの `(*T).M`、`(T).M`、`*T.M` は `T.M` として、Rustの `Type::method` は `Type.method` として解決します。

### 結果がゼロのとき

| 状態 | 意味 |
| --- | --- |
| `status="not_found"`、`zero_result_reason="target_not_found_in_graph"` | 対象がグラフに無い |
| `zero_result_reason="node_has_no_matching_edges"` | ノードはあるが、求めた種類のエッジが無い |
| `zero_result_reason="outside_module_only"` | （Go）行がすべてモジュールの外にある |

ゼロ件は「現在のグラフでは見つからない」という意味です。存在しないと言う前に `zero_result_reason`、`next`、`missingness` を読んでください。

### tests_for

`tests_for` は `test_reach` を返します。`review_tool` の `untested_change` と同じ数え方で、最寄りのテスト（`nearest_test`）とhop数、上限内かどうかを示します。

- 行は、そのノードを直接呼ぶテストです。関数を値として使うテストも、`coverage_source: "value_use"` の行になります。
- 呼び出し元を経由して届くテストは、行ではなく `test_reach.through_callers` に並びます。各要素は `hops` と `via` を持ち、`next` はそのテストが通る呼び出し元への `tests_for` から始まります。
- 同じhop数のテストが複数あれば、Goのexample・benchmark・fuzzより通常のテスト関数を選びます。それでも並ぶときは修飾名の順で決めるので、毎回同じテストを返します。
- 行がすべて名前で選ばれたもの（`coverage_source: "heuristic"`）なら、`results_complete` はfalseです。

### SCIPで確定した呼び出し

`dagayn build --scip` で作ったグラフでは、SCIPインデクサが確定させた呼び出しの `callers_of` / `callees_of` の行に `resolved_by: "scip"` が付きます。最後の `build --scip` のあとに `dagayn update` で再パースしたファイルの呼び出しには付きません。

### Goの対象

v11.1.0とv11.2.0で、Goの対象への答え方が変わりました。

- 関数を値として使う場所（代入の右辺、引数、戻り値、複合リテラル、メソッド式）を、`callers_of` が `relation: "references"` の行として返します。`depth` を付けると各hopで返し、その先はたどりません。
- 完全な `callers_of` のsummaryは、どの定義にも結びつかない同名の呼び出しを分類して述べます。分類は、リポジトリが宣言するインタフェース経由、標準ライブラリや依存先の型、型が分からない値の3つです。読むべきものとして残るのは最後の種類だけです。
- そうした呼び出しが6件以下なら、summaryは呼び出しの行番号を関数ごとに示します。
- Goのツールがそのモジュールのビルドで見ない場所の行は、`results` から `outside_module` に移ります。対象は名前が `_` か `.` で始まるディレクトリやファイル、`testdata`、別の `go.mod` の下です。件数は `outside_module_count` に入り、`result_count` と `next` には数えません。
- パッケージ内で結びついた呼び出しの信頼度は `HIGH` です。

`status` が `ok` で `results_complete` がtrueの応答は、summaryが「欠けている呼び出し元は無い」と述べていれば、その範囲では完全な答えです。grepで数え直す必要はありません。

## semantic_search_nodes_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `query` | 必須 | 名前、キーワード、または自然文 |
| `kind` | なし | `Function`、`Class`、`Type`、`Test`、`File`、`DocSection`、`DocBody` で絞る |
| `limit` | `20` | 最大件数 |
| `provider` | なし | `openai`、`google`、`minimax`。省くとサーバの既定 |
| `model` | なし | 埋め込みモデル。保存済みベクトルと一致する必要がある |
| `detail_level` | `"standard"` | `standard` または `minimal` |

名前やドキュメントのFTSと、埋め込みベクトルのハイブリッド検索です。埋め込みがあれば `search_mode: "hybrid"`、無ければFTSだけの `"fts_only"` になります。各ヒットの `source`（`fts`、`embedding`、`both`、`keyword`）で、どちらの検索が見つけたかが分かります。

v11.2.0からベクトル検索は常にRustのネイティブ実装を使い、Pythonの実装は削除されました。検索結果は発見の手がかりで、証明ではありません。詳しくは [グラフモデル](/projects/dagayn/graph-model/) へ。

## flow_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `mode` | `"entry_points"` | `entry_points` だけ |
| `target` | なし | シンボル。省くとユニットごとのエントリポイント |
| `limit` | 10 | 最大件数 |
| `detail_level` | `"standard"` | `minimal` または `standard` |

`target` を渡すと、そのシンボルに届く最寄りのエントリポイントを、最短の呼び出し経路つきで返します。エントリポイントは `main`、フレームワークのハンドラ、FFI export、どこからも呼ばれない関数、トレイトやフレームワークだけが呼ぶメソッドなどです。

`target` を省くと、宣言ユニットごとのエントリポイントを種類別に数えて返します。クエリ時に計算し、テストコードはたどりません。

## architecture_analysis_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `mode` | `"overview"` | `overview` または `import_cycles` |
| `detail_level` | `"minimal"` | `minimal`、`standard`、`verbose` |
| `scope_kind` | `"package"` | （`import_cycles`）`package`、`directory`、`file` |
| `unit_filter` | なし | （`import_cycles`）残すスコープのプレフィックス |
| `artifact_scope` | `"code"` | `code`、`docs`（Markdown）、`all` |
| `import_kind` | なし | （`import_cycles`）数えるimport辺の種類 |

`mode="overview"` は、リポジトリが宣言するユニット（Cargo crate、npm package、Go package、Python import package、Terraform module）を `units` で返します。ユニット間の依存は `unit_edges` に入ります。構造上の `findings` は次の4種類です。

| kind | 意味 |
| --- | --- |
| `import_cycle` | 読み込み時に互いをimportするモジュール。切るべきimportつき |
| `unstable_dependency` | より不安定なユニットへの依存。依存先のSAP上の位置つき |
| `untested_core` | 多くのファイルから使われるのに、テストが届かないコード |
| `broken_doc_link` | 消えたファイル・節・シンボルを指すディレクティブ |

`detail_level="standard"` は各ユニットの `surface` を加えます。リポジトリを初めて見るときの起点に使います。

`mode="import_cycles"` は、解決済みのimport辺がスコープ間に作る単純な循環をすべて列挙します。200件で止まるか応答に収まらないときは `results_complete: false` になるので、`unit_filter` で絞ります。

設計の評価での使い方は [設計の評価](/projects/dagayn/design-review/) へ。

## refactor_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `mode` | `"suggest"` | `suggest`、`dead_code`、`rename` |
| `old_name` / `new_name` | なし | （`rename`）変更前と変更後の名前 |
| `kind` / `file_pattern` | なし | （`dead_code`）種類とファイルで絞る |
| `limit` | `50` | （`dead_code`）最大件数 |
| `detail_level` | `"standard"` | `minimal`、`standard`、`verbose` |

| mode | 答えること |
| --- | --- |
| `suggest` | `findings`。`unused_symbol`（未使用のシンボル）と `complex_hotspot`（分割の閾値を超え、過去90日に5回以上変更された関数） |
| `dead_code` | 呼び出し元・テスト・import・エントリポイントなど、何からも参照されない関数やクラス |
| `rename` | リネームのプレビュー。編集一覧と `refactor_id` を返す |

`rename` のプレビューは最初の20件の `edits` を返し、残りは `edits_omitted` に数えます。`verbose` ではすべての編集を返します。

`refactor_id` は10分で失効し、同じ `dagayn serve` セッションの中でだけ有効です。適用は拡張面の `apply_refactor_tool`（`dry_run=true` で差分だけを確認）で行います。別プロセスの `dagayn tool` からは、前の呼び出しの `refactor_id` を使えません。

## get_docs_section_tool

| 引数 | 既定 | 意味 |
| --- | --- | --- |
| `section_name` | 必須 | 節の名前 |
| `max_chars` | `4000` | 返す最大文字数 |

dagaynのLLM向けリファレンス（upstreamの [docs/LLM-OPTIMIZED-REFERENCE.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/LLM-OPTIMIZED-REFERENCE.md)）から1節を返します。節は `usage`、`workflow`、`trust`、`review-delta`、`review-pr`、`commands`、`legal`、`watch`、`embeddings`、`languages`、`troubleshooting` です。

## 拡張面のツール

| ツール | 主な引数 |
| --- | --- |
| `build_or_update_graph_tool` | `full_rebuild`、`base`（既定 `HEAD~1`）、`postprocess`（既定 `full`）、`recurse_submodules`、ローカル埋め込みの各設定 |
| `run_postprocess_tool` | `communities`、`fts` |
| `list_graph_stats_tool` | なし |
| `embed_graph_tool` | `provider`、`model` |
| `apply_refactor_tool` | `refactor_id`（必須）、`dry_run` |
| `list_repos_tool` | なし |
| `cross_repo_search_tool` | `query`（必須）、`kind`、`limit`、`provider`、`model` |

既定面では `ensure_graph_tool` をグラフ作成の入口に使います。比較先を明示して更新するときだけ `build_or_update_graph_tool` を使います。

## MCPプロンプト

サーバはツールのほかに5つのプロンプトを提供します。

| プロンプト | 用途 |
| --- | --- |
| `review_changes` | 変更のレビュー |
| `architecture_map` | アーキテクチャの把握 |
| `debug_issue` | 不具合の調査 |
| `onboard_developer` | オンボーディング |
| `pre_merge_check` | マージ前の確認 |

## シェルから呼ぶ

`dagayn tool <ツール名>` は、MCPツールと同じ実装をシェルから呼びます。MCPサーバは要りません。動作中のサーバが `--tools` で公開範囲を絞っていても、すべてのツールを呼べます。

```bash
dagayn tool --list
dagayn tool review_tool --arg mode='"changes"' --arg detail_level='"minimal"'
dagayn tool query_graph_tool --json-args '{"pattern": "callers_of", "target": "save_user", "depth": 6}'
dagayn tool architecture_analysis_tool --arg mode='"overview"' --format summary
```

- `--arg KEY=VALUE` の値はJSONとして読み、読めなければ文字列として扱います。文字列は `'"changes"'` のように引用符ごと渡すと確実です。
- `--json-args` には引数をまとめたJSONオブジェクトを渡します。
- `--repo` を渡すと `repo_root` として渡します。
- 末尾の `_tool` を省いた名前（`review`、`query_graph` など）も受け付けます。

v11.1.0から、出力はインデントなしの1行のJSONです。読むときは `jq` に渡します。`--format summary` は応答の `summary` だけを出します。

長く動いているMCPサーバは起動時に読み込んだ実装を使い続けます。dagaynを更新したら、`dagayn tool` の結果と比べる前に `dagayn serve` を再起動してください。

## 推奨ワークフロー

```diagram-design dagayn-mcp-workflow
```

`workflow` 節の手順は「把握→特定→読む→たどる→判断→確認」です。タスクに必要な段階から入り、編集のあとは `review_tool` で締めます。

| 段階 | 呼ぶツール |
| --- | --- |
| 把握 | `get_minimal_context_tool(task=...)` |
| 特定 | `semantic_search_nodes_tool` で `qualified_name` を得る |
| 読む | `query_graph_tool(pattern="source_of")` |
| たどる | `query_graph_tool`（`callers_of`、`callees_of`、`tests_for`、`docs_for`）と `flow_tool` |
| 判断 | `review_tool`、`architecture_analysis_tool`、`refactor_tool` の `findings` |
| 確認 | findingの場所への `source_of`、テスト、再現 |

## hooksとの連携

`dagayn install` が登録する編集hookは、`dagayn queue add update` で更新をキューに積みます。1つのworkerが構造を更新し、MCPツールは更新後のグラフを読みます。グラフが空なら先に `ensure_graph_tool()` を呼んでください。

並列エージェントのworktreeでは、メインのcheckoutに健全なグラフがあれば `dagayn worktree sync` でそれを引き継ぎます。

## 次に読む

差分レビューの手順は [レビューと影響分析](/projects/dagayn/review-analysis/) です。インストールと日常の運用は [使い方](/projects/dagayn/usage/) へ。
