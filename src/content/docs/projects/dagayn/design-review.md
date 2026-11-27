---
title: "設計の評価"
description: "dagayn v11.2.0 の中核となる設計判断と、その代償・破綻条件の評価"
sidebar:
  order: 13
---

このページは、dagaynの中核となる設計判断を7つ取り上げ、仕組みと理由を説明したうえで評価します。最初は以前の版を対象に書きました。いまはv11.2.0を対象に、すべての事実と評価を確かめ直しています。何ができるかは [アーキテクチャ](/projects/dagayn/architecture/) と [グラフモデル](/projects/dagayn/graph-model/) にあります。ここでは「なぜこう作ったか」と「何を払い、どこで破綻するか」を扱います。

## 対象と読み方

対象はv11.2.0のタグです。事実の記述は、すべてタグのソース、`docs/`、`eval/`、`CHANGELOG.md` で確かめられます。根拠のファイルは本文中に示します。

評価は筆者の判断です。判断の文は「〜と考えます」「〜が弱点です」のように書き分けます。計測値は新たに示しません。数値は、ソースにある上限・予算・既定値と、プロジェクト自身の記録から引いたものだけです。

取り上げる判断は次の7つです。挙動への影響が大きいもの、または外れたときの被害が大きいものを選びました。

| # | 判断 | 主な根拠 |
| --- | --- | --- |
| 1 | 全アーティファクトを1つのSQLiteグラフに載せ、名前でつなぐ | `crates/dagayn-graph/src/lib.rs`、`docs/CALL-RESOLUTION.md` |
| 2 | 呼び出し先は推論で解決し、SCIPは任意の上書きにする | `docs/plans/SCIP-CALL-RESOLUTION.md` |
| 3 | 編集hookは更新をキューに積み、予算で打ち切る | `dagayn/task_queue.py`、`dagayn/hook_guard.py` |
| 4 | 保存していた派生構造をやめ、問い合わせ時に答える | `docs/plans/FLOW-TOOL-TARGET.md`、`docs/POSITIONING.md` |
| 5 | 応答をLLMエージェントが読む前提で設計する | `docs/plans/AGENT-WORKFLOW-TARGET.md` |
| 6 | RustコアをPythonの前に置き、Python層を削っていく | `docs/plans/PURE-RUST-MIGRATION.md` |
| 7 | 言語の対応水準を、事前登録した実験とCIの下限で決める | `docs/plans/FIRST-CLASS-LANGUAGES-TARGET.md`、`eval/` |

## 1. 1つのSQLiteグラフに載せ、名前でつなぐ

<!-- derived-from ./architecture.md#テーブル -->

### 仕組み

ソースコード、Markdown、Terraform、ノートブックは、同じ `nodes` と `edges` の2表に入ります。種別は `kind` 列で分けます。表の定義は `crates/dagayn-graph/src/lib.rs` の `SCHEMA_SQL` にあります。

```sql
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    -- line numbers, language, is_test, file_hash, ...
);
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    source_qualified TEXT NOT NULL,
    target_qualified TEXT NOT NULL,
    file_path TEXT NOT NULL,
    extra TEXT DEFAULT '{}',
    confidence_tier TEXT DEFAULT 'EXTRACTED',
    -- target_name, line, confidence, updated_at
);
```

エッジは `nodes.id` ではなく `qualified_name` の文字列で両端を指します。外部キーはありません。そのため、ノードの無い名前を指すエッジもそのまま保存できます。`docs/CALL-RESOLUTION.md` の「Outcomes」は、呼び出しエッジの終点を3状態に分けています。

| 状態 | 終点 | 確度 |
| --- | --- | --- |
| Resolved | リポジトリのノード | `EXTRACTED` / `HIGH` / `MEDIUM` |
| External | パッケージ名（`extra.external: true`） | `HIGH` / `MEDIUM` |
| Unresolved | 書かれたままの素の名前 | `LOW` |

保存時にDAG制約はかけません。循環はクエリ時に `architecture_analysis_tool(mode="import_cycles")` が列挙します。

### 理由

名前で結合する理由は、[アーキテクチャ](/projects/dagayn/architecture/) の「設計上の判断」にあります。パーサがIDを知らずにエッジを出せること、アーティファクトをまたげること、応答が読めることの3点です。未解決の状態を正規の状態として持つ理由は `CALL-RESOLUTION.md` が説明しています。`LOW` は「グラフにも既知のパッケージにも説明がない呼び出し」を意味します。

一方で、コード・文書・Terraformを1つのストアにまとめた理由を述べた記録は見当たりません。`docs/ARCHITECTURE.md` の「Query surfaces」は、全ツールが同じデータセットを読むと書くだけです。

### 評価

この判断が買っているのは、ファイル単位の差し替え更新の単純さと、境界をまたぐ問い合わせの安さです。設計書の節からコード、コードからTerraformへの影響追跡が、同じ表の結合で済みます。`CROSS_ARTIFACT` が後処理だけで張れるのも、終点を文字列で持つからだと考えます。

代償は、参照整合性がデータベースではなく慣習で守られる点です。消費側はどのクエリでも「終点がノードとは限らない」前提で書く必要があります。終点の無いエッジを後から格下げする `demote_unresolved_endpoint_edges`（`crates/dagayn-graph/src/postprocess/endpoints.rs`）が要るのはその表れです。

