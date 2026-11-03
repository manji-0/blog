---
title: "設計の評価"
description: "dagayn v11.0.0 の中核となる設計判断と、その代償・破綻条件の評価"
sidebar:
  order: 13
---

このページは、dagaynの中核となる設計判断を6つ取り上げ、それぞれの仕組みと理由を説明したうえで評価します。何ができるかは [アーキテクチャ](/projects/dagayn/architecture/) と [グラフモデル](/projects/dagayn/graph-model/) にあります。ここでは「なぜこう作ったか」と「何を払い、どこで破綻するか」を扱います。

## 対象と読み方

対象はv11.0.0のタグです。事実の記述は、すべてタグのソース、`docs/`、`CHANGELOG.md` で確かめられます。根拠のファイルは本文中に示します。v10.0.0を対象にした前の版で挙げた弱点のうち、v11.0.0で直ったものは、直ったことを書いたうえで評価し直します。

評価は筆者の判断です。判断の文は「〜と考えます」「〜が弱点です」のように書き分けます。計測値は新たに示しません。数値は、ソースにある上限・予算・既定値と、プロジェクト自身の記録から引いたものだけです。

取り上げる判断は次の6つです。挙動への影響が大きいもの、または外れたときの被害が大きいものを選びました。

| # | 判断 | 主な根拠 |
| --- | --- | --- |
| 1 | 全アーティファクトを1つのSQLiteグラフに載せ、名前でつなぐ | `crates/dagayn-graph/src/lib.rs`、`docs/CALL-RESOLUTION.md` |
| 2 | 呼び出し先は推論で解決し、SCIPは任意の上書きにする | `docs/plans/SCIP-CALL-RESOLUTION.md` |
| 3 | 編集hookは更新をキューに積み、予算で打ち切る | `dagayn/task_queue.py`、`dagayn/hook_guard.py` |
| 4 | 保存していた派生構造をやめ、問い合わせ時に答える | `docs/plans/FLOW-TOOL-TARGET.md`、`CHANGELOG.md` 10.0.0・11.0.0 |
| 5 | 応答をLLMエージェントが読む前提で設計する | `docs/plans/AGENT-WORKFLOW-TARGET.md` |
| 6 | RustコアとRustのstdioフロントエンドをPythonの前に置く | `docs/plans/PURE-RUST-MIGRATION.md` |

## 1. 1つのSQLiteグラフに載せ、名前でつなぐ

<!-- derived-from ./architecture.md#スキーマの要点 -->

### 仕組み

ソースコード、Markdown、Terraform、ノートブックは、同じ `nodes` と `edges` の2表に入ります。種別は `kind` 列で分けます。表の定義は `crates/dagayn-graph/src/lib.rs` の `SCHEMA_SQL` にあります。

