---
title: "レビューと影響分析"
description: "dagayn v11.2.0 の変更検出・findings・影響範囲・テスト到達・dead code・アーキテクチャ分析と、その評価ゲート"
sidebar:
  order: 12
---

このページは、差分レビューと影響分析の流れを扱います。対象はv11.2.0です。中心になるのは `review_tool` の `findings` です。そのあとに影響範囲、テストの到達、dead code、アーキテクチャ分析、そしてそれぞれの精度を測るゲートを説明します。ツールの引数の一覧は [MCP ツール](/projects/dagayn/mcp-tools/) にあります。

## 変更検出

`dagayn detect-changes` とMCPの `review_tool(mode="changes")` は同じ変更検出を使います。`dagayn update` とも同じです。

### 検出対象

| ソース | 内容 |
| --- | --- |
| `base_diff` | base refとの `git diff` |
| `worktree` | ワークツリー上の変更全体 |
| `staged` | ステージ済みの変更 |
| `unstaged` | 未ステージの変更 |
| `untracked` | Gitが追跡していないファイル |

untrackedファイルにはline hunkがありません。そのためファイル全体を変更として扱います。

### base の決まり方

`base` を省いたときの比較先は次のとおりです。

| 状態 | 比較先 |
| --- | --- |
| 追跡ファイルにステージ済みか未ステージの変更がある | `HEAD`（作業中の変更） |
| 変更がない | `HEAD~1`（直前のコミット） |

untrackedファイルはどちらの場合も数えます。ブランチをレビューするときは、`main` とのmerge baseを `base` に渡してください。`base="main"` をそのまま渡すと、分岐後に `main` へ入ったコミットまで逆向きの変更として数えます。`changed_files` を明示すると、レビューはそのファイルに限られます。

### レスポンスの構造

| フィールド | 内容 |
| --- | --- |
| `change_file_sources` | 上の表のソース別のファイル一覧（CLI出力、MCPでは `detail_level="verbose"`） |
| `change_file_source_counts` | ソース別の件数（MCP） |
| `changed_files` | 互換用のフラットな一覧 |
| `change_status` | ノードとエッジごとの `existing` / `added` / `unknown` |
| `change_entity_summary` | `change_status` の件数集計 |

MCPの応答は、どのdetail levelでも `base`（実際に使ったbase）、`changed_file_count`、`unmapped_changed_files`、`next`、`missingness` を持ちます。既定の `standard` は `changed_functions` を加えます。`verbose` はさらに `symbol_delta`（追加・削除・改名したシンボル）を加えます。

## 推奨レビューフロー

```diagram-design dagayn-review-flow
```

1. **`get_minimal_context_tool`**：グラフの鮮度を確かめます。グラフが空か古いときは、`next` に従います。
2. **`review_tool(mode="changes", detail_level="minimal")`**：まず `findings` を読みます。空なら、差分の外で確かめることはありません。
3. **深掘り**：各findingの `action` と、応答末尾の `next` に従います。
4. **確認**：`query_graph_tool(pattern="source_of")` やテストの実行で、findingを事実として確かめます。

findingは「確かめるべき主張」です。グラフのエッジとbase側の再パースに基づくので、バグと断定する前に `source_of` か再現で確かめてください。

### findings の種類

各findingは `kind`、見る場所（`qualified_name` か `file`、まとめたものは `targets`）、`claim`、根拠（`evidence` か参照箇所の `sites`）、`action` を持ちます。

| kind | 意味 |
| --- | --- |
| `dangling_reference` | 削除・改名・移動したシンボルやファイルを、変更の外がまだ参照している |
| `unchanged_caller` | 必須引数が増えたか引数が減ったのに、変更の外の呼び出し元を直していない |
| `contract_doc_not_updated` | 変更したコードに `implemented-by` / `implements` でつながる契約ドキュメントを更新していない |
| `bridge_touched` | クロスアーティファクト橋（マニフェスト、Terraform、FFI）の片側だけを変えた |
| `unstable_dependency` | 変更によって、より不安定なユニットへの依存が生まれた |
| `untested_change` | 変更した本番関数に、どのテストも届かない |
| `tests_to_run` | 変更に直結するテストと変更したテスト、その実行コマンド |

補足は次のとおりです。