識別子がパスと名前から作られることも弱点です。ファイルの移動や見出しの書き換えで `qualified_name` が変わり、それを指していたエッジは宙に浮きます。`<!-- dagayn: implemented-by ... -->` 形式のdirectiveは、対象が無いあいだ `LOW` に下がります（[グラフモデル](/projects/dagayn/graph-model/)）。一方で `review_tool` の `dangling_reference` は、消えたシンボルへの参照が変更の外に残っていることを報告します。宙に浮いた参照を検出の対象に変えた点で、この弱点をうまく機能に転じていると考えます。

`nodes.id` をキーにする派生表は事情が違います。コミュニティの割り当て（`nodes.community_id`）は、再パースで新しいIDが振られると孤児になります。`docs/SESSION-GRAPH-FRESHNESS.md` の「Derived tables across a re-parse」は、ファイル差し替え時の削除と全体の孤児掃除という2つのガードを記録しています。名前で結ぶ表とIDで結ぶ表の混在は、判断4の背景にもなっています。

エッジkindの語彙を全アーティファクトで共有する点にも注意が要ります。Terraformの組込関数呼び出しも `CALLS` です。依存分析は `CALLS` を除いて数える必要があり、kindを混ぜた消費者は結合を過大に数えます。この使い分けは [グラフモデル](/projects/dagayn/graph-model/) に文書化されています。

名前の問題もあります。標語は「DAG is All You Need」ですが、保存されるグラフは循環を含む前提です。循環を観測できるようにした判断自体は正しいと考えます。ただし、名前から非巡回を期待した読者は誤解しやすいと考えます。

対案として、整数IDの外部キーで結ぶ方式が考えられます。整合性は得られますが、パースと解決が2段になり、ファイル単位の差し替えが重くなります。成果物ごとにDBを分ける方式は、境界をまたぐ結合をアプリ側でやることになります。ローカルで1人が使う前提なら、現在の方式が勝つと考えます。

## 2. 呼び出し先は推論で解決し、SCIPは任意の上書きにする

### 仕組み

Tree-sitter（PythonだけはRuffのパーサ）は、ファイル単位でノードと構造エッジを出します。呼び出し先の決定には型が要りますが、パーサには見えません。そこで後処理が推論します。re-export、素の名前、戻り値型、標準ライブラリのメソッド表、同名メソッドの観測などを順に当てます（`docs/CALL-RESOLUTION.md` の「Post-processing passes」）。

素の名前の束縛は、ソースファイルから見える候補がちょうど1つのときだけです。候補が複数なら束縛せず `LOW` に残します（`docs/SCHEMA.md` の「Edges」）。

`dagayn build --scip` を付けると、推論の前にSCIPのオーバーレイが走ります。仕様は `CALL-RESOLUTION.md` の「SCIP overlay」と `docs/COMMANDS.md` の「SCIP call resolution」です。

- 呼び出しの名前の位置（その行か、続く8行）で、SCIPの参照と突き合わせる
- Rust、TypeScript、Go、Pythonのインデクサは推論の結果を置き換える。TypeScriptとPythonのインデクサはdagaynに同梱される（`dagayn/scip_overlay.py` の `INDEXERS`）
- 他の言語のインデクサは、推論が解決できなかった分だけを埋める
- 確定したエッジは `resolved_by: "scip"` を持ち、`MEDIUM` と `LOW` は `HIGH` に上がる。`query_graph_tool` は `callers_of` / `callees_of` の行にこの値を返す（`crates/dagayn-tools/src/query/rows.rs`）
- 内容のハッシュがグラフと合わないファイルのエッジは飛ばす

`update` で再パースされたファイルは、推論で解決し直されます。SCIPの結果は次のフル `build --scip` まで戻りません（`docs/plans/SCIP-CALL-RESOLUTION.md` の「Incremental updates」）。

### 理由

`SCIP-CALL-RESOLUTION.md` の「Goal」は、コンパイラ級のインデクサから呼び出し先を取り、Tree-sitterの上の型推論層を育てるのをやめることを目標にしています。推論の規則は手書きで、修正のたびに次の誤帰属が開くと書いています。`docs/POSITIONING.md` も、受け手の型推論は凍結し、バグ修正だけを受けると書いています。

Tree-sitterを残す理由も同じ文書にあります。30言語のノードとエッジを、ビルド環境なしにファイル単位で出せます。hookによる差分更新はその性質に依存しています。SCIPはプロジェクト全体を索引するので、ファイル単位の更新には合いません。

### 評価

この判断が買っているのは、ビルド環境なしでもグラフが立つことです。`node_modules` やCargoのビルドが無いリポジトリでも、確度つきの呼び出しグラフが得られます。確度を `HIGH` / `MEDIUM` / `LOW` で明示する点は、不確かさを隠さない良い設計だと考えます。

SCIPで確定したエッジは、行ごとに `resolved_by: "scip"` で分かります（テストは `crates/dagayn-tools/tests/tools/query_graph.rs` の `call_rows_say_which_edges_a_scip_index_settled`）。エッジ単位の出どころは見えます。

残る弱点は範囲です。`build --scip` の直後は一部のファイルがSCIPで確定しています。編集されたファイルから順に推論に戻ります。つまりグラフはファイルごとに精度の違う混合物です。どのファイルが推論に戻ったかは、`missingness` に出ません。答えの理由コード（`crates/dagayn-tools/src/answerability.rs`）にも、SCIPの範囲を表すものはありません。値の無い行が「dagaynだけで解決した行」か「最後の `build --scip` 以降に `update` したファイルの行」かは、行からは区別できません。