```sql
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    qualified_name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    -- 行番号、file_hash、mtime_ns、extra など
);
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    source_qualified TEXT NOT NULL,
    target_qualified TEXT NOT NULL,
    file_path TEXT NOT NULL,
    confidence_tier TEXT DEFAULT 'EXTRACTED',
    -- extra、confidence など
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

名前で結合する理由は、既存の [アーキテクチャ](/projects/dagayn/architecture/) の「設計上の判断」にあります。パーサがIDを知らずにエッジを出せること、アーティファクトをまたげること、応答が読めることの3点です。未解決の状態を正規の状態として持つ理由は `CALL-RESOLUTION.md` が説明しています。`LOW` は「グラフにも既知のパッケージにも説明がない呼び出し」を意味します。

一方で、コード・文書・Terraformを1つのストアにまとめた理由を述べた記録は見当たりません。`docs/ARCHITECTURE.md` の「Query surfaces」は、全ツールが同じデータセットを読むと書くだけです。

### 評価

この判断が買っているのは、ファイル単位の差し替え更新の単純さと、境界をまたぐ問い合わせの安さです。設計書の節からコード、コードからTerraformへの影響追跡が、同じ表の結合で済みます。`CROSS_ARTIFACT` が後処理だけで張れるのも、終点を文字列で持つからだと考えます。

代償は、参照整合性がデータベースではなく慣習で守られる点です。消費側はどのクエリでも「終点がノードとは限らない」前提で書く必要があります。`demote_unresolved_endpoint_edges` のように、終点の無いエッジを後から格下げするパスが要るのはその表れです。

識別子がパスと名前から作られることも弱点です。ファイルの移動や見出しの書き換えで `qualified_name` が変わり、それを指していたエッジは宙に浮きます。`<!-- dagayn: implemented-by ... -->` 形式のdirectiveは、対象が無いあいだ `LOW` に下がります（[グラフモデル](/projects/dagayn/graph-model/)）。一方で `review_tool` の `dangling_reference` は、消えたシンボルへの参照が変更の外に残っていることを報告します。宙に浮いた参照を検出の対象に変えた点で、この弱点をうまく機能に転じていると考えます。

`nodes.id` をキーにする派生表は事情が違います。コミュニティの割り当てなどは、再パースで新しいIDが振られると孤児になります。`docs/SESSION-GRAPH-FRESHNESS.md` の「Derived tables across a re-parse」は、ファイル差し替え時の削除と全体の孤児掃除という2つのガードを記録しています。名前で結ぶ表とIDで結ぶ表の混在は、判断4の背景にもなっています。

エッジkindの語彙を全アーティファクトで共有する点にも注意が要ります。Terraformの組込関数呼び出しも `CALLS` です。依存分析は `CALLS` を除いて数える必要があり、kindを混ぜた消費者は結合を過大に数えます。この使い分けは [グラフモデル](/projects/dagayn/graph-model/) に文書化されています。

名前の問題もあります。標語は「DAG is All You Need」ですが、保存されるグラフは循環を含む前提です。循環を観測できるようにした判断自体は正しいと考えます。ただし、名前から非巡回を期待した読者は誤解します。

対案として、整数IDの外部キーで結ぶ方式が考えられます。整合性は得られますが、パースと解決が2段になり、ファイル単位の差し替えが重くなります。成果物ごとにDBを分ける方式は、境界をまたぐ結合をアプリ側でやることになります。ローカルで1人が使う前提なら、現在の方式が勝つと考えます。

## 2. 呼び出し先は推論で解決し、SCIPは任意の上書きにする

### 仕組み

Tree-sitter（PythonだけはRuffのパーサ）は、ファイル単位でノードと構造エッジを出します。呼び出し先の決定には型が要りますが、パーサには見えません。そこで後処理が推論します。re-export、素の名前、戻り値型、標準ライブラリのメソッド表、同名メソッドの観測などを順に当てます（`docs/CALL-RESOLUTION.md` の「Post-processing passes」）。

素の名前の束縛は、ソースファイルから見える候補がちょうど1つのときだけです。候補が複数なら束縛せず `LOW` に残します（`docs/SCHEMA.md` の「Edges」）。

`dagayn build --scip` を付けると、推論の前にSCIPのオーバーレイが走ります。仕様は `CALL-RESOLUTION.md` の「SCIP overlay」です。

- 呼び出しの名前の位置（その行か、続く8行）で、SCIPの参照と突き合わせる
- Rust、TypeScript、Go、Pythonのインデクサは推論の結果を置き換える。TypeScriptとPythonのインデクサはdagaynに同梱される（`dagayn/scip_overlay.py` の `INDEXERS`）
- 他の言語のインデクサは、推論が解決できなかった分だけを埋める
- 確定したエッジは `resolved_by: "scip"` を持ち、`MEDIUM` と `LOW` は `HIGH` に上がる（`EXTRACTED` などほかの段階はそのまま）。`query_graph_tool` は `callers_of` / `callees_of` の行にこの値を返す
- 内容のハッシュがグラフと合わないファイルのエッジは飛ばす

`update` で再パースされたファイルは、推論で解決し直されます。SCIPの結果は次のフル `build --scip` まで戻りません（`docs/plans/SCIP-CALL-RESOLUTION.md` の「Incremental updates」）。

### 理由

`SCIP-CALL-RESOLUTION.md` の「Goal」は、コンパイラ級のインデクサから呼び出し先を取り、Tree-sitterの上の型推論層を育てるのをやめることを目標にしています。推論の規則は手書きで、修正のたびに次の誤帰属が開くと書いています。

Tree-sitterを残す理由も同じ文書にあります。30言語のノードとエッジを、ビルド環境なしにファイル単位で出せます。hookによる差分更新はその性質に依存しています。SCIPはプロジェクト全体を索引するので、ファイル単位の更新には合いません。

Pythonは10.0.0まで「埋めるだけ」でした。SCIPは言語をまたがないのでPyO3経由のRust呼び出しはdagaynにしか見えず、scip-pythonのpyrightは注釈の無い引数を `Unknown` のままにするためです。v11.0.0は、scip-pythonをtyによる自前のインデクサに替え、Pythonも置き換える側に移しました。`SCIP-CALL-RESOLUTION.md` の「The Python indexer」は、置き換えで動く13本のエッジを手で確かめ、Rust拡張への呼び出しはその中に無いと記録しています。PyO3の橋は凍結の対象外です（同文書の「Freezing the inference layer」）。

### 評価

この判断が買っているのは、ビルド環境なしでもグラフが立つことです。`node_modules` やCargoのビルドが無いリポジトリでも、確度つきの呼び出しグラフが得られます。確度を `HIGH` / `MEDIUM` / `LOW` で明示する点は、不確かさを隠さない良い設計だと考えます。

前の版では、最大の弱点を「精度の出どころが応答から見えないこと」としました。スキルと `docs/LLM-OPTIMIZED-REFERENCE.md` は `resolved_by: "scip"` を読むよう案内しているのに、応答を組み立てる `edge_dict` がこの値を返さなかったためです（upstreamの #264）。v11.0.0はこれを直しました。SCIPで確定した呼び出しの `callers_of` / `callees_of` の行は、どの `detail_level` でも `resolved_by: "scip"` を持ちます。実装は `crates/dagayn-tools/src/query.rs` の `resolved_by`、テストは `call_rows_say_which_edges_a_scip_index_settled` です。エッジ単位の出どころが見えるようになり、この弱点の半分は解消したと考えます。

残るのは範囲です。`build --scip` の直後は一部のファイルがSCIPで確定しています。編集されたファイルから順に推論に戻ります。つまりグラフはファイルごとに精度の違う混合物です。どのファイルが推論に戻ったかと、エッジにならなかった呼び出しは、`missingness` に出ません。`LLM-OPTIMIZED-REFERENCE.md` は、値の無い行を「dagaynだけで解決した行か、最後の `build --scip` 以降で `update` したファイルの行」と説明します。行からはその2つを区別できません。

文書とコードの食い違いも、場所を変えて残っています。`dagayn/scip_overlay.py` と `docs/COMMANDS.md` ではGoとPythonの答えが推論を置き換えます。一方で `docs/CALL-RESOLUTION.md` の「SCIP overlay」と `LLM-OPTIMIZED-REFERENCE.md` は、置き換えるのはRustとTypeScriptだけで、GoとPythonは埋めるだけだと書いたままです。後者は `get_docs_section_tool` でエージェントが読む文書です。#264と同じ種類の穴だと考えます。

目標と実態のずれも指摘できます。計画は推論層を育てるのをやめると書きました。しかしv10.0.0はRustのフィールド型による受け手の解決と、TypeScriptの `member_shape` 推論を追加しています（`CHANGELOG.md` 10.0.0の「Added」）。v11.0.0も、Goの受け手をstructのフィールド型や埋め込みから型づける推論（go extractor 11）と、Honoのアプリをたどる推論を加えました（`CHANGELOG.md` 11.0.0の「Added」）。`SCIP-CALL-RESOLUTION.md` の「Freezing the inference layer」は、凍結した層も差分更新の間の答えとして残すと書いています。SCIPが差分更新で使えない以上、日常の精度は推論が決めます。推論層が育ち続けるのは構造上避けられないと考えます。

推論の限界は文書化されています。`CALL-RESOLUTION.md` の「Known limitations」は、型の追跡が字句的であることを挙げています。リポジトリと標準型が共有するメソッド名は、受け手の型が無いと解決しないことも挙げています。v9.0.0の記録は、Rustの `untested_change` を「ヒントとして読む」よう書いています。動的ディスパッチがグラフに見えないためです。

候補が1つのときだけ束縛する規則は、再現率より適合率を取る選択です。findingの誤検出はエージェントの手戻りを生むので、この向きは妥当だと考えます。ただし、取りこぼした呼び出しは「無い」ものとして扱われます。判断5の「閉じた答え」の文と組み合わさると、ここが過信の入口になります。

対案として、問い合わせ時にLSPへ聞く方式があります。精度は上がりますが、言語サーバとビルド環境を常に動かす必要があり、ビルド不要という前提を失います。編集ごとにSCIPを回す方式は、プロジェクト全体の索引を毎回払うことになります。時間で層を分ける現在の方式は妥当です。v11.0.0でエッジ単位の印は入りました。欠けているのは、どこまでがSCIPの層かを答えの単位で伝える仕組みだと考えます。

## 3. 編集hookは更新をキューに積み、予算で打ち切る

### 仕組み

`dagayn install` が登録する編集hookは、Edit / Writeのたびに次を実行するだけです（`dagayn/skills/hooks.py`）。

```bash
dagayn queue add update --repo "$repo" || true
```

キューは `graph.db` とは別のSQLiteファイル `.dagayn/task_queue.db` です。仕組みは `dagayn/task_queue.py` にあります。

- 同じ種類の保留中タスクがあれば、新しいタスクを足さずに合流させる
- 生きたworkerが無ければ、切り離したworkerを1つ起動する
- workerは1本の直列レーンで、優先度は `update` と `prepare` が10、`embed` と `postprocess` が0
- 失敗したタスクは `MAX_ATTEMPTS = 3` 回まで再試行し、超えると `dead` として止める
- キューが空になって60秒たつとworkerは終わる

hook経由の更新には壁時計の予算がかかります。`dagayn/hook_guard.py` の `DEFAULT_HOOK_BUDGET_SECONDS` は120秒です。超えるとwatchdogが `os._exit` でプロセスを止め、WALにより書きかけの変更は巻き戻ります。hook自体のタイムアウトは予算に30秒を足した値です（`dagayn/skills/platforms.py`）。ただし7.2.0以降の編集hookはキューへの投入だけなので、このタイムアウトは更新そのものには効きません。予算はworker側で掛かります。`embed` と `postprocess` の予算は600秒、`prepare` は300秒です。

hook経由の更新は構造だけで、後処理は `minimal` です。コミュニティ検出は走りません。

### 理由

理由はソースのdocstringに直接書かれています。`task_queue.py` によると、以前は編集のたびに `dagayn update` のプロセスを起動していました。重なった実行は待たずにスキップするので、編集の最後が索引されずに残りました。

`hook_guard.py` は予算の理由を書いています。Claude CodeとCursorは、どちらもhookが起動した子プロセスを止めません。15万3千ファイルのmonorepoで、1つの `update` が1時間以上CPUを使い、WALがGB単位に膨らんだと記録されています。Bashをhookの対象から外した理由も、`hooks.py` のコメントにあります。ファイルに触れないコマンドでも毎回差分を取り直していたためです。

### 評価

この判断が買っているのは、編集の待ち時間と索引の仕事を切り離したことです。hookはキューへの1回の書き込みとworkerの確認だけで返ります。連続した編集は1回の更新にまとまり、更新は必ず有限時間で終わります。止められても巻き戻るので、グラフは壊れません。外部プロセスに頼らず自分で自分を止める設計は、エディタの挙動を前提にできない以上、正しいと考えます。

代償は鮮度が結果整合になることです。編集の直後のMCP問い合わせは、workerが終わる前のグラフを読むことがあります。それは `sync.state` の `worktree_behind` で表されます。ただし、エージェントがそれを読んで判断を変えるかどうかは保証されません。

大きなリポジトリでは、もっと悪い形で壊れます。watchdogは更新だけでなくworkerごと止めるので、そのworkerが処理するはずだったほかのタスクも止まります。止まったタスクは `running` のまま残ります。次のworkerの起動時（次の編集時）にこのタスクは再投入され、3回目のあとで `dead` になります（`dagayn/task_queue.py` の `requeue_stale`）。新しい編集は別の `update` を積むので、更新が毎回120秒を超えるリポジトリでは、編集のたびに予算いっぱいの計算が繰り返されます。グラフは古いまま残り、`dead` の件数は `dagayn queue status` でしか見えません。この挙動はupstreamの#265として報告されています。v11.0.0の `dagayn/task_queue.py` の変更はworkerに渡す環境変数（`child_env`）だけで、`requeue_stale` もキューの状態を応答に出す経路も変わっていません。`.dagayn/hook-skip` で手動で止める逃げ道はあります。ただ、「hookが働いていない」ことを能動的に知らせる仕組みは無いと考えます。

直列レーンの制約もコードに書かれています。優先度は実行中のタスクを追い越せません。600秒予算の `embed` が走っていると、編集の `update` はその後ろで待ちます。

鮮度の判定にも文書化された穴があります。`SESSION-GRAPH-FRESHNESS.md` の「Known gap」によると、保存されたmtimeと同じmtimeで書き換えられたファイルは見逃されます。mtimeを保存値と同じに戻す書き換え（`cp -p` などで起こり得ます）が該当します。gitが報告するファイルの更新自体は影響を受けません。

hook経由では `minimal` しか走らないので、コミュニティは再パースのたびに欠けていきます。文書はこれを「完全より正直」と説明しています。`--skip-flows` という旗は保存フロー廃止後もコミュニティ検出を省く意味で残っています。v10.0.0の `CHANGELOG.md` はこの旗が残ることを明記しています。v11.0.0でも旗と説明（`Skip community detection`）は同じです（`dagayn/cli/commands/build.py`）。名前と意味のずれは負債だと考えます。

対案として、hookの中で同期的に更新する方式は、記録の上で既に退けられています。ファイル監視のdaemon（`dagayn watch`）もあります。ただし `SESSION-GRAPH-FRESHNESS.md` によると、監視による更新はHEADを記録しません。キューという形は正しく、残る課題は止まったことの可視化だと考えます。

## 4. 保存していた派生構造をやめ、問い合わせ時に答える

<!-- derived-from ./architecture.md#後処理 -->

### 仕組み

v10.0.0は、保存していた派生構造と、それを読む分析をまとめて削除しました（`CHANGELOG.md` 10.0.0の「Removed」）。

- 保存フロー：スキーマ18が `flows`、`flow_memberships`、`flow_snapshots` を削除する
- フローの `criticality` と、`review_tool` のフロー由来のスコア
- `architecture_analysis_tool` の `hubs`、`bridges`、`knowledge_gaps`、`surprising_connections`、`adp_violations` の各モード
- `dagayn detect-adp` と `get_suggested_questions_tool`

v11.0.0は残りを削除しました（`CHANGELOG.md` 11.0.0の「Removed」）。

- centralityの計算と、スキーマ19が削除する `hub_scores`、`bridge_scores`
- `architecture_analysis_tool` の `communities` と `community` の各モードと、スキーマ20が削除する `community_summaries`
- `review_tool` の `risk_score` と `review_priority_score`

代わりの答えは問い合わせ時に計算します。`flow_tool(mode="entry_points")` は、対象から `CALLS` と報告対象の `CROSS_ARTIFACT` を逆向きに幅優先でたどります（`crates/dagayn-tools/src/entry_points.rs`）。各経路で最初のエントリポイントに当たると止まり、テストコードは通りません。hop数の上限は無く、訪問数が `MAX_VISITED`（10,000）を超えると `truncated` を返します。hubとbridgeの代わりの `surface` は、宣言ユニットごとの被使用数をその場で数えます（`crates/dagayn-tools/src/units.rs`）。

### 理由

`docs/plans/FLOW-TOOL-TARGET.md` が詳しい理由を記録しています。要点は次のとおりです。

- 保存フローはフル後処理の後にしか存在しない。`ensure_graph_tool` とhookは `minimal` なので、フローが無いか古い
- `criticality` は実質的にフローの大きさを順位づけていた
- フロー名が一意でなく、出力に上限が無かった
- エージェントが本当に持つ問い「このコードはどこから入るか」に答えられなかった

`SESSION-GRAPH-FRESHNESS.md` も、`nodes.id` をキーにする派生表が再パースで孤児になる問題を記録しています。削除は8.0.0と9.0.0で非推奨にした後の予定どおりの手順です。`CHANGELOG.md` 10.0.0は、変更が事前登録したエージェント実験に基づくとも書いています。v11.0.0の一部の削除は、実際のリポジトリでの手確認を根拠にしています。35個のコミュニティのうち役に立ったのは3個、`review_tool` の `impact` / `context` が44コミットで `changes` に足した事実は11件で、すべて `callers_of` でも得られたと記録しています（`docs/plans/OPEN-MEASUREMENTS.md`）。

### 評価

この判断が買っているのは、答えが常にグラフと同じ新しさになることです。`ensure_graph_tool` の直後から答えがあり、古いフローを返すことがありません。集合ではなく1本の経路を返すので、エージェントが順に読めます。保存物を減らして整合の問題ごと消すのは、筋の良い引き算だと考えます。

前の版では、移行がまだ途中だと評価しました。v10.0.0の `postprocess.rs` は `minimal` でも `full` でも `centrality()` を呼び、読み手の無い `hub_scores` と `bridge_scores` をhookの経路で書き続けていました。`docs/ARCHITECTURE.md` も、この表を「architecture analysisが使う」と書いたままでした。v11.0.0は計算と表を削除し（`crates/dagayn-graph/src/schema_migrations.rs` の `migrate_v19`）、Pythonの `dagayn/analysis.py` と `ARCHITECTURE.md` の記述も消えました。タグの `crates/dagayn-build/src/postprocess.rs` の後処理に、centralityの段はありません。この弱点は解消したと考えます。

「問い合わせ時に答える」も一様ではありません。コミュニティは今も保存され、`nodes.id` をキーにしています。hookの `minimal` 更新の後は欠けたまま残ります。前の版では、`mode="communities"` が変わらず残る点を古い設計の名残としました。v11.0.0はこのモードを削除し、コミュニティの使い道を `refactor_tool(mode="suggest")` の重みづけと、`get_minimal_context_tool` が挙げる大きい順の3つに絞りました。同時に、コミュニティの無いノードを理由に `graph_health` を下げる `stale_derived_structures` も削除しています（`CHANGELOG.md` 11.0.0の「Changed」）。未割り当ての数は `counts.unassigned_nodes` に残ります。保存された派生構造は残っても、それを直接返す面は無くなったので、名残は小さくなったと考えます。

エントリポイントの検出は推論です。慣習的な名前、フレームワークのデコレータ、静的な呼び出し元の無いメソッドなどから判定します。静的な呼び出し元が無いメソッドは `dispatched_method` として残ります。答えの質は、判断2の呼び出し解決の質にそのまま依存します。また、エントリポイントごとに最短経路を1本しか返しません。別経路の存在は答えから見えません。

変更の速さも評価に入れるべきです。`CHANGELOG.md` の日付では、8.0.0が2026-10-07、9.0.0が10-09、10.0.0が10-12、11.0.0が11-04です。10.0.0までの非推奨期間は1〜2メジャーリリースでした。保存フローと9.0.0の非推奨は1リリース、hubやbridgeのモード、`detect-adp`、`get_suggested_questions_tool` は8.0.0で非推奨、10.0.0で削除です。v11.0.0の「Removed」は、10.0.0で消すはずだった `_hints` などを除き、事前の非推奨を記していません。10.0.0の節にも「Deprecated」はありません。`review_tool` の `impact` / `context` モード、`changed_functions` の `risk_score`、SDPとSAPのモードは、1つのリリースで告知なしに消えました。間隔は3週間に延びましたが、多くの項目で非推奨期間は0になりました。ツール定義の変化はクライアントが吸収できても、`_hints` や `risk_score` のような応答フィールドの削除は吸収できません。応答のフィールドを読むプロンプトやスクリプトは、次のメジャーリリースで壊れます。

v11.0.0の方針は「人が見るための面と、ほかのツールが同じ答えを返すツールを消す」です（`CHANGELOG.md` 11.0.0の冒頭）。この判断の引き算を、保存物からツールの面にまで広げたものです。削除ごとに手確認の数を残した点は、8.0.0〜10.0.0の削除より根拠が具体的だと考えます。ただし、確かめたのはプロジェクト自身で、件数も数十です。

対案として、派生構造を保存したまま差分で再計算する方式があります。これは孤児化と古さの問題を解く必要があり、記録はそれを避けました。結果をキャッシュする方式も、無効化のキーが `nodes.id` なら同じ問題を抱えます。hookが `minimal` しか走らない前提では、問い合わせ時の計算が勝つと考えます。

## 5. 応答をLLMエージェントが読む前提で設計する

### 仕組み

主要ツールの応答は、エージェントが次の一手を取れる形に揃えられています（`docs/plans/AGENT-WORKFLOW-TARGET.md` の「Target contract」）。

- `next`：最大3件の `{tool, args, why}`。`args` はそのまま渡せる完全な引数で、`[]` は答えが完結したことを示す。上限は `crates/dagayn-tools/src/next.rs` の `MAX_NEXT = 3`
- 予算：`minimal` は8K文字、`standard` は32K文字
- `missingness`：その答えを制限する欠落だけを載せる
- 対象が曖昧なら `status="ambiguous"` を返し、候補ごとの再試行を `next` に入れる
- 推移的な問い合わせが閉じたら、`summary` の最後に「グラフにある呼び出し元で欠けたものは無い」と書く

予算の実装は `crates/dagayn-tools/src/lib.rs` にあります。予算は4文字を1トークンとして数え、後から足す `next` や `missingness` の分として250トークンを引いています。

```rust
pub(crate) const MINIMAL_BUDGET: usize = 1750;
pub(crate) const STANDARD_BUDGET: usize = 7750;
```

`apply_output_budget` は、優先度の低いリストから半分ずつ切り詰め、収まるまで繰り返します。長さは `python_dumps_len` で、Pythonの `json.dumps` と同じ文字数として数えます。切った分は `_truncation` に `kept` と `total` で残ります。

この契約は `crates/dagayn-tools/tests/tools.rs` の3つのテストで守られています。22の呼び出しで予算と `next` の形を検査するテスト（v10.0.0の26から、削除したモードの分が減りました）、`next[0]` をたどって6回以内に答えへ着くテスト、新鮮なグラフで注意書きが出ないことを確かめるテストです。

### 理由

`AGENT-WORKFLOW-TARGET.md` は、改修前の状態を記録しています。

- 次に呼ぶものが、5つの形で7つのフィールドに散っていた
- 深掘り用のモードが `detail_level` に関係なく30万〜48万文字を返した
- 健全なグラフでも、すべての応答に同じ理由コードが付いていた
- 曖昧な名前では、再試行の手がかりなしに1往復を失った

`CHANGELOG.md` 10.0.0は、エージェントの観察も変更の理由に挙げています。切り詰められた `minimal` の一覧と空の `next` を受け取ったエージェントは、1hopずつグラフを歩きました。「最初に呼べ」と指示されたエージェントは、1回で済む呼び出しを2回しました。

### 評価

この判断が買っているのは、読み手を決めたことで契約を検査可能にした点です。文字数の予算、`next` の件数、引数の完全さは、テストで機械的に落とせます。エージェントが払う文脈のコストも予測できます。ツール出力の設計を読み手の行動の観察から決めたことは、このプロジェクトの最も強い部分だと考えます。

一方で、予算は構成上の保証ではありません。`apply_output_budget` は、切り詰められるリストが尽きても超過していれば `truncated: true` を付けて返します。上限を守らせているのはフィクスチャ上のテストです。長さは非ASCII文字を `\uXXXX` の6文字として数えるので、日本語の応答はむしろ多めに見積もられます。見積もりと実際のトークン数の差はトークナイザ次第で、上限は保証ではありません。リストは最低1件を残し、リスト以外のフィールドは切らないので、超過したまま返ることがあります。

`next` はエージェントの進路を道具の側が決めることでもあります。テストが確かめるのは、`next` の呼び出しがエラーにならず実在の対象を指すことです。そのタスクにとって正しい次の一手かは、3本のトレースでしか確かめていません。

閉じた答えの文は、エージェントが一覧を確かめ直すのを止めさせるためのものです。ただし「閉じた」の意味は、グラフにある範囲で閉じたということです。判断2で見たとおり、型の分からない受け手への呼び出しはエッジになりません。文は言語ごとにグラフが持たないものを添えるので、この弱点は一部和らげられています（`CHANGELOG.md` 10.0.0の「Changed」）。v11.0.0は、ノードはあるが求めたエッジが無いときに `node_has_no_matching_edges` を返し、`callers_of` では値としての使用が呼び出しエッジにならないことを添えるようにしました（#195）。空の答えについては、過信の入口が1つ閉じたと考えます。それでも、推論に戻ったファイルとエッジにならなかった呼び出しが応答に無い現状では、空でない閉じた答えが過信の入口になると考えます。

効果の根拠は自己評価です。実験はプロジェクト自身が設計して実施したもので、主な実験はClaude Haiku 5.5、ほかにOpus 5.5の実験が1つあります（`CHANGELOG.md` 10.0.0、`docs/plans/AGENT-WORKFLOW-TARGET.md`）。しかも結果は割れています。CHANGELOGが挙げる好結果はRustとTypeScriptの質問でのものです。一方で同じ記録には、作業全体のトークンがMCPなしより多かった回（Opusで1.29倍、Haikuで1.26倍）もあり、測った3つの変更はどれも作業全体のトークンを有意に動かさなかったと書かれています。トークンの削減は質問の種類に依存すると読むのが妥当です。v11.0.0は、GoとPythonで事前登録した実験の結果も載せています。各160回の実行（Claude Haiku 5.5）で、dagaynありのエージェントのトークンはなしの1.00倍（Go）と1.05倍（Python）でした。どちらも0.85倍という基準に届かず、Goは第一級の対応とせず、Pythonは保守にとどめると決めています（`eval/g7_go/RESULTS.md`、`eval/m3_python/RESULTS.md`）。基準に届かない結果を記録し、言語ごとの投資を変えた点は誠実だと考えます。同時に、効果がRustとTypeScriptの質問に限られるという読みを強めます。他のリポジトリでの一般性は記録からは分かりません。また、人間向けの説明だった `guidance` は `detail_level="verbose"` に移りました。v11.0.0はさらに、Wikiの生成、`dagayn visualize` とそのエクスポート、VS Code拡張を削除しました。読み手をエージェントに決めた判断は、v11.0.0で人間向けの面の削除まで進んだと考えます。

対案として、全部を返してクライアント側で切る方式があります。切り方がクライアント任せになり、重要な行が落ちます。ページングのカーソルは往復が増えます。読み手がエージェントと決まっている以上、現在の方式が勝つと考えます。

## 6. RustコアとRustのstdioフロントエンドをPythonの前に置く

### 仕組み

グラフエンジンはRustだけです。4.13.0でPythonのグラフエンジン、フロー追跡、コミュニティ検出、FTS再構築、後処理、スキーマ移行が削除されました。`DAGAYN_BACKEND=python` はエラーになり、8.0.0からは `rust` 以外の値もすべてエラーです（`CHANGELOG.md`）。Pythonの公開モジュールは `dagayn._core`（PyO3）の薄い外装です。ハイブリッド検索の順位づけと、マニフェスト由来の橋の抽出はPythonに残ります（`docs/ARCHITECTURE.md`）。

`dagayn serve` をstdioで起動すると、同じプロセス内のRustのフロントエンド（`crates/dagayn-mcp`）が先に応答します（`docs/plans/PURE-RUST-MIGRATION.md` の「5.3 Rust MCP server」）。

- `initialize` と一覧系にはフロントエンド自身が答え、多くのツール呼び出しには `crates/dagayn-tools` が答える
- Pythonと全く同じ答えを返せないと判断した呼び出しでは、`call` が `None` を返す
- そのときはfastmcpのサーバをスレッドで起動し、`initialize` を再生する。以後、Rustが答えない呼び出しと、グラフを書く呼び出し（タグでは `run_postprocess_tool`）をPythonへ中継する。ネイティブのツール呼び出しは引き続きRustが答える（`crates/dagayn-mcp/src/lib.rs`）
- `--http`、`python -m dagayn serve`、`DAGAYN_PYTHON_CLI=1` はfastmcpの経路のまま

Pythonと同じ答えを保つ仕組みも入っています。`tools/mcp_snapshot.py` が応答のスナップショットを凍結し、CIが照合します。`crates/dagayn-tools/src/pyunicode.rs` は、Pythonの `re` の `\w`、`str.isprintable()`、`str.casefold()` の表をRustに持ち込んでいます。表がずれると `tests/test_pyunicode_tables.py` が落ちます。

編集hookの `dagayn queue add` は、Pythonのランチャ（`dagayn/_cli_launcher.py`）が引数解析を省いてキューに書きます。キューを処理するworkerもPythonです。

### 理由

`docs/RUST-CORE-MIGRATION-WIP.md` は「core-first」の置き換えを選び、一度に全部を書き換える方式を退けています。互換の契約を先に決め、その裏でRustのコアを実装し、外側のPythonは同等性が示されてから置き換える順序です。PyO3による結合は「凍結した判断」として表に載っています。

`PURE-RUST-MIGRATION.md` は、残りのPython層も置き換えて単一の静的バイナリにすることを目標にしています。理由は、hookやMCPセッションごとのインタプリタ起動とメモリ、依存パッケージの供給網、配布の単純さです。同じ文書は、hookの更新コストの原因はPythonではなかったとも明記しています。CLIについては、wheelに別バイナリを入れると102MBになる一方、Pythonの起動と `_core` の読み込みは0.01秒・20MBで済むという理由で、同じプロセスを選んだ記録があります（`PURE-RUST-MIGRATION.md`）。MCPフロントエンドも同じ方針に従っています。

### 評価

この判断が買っているのは、利用者との契約を壊さずに実装を入れ替え続けられることです。Rustが答えられない呼び出しはPythonが答えるので、移行の途中でも機能が欠けません。スナップショットを同等性の基準にしたことは、移行の進め方として堅いと考えます。

代償は、移行期間中に同じツールの実装が2つあることです。しかも正しさの定義が「Pythonと同じ」なので、RustはPythonの細部まで真似る必要があります。Unicodeの文字クラスの表と `json.dumps` の長さの再現がその例です。この税は公開面が広がるほど増えます。

2つの実装は、フィクスチャが覆わない入力でずれ得ます。`PURE-RUST-MIGRATION.md` の「Risks」は、スナップショットが9つの小さなフィクスチャしか覆わないことを自ら挙げています。文書化された弱点です。

同じ呼び出しでも、どの実装が答えるかは起動経路と状況で変わり、Pythonが起動したあとも呼び出しごとに決まります。7.2.0の記録では、書き込み中のグラフを最大3秒待ち、それでも空かなければPythonに回りました。不具合を調べる人は、まずどちらが答えたかを確かめる必要があります。これは保守の負担だと考えます。

終着点にもまだ届いていません。Python層の削除と配布の切り替え（5.6）は、タグの時点では計画のままです。v11.0.0は、Pythonにしか無かった面（Wiki、`dagayn visualize` とエクスポート、`dagayn-daemon` の引数解析、`dagayn profile`、`dagayn.sap`）を削除し、Python層を小さくしました。一方で、同梱したTypeScriptとPythonのSCIPインデクサは、Rustで書かれていても `python -P -m dagayn.scip_typescript` のようにPythonのモジュールとして子プロセスで動きます（`dagayn/scip_overlay.py`）。計画自身も、遅延の解消後は残りの移行が機能開発と競合すると書いています。中間状態の長期化が、この判断の最大のリスクだと考えます。

対案として、一度に全部をRustで書き直す方式は、記録の上で退けられています。Pythonのままにする方式は、hookやMCPセッションの起動コストが残ります。段階的な移行は妥当です。ただし、どこで止めるか、または最後までやり切るかを決めないと、二重実装の税を払い続けることになります。

## 総合評価

dagaynの設計には一貫した方針があります。ビルド環境なしでファイル単位の構造を安く常に用意し、精度と重い分析は任意か問い合わせ時に回すことです。そして、応答はエージェントが行動できる形で返します。v8からv11の変更は、保存物とスコアを減らす方向に揃っています。v11.0.0は、この引き算を人間向けの面とツールの重複にまで広げました。この引き算は、道具の正直さを上げたと考えます。

一方で、正直さが応答の表面で止まっている箇所があります。最大の未解決のリスクは次の4つです。

1. **SCIPで確定した範囲が見えない。** 推論とSCIPの結果がファイルごとに混ざります。v11.0.0でエッジ単位の `resolved_by` は返るようになりました（#264）。それでも、推論に戻ったファイルとエッジにならなかった呼び出しは応答に無く、GoとPythonの扱いを古いまま書いた文書をエージェントが読みます。閉じた答えの文はエージェントに確認をやめさせます（判断2、判断5）。
2. **移行の負債。** RustとPythonの二重実装と、意味の変わった `--skip-flows` が残っています。読み手の無い中心性の計算と、それを書いた `ARCHITECTURE.md` の記述は、v11.0.0で消えました（判断3、判断4、判断6）。
3. **負荷の高いリポジトリでの鮮度。** 予算内に終わらない更新は `dead` になり、グラフは古いまま残ります。それを示すのは `dagayn queue status` だけで、v11.0.0でも変わっていません（判断3、upstreamの #265）。
4. **契約の変化の速さ。** 4つのメジャーリリースが4週間で出ています。v11.0.0で消えたモードと応答フィールドの多くは、非推奨期間を置いていません。エージェントは追従できても、応答を読むスクリプトは追従できません（判断4、判断5）。

次のことが起きれば、この評価を変えます。

- 応答が `resolved_by` を返し、答えに使ったエッジのうちSCIPで確定した割合と、推論に戻ったファイルを `missingness` で示すようになる（v11.0.0で `resolved_by` は返るようになった。割合と推論に戻ったファイルはまだ無い）
- 中心性の計算が削除されるか、読み手に再接続される（v11.0.0で削除された）
- Python層の削除が完了する、または明示的に断念されて二重実装が片側に寄る
- プロジェクトの外のリポジトリや他のモデルで、エージェント実験の結果が再現される
- 応答の形が1つのメジャーリリースのあいだ安定する、または削除の前に非推奨の期間を置くようになる

## 次に読む

仕組みの全体は [アーキテクチャ](/projects/dagayn/architecture/) です。応答の契約の使い方は [MCP ツール](/projects/dagayn/mcp-tools/) へ。