- `dangling_reference` は、削除したシンボルごとに1件です。base側の情報は、変更したファイルを `base` の時点で再パースして得ます。
- `unchanged_caller` は、任意引数や既定値つき引数が増えただけでは出ません。
- `unstable_dependency` は、不安定度の差が0.1を超え、依存の根拠となるエッジがすべて差分の行にあり、baseの版がその依存先を名指ししていないときに出ます。詳しくは [安定度とSAPメトリクス](#安定度とsapメトリクス) を参照してください。
- `untested_change` はファイルごとに1件です。判定は [テストの到達](#テストの到達) と同じです。
- `tests_to_run` はテストファイルごとに1件で、Rustのユニットテストはクレートごとに1件です。テストの補助関数は、それを呼ぶテスト（3呼び出し以内）に置き換わります。

各kindは10件までで、残りは `findings_omitted` に数えます。コメントや空白だけの変更は変更として扱いません。Pythonは構文木で比べます。`findings` が空のとき、`summary` は「Nothing beyond the diff needs checking.」になります。`next` は先頭のfindingを実行できる形にします。例えば `source_of` の呼び出しや、`{"tool": "shell"}` 形式のテスト実行コマンドです。

## 影響範囲を調べる

「このシンボルを変えたら、グラフ上で何に届くか」は `query_graph_tool` で調べます。以前の `review_tool(mode="impact")` と `mode="context"` はv11.0.0で削除されました。

| 問い | 呼び出し |
| --- | --- |
| 誰が呼んでいるか（間接も含む） | `query_graph_tool(pattern="callers_of", depth=...)` |
| 誰がimportしているか | `query_graph_tool(pattern="importers_of", depth=...)` |
| 何をimportしているか | `query_graph_tool(pattern="imports_of", depth=...)` |
| 何を呼んでいるか | `query_graph_tool(pattern="callees_of")` |
| 変更に届くエントリポイント | `review_tool(mode="affected_flows")` |
| あるシンボルに届くエントリポイント | `flow_tool(mode="entry_points", target=...)` |

`depth` は1〜6で、既定は1です。1より大きいとき、各行は `depth` と `via` を持ちます。応答の `reachability` は、集合が閉じたか（`state="complete"`）、行数や出力予算で切れたか、`depth` で止まったかを示します。`depth` で止まったときは、`next` の先頭が `depth=6` の同じ呼び出しになります。

変更ファイル内のシンボルから出発し、1〜2 hopだけたどるとトークン効率が良くなります。「直接または間接に」を問うなら `depth=6` を渡し、`reachability` で閉じたかを確かめてください。

## テストの到達

### tests_for と nearest test

`query_graph_tool(pattern="tests_for")` の行は、そのノードを呼ぶテストです。応答の `test_reach` は、`untested_change` と同じ数え方で最も近いテストを示します。

| フィールド | 内容 |
| --- | --- |
| `nearest_test` | 最も近いテスト（無ければ `null`） |
| `hops` | そのテストまでの呼び出しの段数 |
| `counts_as_tested` | `hop_limit` 以内ならtrue |
| `hop_limit` | 言語ごとの上限 |
| `through_callers` | 呼び出し元を経由して届くテストのうち行にないもの |

`hop_limit` は言語で決まります。

| 言語 | `hop_limit` |
| --- | --- |
| Rust | `null`（上限なし。呼び出しの連鎖が深いため） |
| TypeScript / JavaScript | 8 |
| その他 | 4 |

`through_callers` の各テストは `hops` と `via` を持ちます。経路が値としての使用（関数を引数に渡すなど）を通るときは `value_use` も持ち、探索はそれを呼び出しとして数えます。行が無い `tests_for` でも `through_callers` は返り、`next` はそれを経由する呼び出し元への `tests_for` から始まります。

`test_reach` にテストが無いことは、グラフ上に経路が無いという意味です。テストの実行では通っている可能性があります。

### untested_change の判定

`untested_change` は、変更した本番関数に、直接または呼び出し元を経由して `hop_limit` 以内に届くテストが無いときに出ます。主な規則は次のとおりです。

- dunderメソッド、property、validatorは、クラスが使われる場所で呼ばれたものとみなします。
- Pythonモジュールがトップレベルでインスタンスを作るか、分岐やループの外で関数を呼ぶなら、そのモジュールをimportした場所で呼ばれたものとみなします。
- テスト（`#[cfg(test)]` でだけコンパイルされるRustファイルを含む）、`build.rs`、`examples/`、ベンチマーク、fixture、生成コードは対象外です。
- Goでは、`go test ./...` が実行しない場所（名前が `_` か `.` で始まるディレクトリ、`testdata`、別の `go.mod` の下）にあるテストや呼び出し元を数えません。

### 宣言でテストを結ぶ

呼び出しグラフでたどれない経路（名前で選ぶツールやルートなど）を使うテストは、テスト側のコメントで対象を宣言できます。

```rust
// dagayn: tests crates/app/src/router.rs::dispatch
```

この宣言は `tests_for`、`untested_change`、`tests_to_run` が数えます。

## テスト到達の精度とCIゲート

`untested_change` の判定は、実際のカバレッジと比べて測られています。測定は `eval/run_test_reach_eval.py` です。各本番関数に `tests_for` の `test_reach` を問い、本体の行が1行でも実行された関数を「実行された」とみなして採点します。

| 指標 | 意味 |
| --- | --- |
| untested precision | untestedと判定した関数のうち、実際に実行されなかった割合 |
| untested recall | 実行されなかった関数のうち、untestedと判定した割合 |
| tested precision | testedと判定した関数のうち、実際に実行された割合 |

CIは `--gate` 付きでこれを走らせます。指標が `eval/*thresholds.yaml` の下限を下回ると失敗します。

| 言語 | 対象とカバレッジ | 下限（UP / UR / TP） | 記録時の実測（UP / UR / TP） | 閾値ファイル |
| --- | --- | --- | --- | --- |
| Python | dagayn自身、pytest-cov | 0.91 / 0.64 / 0.93 | 0.931 / 0.644 / 0.948 | `test_reach_thresholds.yaml` |
| Rust | dagayn自身、`cargo llvm-cov` | 0.43 / 0.23 / 0.92 | 0.464 / 0.278 / 0.952 | `test_reach_rust_thresholds.yaml` |
| Go | testify v1.12.1、`go test -coverpkg` | 0.93 / 0.96 / 0.96 | 0.965 / 0.993 / 0.991 | `test_reach_go_thresholds.yaml` |
| TypeScript | cfwdonのweb-ui、vitestのv8カバレッジ | 0.81 / 0.43 / 0.73 | 0.842 / 0.468 / 0.765 | `test_reach_ts_thresholds.yaml` |

UPはuntested precision、URはuntested recall、TPはtested precisionです。数字の読み方は次のとおりです。

- Rustのuntested precisionが低いのは、`cargo llvm-cov` がテストの起動したバイナリの実行も数えるからです。呼び出しグラフはプロセスの境界を越えません。
- Pythonのpytest-covは、テストがサブプロセスで実行したコードを数えません。そのためuntested precisionはむしろ高めに出ます。
- TypeScriptのtested precisionが低いのは、テストが発火しないイベントハンドラ内の呼び出しもtestedと数えるためです。この下限は後退を止めるためのものです。
- GoとTypeScriptのゲートはv11.2.0で加わりました。Goは `eval/go_test_reach_corpus.sh`、TypeScriptは `eval/ts_test_reach_corpus.sh` で対象のリポジトリを用意します。
- v11.2.0のRust extractor 29で、re-export経由の呼び出しなどを追えるようになりました。dagayn自身で誤ってuntestedと判定していた関数が9個減っています。

## dead code

使われていないシンボルは `refactor_tool` で調べます。

| 呼び出し | 返すもの |
| --- | --- |
| `refactor_tool(mode="suggest")` | `findings` の `unused_symbol`（fixtureを除いた検証済みdead code）と `complex_hotspot` |
| `refactor_tool(mode="dead_code")` | `dead_code` の一覧、`total`、`suppressed`、`verification` |

`mode="dead_code"` は `kind`、`file_pattern`、`limit`（既定50）で絞れます。候補は、呼び出し元・テスト・importer・参照・サブクラスが無く、エントリポイントやフレームワークのhookでもない関数とクラスです。

最後に検証の段階があり、次の候補を外します。

- グラフが見落とす使われ方（callback、型注釈、re-export、文字列による登録、デコレータ登録、FFIのexport、traitのdispatch）が当てはまりうる候補
- 名前がリポジトリのテキストのどこか（自分の定義以外）に現れる候補

外した候補の数は、理由ごとの件数として `suppressed` に入ります。`fixtures/` と `testdata/` の下は `test_fixture` として数えます。ソースを走査できなかったときは、何もdeadと報告しません。

結果は削除の候補であり、動的な参照までは保証しません。消す前に、公開API、動的ディスパッチ、プラグイン登録、生成されたエントリポイントを確かめてください。

## アーキテクチャ分析

`architecture_analysis_tool` には2つのモードがあります。

| mode | 返すもの |
| --- | --- |
| `overview` | 宣言されたユニットの依存マップと `findings` |
| `import_cycles` | import辺が作る単純閉路の全列挙 |

### 依存マップ

`mode="overview"` は、まず `detail_level="minimal"` で呼びます。

| フィールド | 内容 |
| --- | --- |
| `units` | Cargoクレート、npmパッケージ、Goパッケージ、Pythonのimportパッケージ、Terraformモジュール。マニフェストが無いコードはトップレベルのディレクトリ（`kind: "directory"`） |
| `unit_edges` | ユニット間の呼び出し・import・参照・継承・橋。重い順。マニフェストが依存を記すものは `declared: true` |
| `surface` | `standard` で追加。他ユニットがよく使うシンボル（事実上の公開API） |

`declared: true` なのに件数が無い組は、マクロ内の呼び出しのようにグラフから見えない依存です。

`findings` の種類は次のとおりです。

| kind | 意味 |
| --- | --- |
| `import_cycle` | 本番コードがロード時に互いをimportしている。切るべきimportを `cut` に示す |
| `unstable_dependency` | ユニットがより不安定なユニットに依存している |
| `untested_core` | 多くのファイルから使われるのに、どのテストも呼び出し元経由で届かないシンボル |
| `broken_doc_link` | directiveが指すファイル・セクション・シンボルが無くなっている |

`findings` が空なら、構造上の対処はありません。

### import cycle

`mode="import_cycles"` は、解決済みのimport辺が作る単純閉路をすべて列挙します。

- `scope_kind` は `"package"`（宣言されたユニット、既定）か `"directory"`、`"file"` です。
- 各閉路はimportの順に並び、最小のスコープから始まり、1度だけ現れます。
- `detail_level="standard"` は、各hopの最初のimport（`from`、`to`、`line`、`imports`）を加えます。
- `unit_filter` は指定した接頭辞のスコープだけを残します。
- `import_kind="statement"` はlazy export、コード中のRustのパス、Markdownを除きます。
- `artifact_scope` は既定で `"code"` です。ドキュメントの依存は `"docs"`、混在は `"all"` で見ます。
- `groups` は強連結なスコープの集まりです。

標準ライブラリやサードパーティ、コンパイル済み拡張のようにグラフにないファイルへのimportは辺になりません。閉路が200に達したか応答に収まらないときは `results_complete: false` になるので、`unit_filter` で絞ってください。overviewの `import_cycle` と違い、このモードはロード時かどうかを問わず、フィルタが残すimport辺をすべて数えます。

## 安定度とSAPメトリクス

`unstable_dependency` は、パッケージの不安定度と抽象度の指標（SAP）に基づきます。仕様は [docs/SAP-METRICS.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/SAP-METRICS.md) です。

| 記号 | 定義 |
| --- | --- |
| `Ce` | 外向きに依存する別スコープの数 |
| `Ca` | 内向きに依存される別スコープの数 |
| `Nt` | 対象となるトップレベルの型の数 |
| `Na` | そのうち抽象的または契約的な型の数 |
| `I` | 不安定度 `Ce / (Ca + Ce)` |
| `A` | 抽象度 `Na / Nt` |
| `D` | 主系列からの距離。`A + I - 1` の絶対値 |

数え方の要点は次のとおりです。

- 依存として数えるエッジは `strict_static` の4種（`IMPORTS_FROM`、`DEPENDS_ON`、`INHERITS`、`IMPLEMENTS`）です。`CALLS` と `REFERENCES` は動的言語でノイズが多いので数えません。
- スコープは既定で `package` です。これは言語によらず、ファイルの親ディレクトリ（リポジトリルートからの相対パス）です。
- 既定の `artifact_scope="code"` では、Markdownのノードとdirectiveを数えません。
- `Nt` はトップレベルの `Class` ノードだけを数えます。interface・trait・protocol・抽象クラスなどは `Na` にも数えます。型エイリアスはどちらにも入りません。
- `Nt = 0` のスコープと `Ca + Ce = 0` のスコープはSAPの対象外（`sap_applicable=false`）です。

`unstable_dependency` のevidenceは、両ユニットの `Ca`・`Ce`・不安定度と依存の箇所です。依存先がSAPの対象なら、その抽象度と距離も含みます。testやfixtureのスコープは名指ししません。全スコープを並べていた `sap_metrics` と `sap_violations` のモードは削除されています。

## 評価の意味づけ

dagaynの評価は1つの総合点を持ちません。指標ごとに役割と正解の種類を決めています。定義は [docs/EVALUATION-SEMANTICS.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/EVALUATION-SEMANTICS.md) にあります。

| 役割 | 意味 |
| --- | --- |
| gate | 下回るとそのプロファイルを信頼できなくなる合否・閾値 |
| score | 能力の測定値 |
| cost | トークン、レイテンシ、ビルド時間などの資源 |
| diagnostic | 挙動を説明する情報で、能力の平均には入れない |
| metadata | 行を解釈するための記述 |

| 正解の種類 | 意味 |
| --- | --- |
| explicit | 人が書いた、または設定した期待出力 |
| proxy | グラフから導いた近似 |
| synthetic | 較正用に生成した対象 |
| none | 正解を持たない |

見出しの能力スコアに入るのはexplicitの指標だけです。グラフ同士を比べる `impact_accuracy.graph_proxy_*` のようなproxy指標は、内部の一貫性の診断に留まります。トークン効率はcostであり、品質のゲートを通ったあとで意味を持ちます。

この考え方に沿って、findingの種類ごとのゲートがCIで動きます。

| 対象 | 閾値ファイル | 下限 |
| --- | --- | --- |
| `review_tool` の7種のfinding | `eval/review_thresholds.yaml` | precision 0.8、recall 0.8 |
| `architecture_analysis_tool` の4種のfinding | `eval/architecture_thresholds.yaml` | precision 0.8、recall 0.8 |
| `untested_change` とカバレッジの一致 | `eval/test_reach*_thresholds.yaml` | [上の表](#テスト到達の精度とciゲート) |

findingを1件も出さなかった種類のprecisionは `null` で、下回ったとはみなしません。recallの下限が、一度も出ない種類を落とします。

## クロスアーティファクト追跡

Markdownの `CROSS_ARTIFACT` エッジを使うと、設計書の変更をコード側へ、コードの変更をドキュメント側へ追えます。

```text
design doc code span updated
  -> CROSS_ARTIFACT target symbol
  -> callers_of / tests_for / entry points
```

コードからは `docs_for`、Markdownのセクションからは `implementations_of` でたどります。要件モデル（[rdra-ish](/projects/rdra-ish/)）と実装コードを同じリポジトリに置けば、上流から下流までグラフでたどれます。

## hook との連携

`dagayn install` が登録する編集hookは、`dagayn queue add update` で構造だけの更新をキューに積みます。1つのworkerがそれを順に処理し、連続した編集は1つの更新にまとまります。workerは `DAGAYN_HOOK_UPDATE=1` を設定し、既定で120秒の予算を超えた更新を止めます。

コミット前のgit hookは `dagayn update --skip-flows` を同期で実行し、続けて `dagayn detect-changes --brief` で要約とfindingを1行ずつ表示します。コミット後のgit hookは `dagayn update` を実行します。MCPのレビューはhookで更新したあとのグラフを読みます。鮮度は `dagayn status` か `get_minimal_context_tool` の `sync.state` で確かめてください。

## レビュー観点チェックリスト

- **グラフの鮮度**：`sync.state` は `commit_synced` または `worktree_ahead` か
- **base**：ブランチならmerge baseを渡したか
- **findings**：各kindを `source_of` か再現で確かめたか
- **テスト**：`tests_to_run` を実行し、`untested_change` を `tests_for` の `test_reach` で確かめたか
- **影響範囲**：`callers_of` の `reachability` が `complete` か
- **ドキュメント**：`contract_doc_not_updated` と `broken_doc_link` が無いか
- **アーキテクチャ**：`unstable_dependency` と `import_cycle` が増えていないか

## 次に読む

ツールの引数は [MCP ツール](/projects/dagayn/mcp-tools/) です。エッジの種類の定義は [グラフモデル](/projects/dagayn/graph-model/) にあります。テスト到達の設計判断の評価は [設計の評価](/projects/dagayn/design-review/) を参照してください。