文書とコードの食い違いも残っています。`dagayn/scip_overlay.py` と `docs/COMMANDS.md` では、GoとPythonの答えが推論を置き換えます。一方で `docs/CALL-RESOLUTION.md` の「SCIP overlay」と `docs/LLM-OPTIMIZED-REFERENCE.md` は、置き換えるのはRustとTypeScriptだけで、GoとPythonは埋めるだけだと書いています。後者は `get_docs_section_tool` でエージェントが読む文書です。エージェントに読ませる文書が実装とずれている点は、放置しにくい穴だと考えます。

目標と実態のずれも指摘できます。凍結の方針のもとでも、推論層の出力は変わり続けています。Goでは、パッケージ内で束縛した呼び出しが `MEDIUM` から `HIGH` に上がりました。標準ライブラリの関数が返した値へのメソッド呼び出しは、そのパッケージへの外部呼び出しになりました（#286）。Rustでは、`use` で取り込んだ名前をモジュールのre-exportを通して解決する規則などが入りました（rust extractor 29）。`SCIP-CALL-RESOLUTION.md` の「Freezing the inference layer」は、言語仕様が決める事実の記録は新しい規則ではないとする所有者の決定（2026-11-07、#329）を載せています。

`MEDIUM` から `HIGH` への引き上げには根拠があります。testifyとcompressで照合できた7,363本のエッジすべてが、scip-goと同じ定義を指していました（`CHANGELOG.md` 11.1.0）。根拠を測ってから確度を変えた点は良いと考えます。それでも、SCIPが差分更新で使えない以上、日常の精度は推論が決めます。凍結の例外が広がるかぎり、推論層は育ち続けると考えます。

推論の限界は文書化されています。`CALL-RESOLUTION.md` の「Known limitations」は、型の追跡が字句的であることを挙げています。リポジトリと標準型が共有するメソッド名は、受け手の型が無いと解決しないことも挙げています。Goのインターフェース越しの呼び出しは、どの実装にも束縛しません。

候補が1つのときだけ束縛する規則は、再現率より適合率を取る選択です。findingの誤検出はエージェントの手戻りを生むので、この向きは妥当だと考えます。ただし、取りこぼした呼び出しは「無い」ものとして扱われます。判断5の「閉じた答え」の文と組み合わさると、ここが過信の入口になります。

対案として、問い合わせ時にLSPへ聞く方式があります。精度は上がりますが、言語サーバとビルド環境を常に動かす必要があり、ビルド不要という前提を失います。編集ごとにSCIPを回す方式は、プロジェクト全体の索引を毎回払うことになります。時間で層を分ける現在の方式は妥当です。欠けているのは、どこまでがSCIPの層かを答えの単位で伝える仕組みだと考えます。

## 3. 編集hookは更新をキューに積み、予算で打ち切る

### 仕組み

`dagayn install` が登録する編集hookは、Edit / Writeのたびに次を実行するだけです（`dagayn/skills/hooks.py`）。

```bash
dagayn queue add update --repo "$repo" || true
```

キューは `graph.db` とは別のSQLiteファイル `.dagayn/task_queue.db` です。仕組みは `dagayn/task_queue.py` にあります。

- 同じ種類の保留中タスクがあれば、新しいタスクを足さずに合流させる
- 生きたworkerが無ければ、切り離したworkerを1つ起動する
- workerは1本の直列レーンで、実行中のタスクは追い越せない
- 失敗したタスクは `MAX_ATTEMPTS = 3` 回まで再試行し、超えると `dead` として止める
- キューが空になって60秒たつとworkerは終わる

hook経由の更新には壁時計の予算がかかります。`dagayn/hook_guard.py` の `DEFAULT_HOOK_BUDGET_SECONDS` は120秒です。超えるとwatchdogがプロセスを止め、WALにより書きかけの変更は巻き戻ります。`embed` と `postprocess` の予算は600秒、`prepare` は300秒です。

予算超過の扱いは次のとおりです（`CHANGELOG.md` 11.1.0の「Fixed」、#265）。

- watchdogは止める前に、超過を失敗した試行として記録する。タスクは `running` のまま残らない
- 再試行のあいだの編集は、新しい `update` を積まずに再試行へ合流する
- 超過で `update` が `dead` になると、workerはhookの更新を飛ばす。手動の `dagayn update` などでグラフが変わるまで続く
- 止まった状態は `dagayn status` の `Hook updates: stopped` 行と、MCP応答の `hook_updates_stopped`（重大度medium）で示す

hook経由の更新は構造だけで、後処理は `minimal` です。コミュニティ検出は走りません。

### 理由

理由はソースのdocstringに直接書かれています。`task_queue.py` によると、以前は編集のたびに `dagayn update` のプロセスを起動していました。重なった実行は待たずにスキップするので、編集の最後が索引されずに残りました。

`hook_guard.py` は予算の理由を書いています。Claude CodeとCursorは、どちらもhookが起動した子プロセスを止めません。15万3千ファイルのmonorepoで、1つの `update` が1時間以上CPUを使い、WALがGB単位に膨らんだと記録されています。

### 評価

この判断が買っているのは、編集の待ち時間と索引の仕事を切り離したことです。hookはキューへの1回の書き込みとworkerの確認だけで返ります。連続した編集は1回の更新にまとまり、更新は必ず有限時間で終わります。止められても巻き戻るので、グラフは壊れません。外部プロセスに頼らず自分で自分を止める設計は、エディタの挙動を前提にできない以上、正しいと考えます。

大きなリポジトリでの壊れ方は改善されました。以前は、止まったタスクが `running` のまま残り、編集のたびに予算いっぱいの計算が繰り返されました。いまは超過が試行として数えられ、3回で止まり、止まったことが全応答に `missingness` として届きます。この届き方は `crates/dagayn-tools/tests/tools/reply_contract.rs` の `a_dead_hook_update_reaches_every_reply_as_missingness` が検査しています。「hookが働いていない」ことを能動的に知らせる仕組みが入ったので、この弱点はほぼ解消したと考えます。

残るのは、止まったあとのグラフが古いままになることです。これは予算を守るための意図した挙動で、回復には人が `dagayn update` を走らせるか、`.dagayn/hook-skip` で止める必要があります。エージェントが `hook_updates_stopped` を読んで自分で回復するかどうかは保証されません。

鮮度は結果整合です。編集の直後のMCP問い合わせは、workerが終わる前のグラフを読むことがあります。直列レーンの制約もあります。600秒予算の `embed` が走っていると、編集の `update` はその後ろで待ちます。

鮮度の判定にも文書化された穴があります。`SESSION-GRAPH-FRESHNESS.md` の「Known gap」によると、保存されたmtimeと同じmtimeで書き換えられたファイルは見逃されます。mtimeを保存値と同じに戻す書き換え（`cp -p` などで起こり得ます）が該当します。

hook経由では `minimal` しか走らないので、コミュニティは再パースのたびに欠けていきます。文書はこれを「完全より正直」と説明しています。`--skip-flows` という旗は、保存フローが無くなった後もコミュニティ検出を省く意味で残っています。Pythonの `dagayn/cli/commands/build.py` の説明は `Skip community detection` です。Rustの `crates/dagayn-cli/src/build_cmd.rs` の説明は `Skip flow/community detection` で、新しいコードにも古い名前が持ち込まれています。名前と意味のずれは小さな負債だと考えます。

対案として、hookの中で同期的に更新する方式は、記録の上で既に退けられています。ファイル監視（`dagayn watch`）もあります。ただし `SESSION-GRAPH-FRESHNESS.md` によると、監視による更新はHEADを記録しません。キューという形は正しいと考えます。

## 4. 保存していた派生構造をやめ、問い合わせ時に答える

<!-- derived-from ./architecture.md#後処理 -->

### 仕組み

保存フロー、centralityの表（`hub_scores`、`bridge_scores`）、`community_summaries` は、スキーマの移行で削除されています。フローの `criticality`、`review_tool` の `risk_score`、`architecture_analysis_tool` の `hubs` や `communities` などのモードもありません。v10.0.0とv11.0.0で削除されました。

代わりの答えは問い合わせ時に計算します。`flow_tool(mode="entry_points")` は、対象から `CALLS` と報告対象の `CROSS_ARTIFACT` を逆向きに幅優先でたどります（`crates/dagayn-tools/src/entry_points.rs`）。各経路で最初のエントリポイントに当たると止まります。hop数の上限は無く、訪問数が `MAX_VISITED`（10,000）を超えると `truncated` を返します。hubとbridgeの代わりの `surface` は、宣言ユニットごとの被使用数をその場で数えます（`crates/dagayn-tools/src/units.rs`）。

コミュニティの割り当ては今も保存されます。使い道は `refactor_tool(mode="suggest")` の重みづけと、`get_minimal_context_tool` が挙げる大きい順の3つです。未割り当ての数は `counts.unassigned_nodes` に出ます。

### 理由

`docs/plans/FLOW-TOOL-TARGET.md` が詳しい理由を記録しています。要点は次のとおりです。

- 保存フローはフル後処理の後にしか存在しない。`ensure_graph_tool` とhookは `minimal` なので、フローが無いか古い
- `criticality` は実質的にフローの大きさを順位づけていた
- フロー名が一意でなく、出力に上限が無かった
- エージェントが本当に持つ問い「このコードはどこから入るか」に答えられなかった

`SESSION-GRAPH-FRESHNESS.md` も、`nodes.id` をキーにする派生表が再パースで孤児になる問題を記録しています。一部の削除は、実際のリポジトリでの手確認を根拠にしています。35個のコミュニティのうち役に立ったのは3個でした。`review_tool` の `impact` / `context` が44コミットで `changes` に足した事実は11件で、すべて `callers_of` でも得られました（`docs/POSITIONING.md` の「Measured and cut」）。

### 評価

この判断が買っているのは、答えが常にグラフと同じ新しさになることです。`ensure_graph_tool` の直後から答えがあり、古いフローを返すことがありません。集合ではなく1本の経路を返すので、エージェントが順に読めます。保存物を減らして整合の問題ごと消すのは、筋の良い引き算だと考えます。

読み手の無い計算はもう残っていません。タグの `crates/dagayn-build/src/postprocess.rs` に、centralityの段はありません。保存された派生構造はコミュニティだけで、それを直接返す面もありません。この判断の移行は完了したと考えます。

エントリポイントの検出は推論です。慣習的な名前、フレームワークのデコレータ、静的な呼び出し元の無いメソッドなどから判定します。静的な呼び出し元が無いメソッドは `dispatched_method` として残ります。答えの質は、判断2の呼び出し解決の質にそのまま依存します。また、エントリポイントごとに最短経路を1本しか返しません。別経路の存在は答えから見えません。

変更の速さも評価に入れるべきです。`CHANGELOG.md` の日付では、8.0.0が2026-10-07、9.0.0が10-09、10.0.0が10-12、11.0.0が11-04、11.1.0が11-07、11.2.0が11-09です。v11.xの2つのマイナーリリースにも、互換性を壊す変更が入っています。11.2.0は `dagayn.architecture` や `dagayn.refactor` などのPythonモジュール、`numpy` のextra、環境変数 `DAGAYN_EMBEDDING_SEARCH_BACKEND` を削除しました。11.1.0は `dagayn tool` のJSONを1行に変えました。Goの `callers_of` では、モジュール外の行が `results` から `outside_module` に移りました。どちらの節にも「Deprecated」はありません。

MCP応答のフィールドについては、v11.xの変更は追加が中心です（`answers`、`outside_module`、`test_reach.through_callers`、`hook_updates_stopped` など）。応答を読むスクリプトにとっては、メジャーリリースの削除よりは穏やかです。それでもPythonのimportや `dagayn tool` の出力を読むスクリプトは、マイナーリリースで壊れ得ると考えます。

対案として、派生構造を保存したまま差分で再計算する方式があります。これは孤児化と古さの問題を解く必要があり、記録はそれを避けました。結果をキャッシュする方式も、無効化のキーが `nodes.id` なら同じ問題を抱えます。hookが `minimal` しか走らない前提では、問い合わせ時の計算が勝つと考えます。

## 5. 応答をLLMエージェントが読む前提で設計する

### 仕組み

主要ツールの応答は、エージェントが次の一手を取れる形に揃えられています（`docs/plans/AGENT-WORKFLOW-TARGET.md` の「Target contract」）。

- `next`：最大3件の `{tool, args, why}`。`args` はそのまま渡せる完全な引数で、`[]` は答えが完結したことを示す。上限は `crates/dagayn-tools/src/next.rs` の `MAX_NEXT = 3`
- 予算：`minimal` は8K文字、`standard` は32K文字
- `missingness`：その答えを制限する欠落だけを載せる
- 対象が曖昧なら `status="ambiguous"` を返し、候補ごとの再試行を `next` に入れる。候補が5つ以下なら、候補ごとの答えを `answers` に入れる
- 推移的な問い合わせが閉じたら、`summary` の最後に「グラフにある呼び出し元で欠けたものは無い」と書く

予算の実装は `crates/dagayn-tools/src/lib.rs` にあります。予算は4文字を1トークンとして数え、後から足す `next` や `missingness` の分として250トークンを引いています。

```rust
pub(crate) const MINIMAL_BUDGET: usize = 1750;
pub(crate) const STANDARD_BUDGET: usize = 7750;
```

`apply_output_budget` は、優先度の低いリストから半分ずつ切り詰め、収まるまで繰り返します。長さは `python_dumps_len`（`crates/dagayn-tools/src/query/rows.rs`）で、Pythonの `json.dumps` と同じ文字数として数えます。切った分は `_truncation` に `kept` と `total` で残ります。

この契約は `crates/dagayn-tools/tests/tools/reply_contract.rs` のテストで守られています。多数の呼び出しで予算と `next` の形を検査するテスト、`next[0]` をたどって6回以内に答えへ着くテスト、新鮮なグラフで注意書きが出ないことを確かめるテストなどです。

Goの `callers_of` は、答えが閉じたかどうかを事実で説明します（`crates/dagayn-tools/src/query/notes.rs`）。同じ名前の呼び出しのうち定義に届かないものを数え、インターフェース越しか、ライブラリの型か、型の分からない値かに分けます。読むべき行は最大6件まで示します。

### 理由

`AGENT-WORKFLOW-TARGET.md` は、改修前の状態を記録しています。

- 次に呼ぶものが、5つの形で7つのフィールドに散っていた
- 深掘り用のモードが `detail_level` に関係なく30万〜48万文字を返した
- 健全なグラフでも、すべての応答に同じ理由コードが付いていた
- 曖昧な名前では、再試行の手がかりなしに1往復を失った

Goの説明文は、G8とG9の観察から入りました。完全な答えを受け取ったエージェントが、それでも名前をgrepし直していたためです（`eval/g9_go/RESULTS.md`）。

### 評価

この判断が買っているのは、読み手を決めたことで契約を検査可能にした点です。文字数の予算、`next` の件数、引数の完全さは、テストで機械的に落とせます。エージェントが払う文脈のコストも予測できます。ツール出力の設計を読み手の行動の観察から決めたことは、このプロジェクトの最も強い部分だと考えます。

一方で、予算は構成上の保証ではありません。`apply_output_budget` は、切り詰められるリストが尽きても超過していれば `truncated: true` を付けて返します。リストは最低1件を残し、リスト以外のフィールドは切らないので、超過したまま返ることがあります。長さは非ASCII文字を `\uXXXX` の6文字として数えるので、日本語の応答はむしろ多めに見積もられます。上限を守らせているのはフィクスチャ上のテストです。

`next` はエージェントの進路を道具の側が決めることでもあります。テストが確かめるのは、`next` の呼び出しがエラーにならず実在の対象を指すことです。そのタスクにとって正しい次の一手かは、少数のトレースでしか確かめていません。

閉じた答えの文は、エージェントが一覧を確かめ直すのを止めさせるためのものです。ただし「閉じた」の意味は、グラフにある範囲で閉じたということです。判断2で見たとおり、型の分からない受け手への呼び出しはエッジになりません。Goでは、定義に届かない呼び出しの数と種類を説明するようになり、この過信の入口は狭まったと考えます。他の言語には同じ説明がありません。推論に戻ったファイルも応答に無いので、空でない閉じた答えが過信の入口になる点は変わらないと考えます。

逆向きの問題も観測されています。G9のSHORTの質問では、`results_complete: true` の答えを受けた40回のうち36回で、エージェントが名前をgrepし直しました。G10では、ほぼすべての質問で半数以上の実行が同じことをしました。条件文で「数え直すな」と伝えていても同じです。止まったのは、要約が「欠けたものは無い」と平易に言い切った1問（H4）だけです（`eval/g10_go/RESULTS.md`）。応答の文面がエージェントの行動を十分には決めないことを、プロジェクト自身の記録が示していると考えます。

対案として、全部を返してクライアント側で切る方式があります。切り方がクライアント任せになり、重要な行が落ちます。ページングのカーソルは往復が増えます。dagaynは切った一覧に `offset` つきの `next` を付けて、両者の中間を取っています。読み手がエージェントと決まっている以上、現在の方式が勝つと考えます。

## 6. RustコアをPythonの前に置き、Python層を削っていく

### 仕組み

グラフエンジンはRustだけです。`DAGAYN_BACKEND=python` はエラーになります。Pythonの公開モジュール（`dagayn.graph` など）は `dagayn._core`（PyO3）の薄い外装です（`docs/ARCHITECTURE.md` の「GraphStore ownership boundary」）。

分析ツールの本体もRustです。Pythonのツールモジュールはグラフを開いたあと `native_tool` でRustを呼びます（`dagayn/tools/_native.py`）。Rustが答えないと `RuntimeError` になり、Pythonの代わりの実装はありません。v11.2.0は、残っていたPythonの分析の外装（`dagayn.architecture`、`dagayn.flows`、`dagayn.refactor` など）と `networkx` 依存を削除しました。埋め込み検索のnumpyの経路と純Pythonのコサイン計算も削除し、意味検索は常にRustのネイティブ検索を使います。

`dagayn serve` をstdioで起動すると、同じプロセス内のRustのフロントエンド（`crates/dagayn-mcp`）が先に応答します（`docs/plans/PURE-RUST-MIGRATION.md` の「5.3 Rust MCP server」）。

- `initialize` と一覧系にはフロントエンド自身が答え、ツール呼び出しは `crates/dagayn-tools` が答える
- Rustが答えないと判断した呼び出しでは、`call` が `None` を返す
- そのときはfastmcpのサーバをスレッドで起動し、以後の会話を中継する。起動後は、グラフを書く `run_postprocess_tool` もPythonに回る（`crates/dagayn-mcp/src/lib.rs`）
- `--http`、`python -m dagayn serve`、`DAGAYN_PYTHON_CLI=1` はfastmcpの経路のまま

Rustが答えない呼び出しの例は、モデルやプロバイダを指定した `semantic_search_nodes_tool` です（`crates/dagayn-tools/src/search.rs` の `embedding_request`）。この場合はPythonの `hybrid_search`（`dagayn/search.py`）が順位を付けます。

CLIも一部がRustです。`build`、`update`、`status` と、hookの `dagayn queue add` はRustで動き、ほかのサブコマンドはPythonのCLIに戻ります。キューのworkerはPythonです。

Pythonと同じ答えを保つ仕組みも入っています。`tools/mcp_snapshot.py` が応答のスナップショットを凍結し、CIが照合します。`crates/dagayn-tools/src/pyunicode.rs` は、Pythonの `re` の `\w`、`str.isprintable()`、`str.casefold()` の表をRustに持ち込んでいます。表がずれると `tests/test_pyunicode_tables.py` が落ちます。

配布は、PyPIのwheelに `_core` を入れる形です。wheelは安定ABI（`cp312-abi3`）で作り、Linux x86_64とmacOS arm64の各1つでCPython 3.12以降を賄います（`.github/workflows/publish.yml`）。1リリースのアップロードは、約51MBのwheel 2つです。

### 理由

`docs/RUST-CORE-MIGRATION-WIP.md` は「core-first」の置き換えを選び、一度に全部を書き換える方式を退けています。互換の契約を先に決め、その裏でRustのコアを実装し、外側のPythonは同等性が示されてから置き換える順序です。

`PURE-RUST-MIGRATION.md` は、残りのPython層も置き換えて単一の静的バイナリにすることを目標にしています。理由は、hookやMCPセッションごとのインタプリタ起動とメモリ、依存パッケージの供給網、配布の単純さです。同じ文書は、hookの更新コストの原因はPythonではなかったとも明記しています。CLIについては、wheelに別バイナリを入れると102MBになるので、同じプロセスでRustを呼ぶ形を選んだと記録しています。

abi3への切り替えの理由は `CHANGELOG.md` 11.2.0にあります。Pythonの版ごとに作っていた6つのwheelが2つになり、PyPIのプロジェクト上限10 GiBに達するまでの時間を延ばします。11.1.0のアップロードは、この上限に当たりました（#341）。

### 評価

この判断が買っているのは、利用者との契約を壊さずに実装を入れ替え続けられることです。スナップショットを同等性の基準にしたことは、移行の進め方として堅いと考えます。

二重実装の税は小さくなりました。分析ツールの答えはRustにしか無く、Pythonは呼び出しの通り道になっています。numpyと `networkx` が依存から消え、供給網も小さくなりました。この判断の目標に向けて、確実に前進したと考えます。

残る二重実装は検索です。モデルやプロバイダを指定すると、RRFによる順位づけがPython側で別に走ります。正しさの定義が「Pythonと同じ」なので、Unicodeの文字クラスの表と `json.dumps` の長さの再現も続きます。スナップショットが9つの小さなフィクスチャしか覆わないことは、`PURE-RUST-MIGRATION.md` の「Risks」が自ら挙げています。

同じ呼び出しでも、どの層が答えるかは起動経路と状況で変わります。stdioのRustか、中継されたfastmcpか、`--http` のfastmcpかです。不具合を調べる人は、まずどちらが答えたかを確かめる必要があります。環境変数 `DAGAYN_MCP_TRACE` で、Rustが答えた呼び出しを標準エラーに出せます。それでも保守の負担だと考えます。

終着点にはまだ届いていません。Python層の削除と配布の切り替え（5.4〜5.6）は計画のままで、#303で追跡しています。同梱のTypeScriptとPythonのSCIPインデクサは、`python -m dagayn.scip_typescript` のようにPythonのモジュールとして動きます。Rust CLIの `build` は `--scip` に対応していません。計画自身も、遅延の解消後は残りの移行が機能開発と競合すると書いています。中間状態の長期化は、小さくなったとはいえ、この判断の最大のリスクだと考えます。

abi3への切り替えは正しい手当てだと考えます。ただし上限の原因は、全文法を静的にリンクした `_core` の大きさです。1リリース約100MBのままでは、短い間隔でリリースを続けるほど、いずれ同じ上限に近づきます。延ばしただけで、解いてはいないと考えます。ビルド済みのwheelが2つのプラットフォームに限られる点も、配布の範囲を狭めています。

対案として、一度に全部をRustで書き直す方式は、記録の上で退けられています。Pythonのままにする方式は、hookやMCPセッションの起動コストが残ります。段階的な移行は妥当です。v11.2.0の削除で、やり切る方向に寄ったと考えます。

## 7. 言語の対応水準を、事前登録した実験とCIの下限で決める

### 仕組み

`docs/plans/FIRST-CLASS-LANGUAGES-TARGET.md` は、言語が「第一級」である条件を4つ決めています。

1. グラフが正解に照らして正しい（呼び出し先をコンパイラ級のインデクサと、テスト到達をカバレッジと照合する）
2. その正解がCIで下限として検査される
3. review、architecture、flow、refactorの各評価に、その言語のケースがある
4. 事前登録したエージェント実験で、同じ正確さのままトークンか時間が減る

条件2のCIは、テスト到達（`untested_change` の判定）を実際のカバレッジと照合します（`.github/workflows/ci.yml`、`eval/run_test_reach_eval.py --gate`）。下限は言語ごとのファイルにあります。

| 言語 | 対象 | 下限（untested precision / recall / tested precision） | 記録された実測 |
| --- | --- | --- | --- |
| Go | testify v1.12.1 | 0.93 / 0.96 / 0.96 | 0.965 / 0.993 / 0.991 |
| TypeScript | cfwdonのweb-ui | 0.81 / 0.43 / 0.73 | 0.842 / 0.468 / 0.765 |
| Rust | dagayn自身 | 0.43 / 0.23 / 0.92 | 0.464 / 0.278 / 0.952 |
| Python | dagayn自身 | 0.91 / 0.64 / 0.93 | 0.931 / 0.644 / 0.948 |

出典は `eval/test_reach_go_thresholds.yaml`、`test_reach_ts_thresholds.yaml`、`test_reach_rust_thresholds.yaml`、`test_reach_thresholds.yaml` です。TypeScriptのtested precisionは基準の0.90に届いていません。そのため、この下限は後退を止めるだけで、基準の達成を意味しないと所有者が決めています（#295）。

条件4の実験は、Goで3回行われました。

| 実験 | 問い | 基準 | 結果 |
| --- | --- | --- | --- |
| [G8](https://github.com/manji-0/dagayn/blob/v11.2.0/eval/g8_go/RESULTS.md) | testifyとcompressの新しい8問、MCP経由 | 8問の合算でトークンか時間が0.85倍以下（Holm p < 0.05） | トークン1.20倍（悪化が有意）、時間0.97倍、完全一致73対79。未達 |
| [G9](https://github.com/manji-0/dagayn/blob/v11.2.0/eval/g9_go/RESULTS.md) | kongを加えた新しい12問、MCP経由 | LONGで0.85倍以下、SHORTはトークン1.10倍以下 | LONGは時間0.79倍で達成、SHORTはトークン1.17倍。未達 |
| [G10](https://github.com/manji-0/dagayn/blob/v11.2.0/eval/g10_go/RESULTS.md) | chiを加えた新しい12問、CLI経由 | LONGはG9と同じ、SHORTはトークン1.25倍以下 | LONGはトークン1.03倍・時間0.98倍、SHORTは0.92倍だが完全一致39対40。未達 |

各実験は、モデルClaude Haiku 5.5、1問1腕あたり10回の実行です。どの実験でも、Goは第一級になっていません。

### 理由

手順の理由は各 `PREREG.md` にあります。前の実験（G7）の質問は、dagaynの答えを見たあとで選ばれていました。G8からは、dagaynを使わずに作った候補の集合（scip-goの索引とテストごとのカバレッジ）から、決めた規則と種で引きます。登録したファイルのSHA-256は `PREREG.sha256` に残り、結果は登録したコミットを名指しします。

基準は2度変わりました。G8の未達のあと、所有者は0.85倍をLONGの質問だけで検定し、SHORTには上限を置く形に変えました。G9の未達のあと、SHORTの上限を1.10倍から1.25倍に変えました。理由は、スキーマの読み込みとdagaynの呼び出しという固定費です。G9で中央値45kトークンかかり、それだけで1.10倍の上限を超えてしまうためです。どちらも「結果を見たあとの基準の再定義」と計画に明記され、次の質問を引く前に決められています。

### 評価

この判断が買っているのは、効果の主張を検証できる形にしたことです。事前登録、規則と種による抽選、dagaynを使わない正解、置換検定とHolmの補正、登録との差分の記録がそろっています。結果ごとに「言えること」と「言えないこと」を書き分けています。自分の道具に不利な結果を、基準を満たさないまま記録している点は誠実だと考えます。検証の手順として、このプロジェクトで最も信頼できる部分だと考えます。

それでも弱点があります。

- 実験を設計し実施したのはプロジェクト自身で、モデルも1つです。
- 質問は1回あたり8〜12問で、規則で決めた候補からの抽選です。Goの質問一般の標本ではないと、結果自身が書いています。
- LONGとSHORTの境界（名前の呼び出し行数200）は、12問の中の1つの隙間から決めています。
- 基準の変更は、2度とも未達の直後に、緩める向きでした。手続きは公開されていますが、将来「達成」が出たときは、G8の元の基準でも読む必要があると考えます。
- G10は経路をMCPからCLIに変えました。MCPについては何も言えず、G9との比較も原因を分けられません。

結果が言っていることは、はっきりしています。改善はチューニングした場所に集まり、新しい場所では消えます。G9では、修正を合わせたtestifyでトークン0.80倍・時間0.58倍でした。修正を合わせていないkongでは、トークンが1.31倍でした。G10では、どの修正も合わせていないchiのLONGで、トークン1.14倍・時間1.12倍でした。G9のLONGで得た時間0.79倍は、新しい質問のG10で0.98倍になりました。G8では、G7の質問に合わせた修正が、対象名の書き方の問題に隠れてエージェントに届きませんでした（C3）。

この読みから、2つのことが言えると考えます。1つは、Goでの効果はまだ一般化していないことです。もう1つは、未測定の修正が出荷されていることです。G10の欠陥に対する修正（go extractor 19と20、#325〜#329）は11.1.0に入りましたが、エージェント実験では測られていません。

CIの下限は、条件1と2を機械的に守る点で良い仕組みだと考えます。ただし覆う範囲は狭いです。Goはtestifyの4パッケージだけで、compressには下限がありません。TypeScriptは基準未満の後退防止です。Rustのuntested precisionは0.464で、「テストされていない」という判定の半分以上が、カバレッジでは実行されています。閾値ファイルは、テストが起動したバイナリの実行をllvm-covが数え、呼び出しグラフがそれを越えないためと説明しています。Rustの `untested_change` は、確証ではなくヒントとして読むのが妥当だと考えます。

対案として、効果を測らずに言語ごとの機能を足していく方式があります。速く進みますが、効いたかどうかが分かりません。もう1つは、外部の評価基盤に任せる方式です。独立性は上がりますが、dagaynの問いに合う既存の基盤は記録に見当たりません。現在の方式は妥当で、足りないのは独立した再現だと考えます。

## 総合評価

dagaynの設計には一貫した方針があります。ビルド環境なしでファイル単位の構造を安く常に用意し、精度と重い分析は任意か問い合わせ時に回すことです。そして、応答はエージェントが行動できる形で返し、その効果を事前登録した実験で確かめます。v11.2.0は、Pythonの分析の外装と古い依存を削り、Rustコアへの移行を一段進めました。この引き算は、道具の正直さと保守のしやすさを上げたと考えます。

主なリスクと、v11.2.0での状態は次のとおりです。

| # | リスク | 状態 | 根拠 |
| --- | --- | --- | --- |
| 1 | SCIPで確定した範囲が答えの単位で見えない | 変わらない。Goだけは、定義に届かない呼び出しを要約で説明する | 判断2、判断5 |
| 2 | エージェントが読む文書が、GoとPythonのSCIPの扱いを実装と違えて書いている | 変わらない | 判断2 |
| 3 | 負荷の高いリポジトリで更新が止まり、それが見えない | ほぼ解消。止まった状態は `hook_updates_stopped` で全応答に届く。回復は手動 | 判断3、#265 |
| 4 | RustとPythonの二重実装と、移行の中間状態の長期化 | 小さくなった。分析は全部Rust。検索の一部、MCPの中継、workerがPythonに残る | 判断6 |
| 5 | 契約の変化の速さ | 変わらない。マイナーリリースでもPythonのモジュールやCLIの出力形式が変わる | 判断4 |
| 6 | エージェントでの効果が、チューニングした場所の外で再現しない | 新しく見えたリスク。Goは3回の実験で基準に届いていない | 判断7 |
| 7 | 配布物の大きさとPyPIの上限 | 小さくなった。abi3でリリースあたりのwheelは2つになったが、上限への接近は続く | 判断6、#341 |

次のことが起きれば、この評価を変えます。

| 条件 | v11.2.0での状態 |
| --- | --- |
| 答えに使ったエッジのうちSCIPで確定した割合と、推論に戻ったファイルを `missingness` で示す | まだ無い。行ごとの `resolved_by` はある |
| Python層の削除が完了する、または明示的に断念されて二重実装が片側に寄る | 進んでいる。分析の外装とnumpyの経路は削除済み、5.4〜5.6は計画のまま |
| プロジェクトの外の評価者や他のモデルで、エージェント実験の結果が再現される | まだ無い。kongとchiという外部のリポジトリは加わったが、そこで効果が出ていない |
| Goが、チューニングしていないリポジトリの新しい質問で基準を満たす。G8の元の基準でも満たす | まだ無い |
| TypeScriptのtested precisionが0.90に届き、CIの下限が基準の側に上がる | まだ無い（#295） |
| 応答とCLIの形がメジャーリリースのあいだ安定する、または削除の前に非推奨の期間を置く | MCP応答は追加が中心。Pythonのimportと `dagayn tool` の出力はマイナーで変わる |

## 次に読む

仕組みの全体は [アーキテクチャ](/projects/dagayn/architecture/) です。応答の契約の使い方は [MCP ツール](/projects/dagayn/mcp-tools/) へ。レビューでの使い方は [レビューと影響分析](/projects/dagayn/review-analysis/) にあります。
