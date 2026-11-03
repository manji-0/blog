---
title: "設計の評価"
description: "rdra-ish v1.1.0 の主要な設計判断と、その利点・代償・破綻条件の評価"
sidebar:
  order: 4.8
---

このページは、rdra-ish v1.1.0の設計判断を6つ取り上げ、それぞれの仕組みと理由を説明したうえで評価します。コマンドの使い方は [使い方](/projects/rdra-ish/usage/) と [CLI リファレンス](/projects/rdra-ish/cli-reference/) にあります。ここでは「なぜこの形なのか」と「どこで困るのか」に絞ります。

事実はすべてタグ `v1.1.0` のソースとドキュメントで確かめられるものに限ります。ファイルパスはリポジトリ [rdra-ish-dsl](https://github.com/manji-0/rdra-ish-dsl/tree/v1.1.0) のルートからの相対パスです。評価の部分は筆者の判断であり、「〜と考えます」のように書き分けます。

このページは最初v1.0.0を対象に書きました。そこで挙げた問題のうち、upstreamのissue #93、#94、#95、#96はv1.1.0で直りました。該当する箇所では、v1.0.0での状態を1文で残し、v1.1.0での再評価を書きます。

## 取り上げる判断

| # | 判断 | 主に効く場所 |
|---|---|---|
| 1 | 関係を正とするテキストモデルと、すべての出力が読む1つの遷移系 | モデル全体 |
| 2 | 有界の `check` / `states` | 日常のレビューループ |
| 3 | TLA+/TLCを同じ遷移系の2つ目の探索器にする | 形式検証 |
| 4 | 1述語1形式とv1.0の互換性契約 | 構文と出力の安定性 |
| 5 | Stage 0–7を1つの仕様から生成し `next` で判定する | 段階的モデリング |
| 6 | 生成物の種類ごとのfail-closed | 生成系サブコマンド |

選んだ基準は、振る舞いを広く決めているものと、誤った安心を生む危険が大きいものです。1から3は検証結果の意味を決めます。4は利用者が背負う移行コストを決めます。5と6はツールが何を止め、何を通すかを決めます。

## 1. 関係を正とするテキストモデルと1つの遷移系

### 仕組み

モデルの正は `.rdra` のテキストです。要素は `actor` や `usecase` のような宣言で、要素間の関係は `performs(Customer, BucOrder)` のような述語で書きます。図は正ではありません。`diagram` はMermaidテキストだけを出し、ノードIDは `<kind>__<Id>` の形でkindをまたいで共通です。図からすべての事実を読み戻せるよう、`docs/cli-reference.md` の「Encoding contract」が書式を定め、`crates/rdra-ish-cli/tests/diagram_contract.rs` が全サンプルで検査します。

ライフサイクルも同じモデルから1つの遷移系として組み立てます。`docs/state-derivation.md` は次のように書いています。

> No second reading of the model exists, so BFS and TLC cannot disagree on what a use case does.

実装は `crates/rdra-ish-core/src/lifecycle/` の `TransitionSystem` です。`states` / `check` / `diagram --kind state` / TypeScriptの状態union / TLA+出力が、すべてこれを読みます。TLA+の出力器 `crates/rdra-ish-emit/src/tla/mod.rs` の冒頭には「It reads the system and nothing else」とあります。

### 理由

`docs/vision.md` は、RDRAの著者が要件定義・論理データ・設計を別の工程に置いていることを確認したうえで、rdra-ishはその3層を1つのモデルで扱うと書いています。名前の "ish" はその選択だという説明です。

| 層 | 正の出典 | ツールが保証すること |
|---|---|---|
| 要件 | RDRA 3.0 | RDRAの規則が要求する接続がそろい、未定義・未接続がない |
| 論理データ | 著者のRDRASpecの対応規則 | DBML / JSON Schema / OpenAPIを生成できる正規化された関係モデル |
| ライフサイクル | rdra-ish | 有界の範囲で、制約を破る到達状態がなく、宣言した状態に到達できる |

遷移系を1つにした理由も記録に残っています。`docs/vision.md` の冒頭は、TLA+出力が一部の `sets` を落としていたこと、`states` とTLA+出力の初期状態が違っていたことを挙げています。2つの読み方があったせいで、到達可能な禁止状態が `TLC: OK` になったという記録です。

### 評価

テキストを正にしたことで、差分レビュー、型検査、生成物の再生成が素直に成り立ちます。描画だけを目的にした図のツールでは、要素の接続漏れを機械的に検出するのが難しくなります。RDRAが重視する「つながっていない要素を見つける」作業とテキストDSLは相性がよいと考えます。

代償は2つあります。

1つ目は、図の空間配置が持っていた情報を捨てたことです。RDRAの図は配置そのものが議論の道具です。rdra-ishの互換性契約は、レンダラの配置を対象外と明記しています（`docs/compatibility.md`）。図を読むのは「再描画する読み手」だという立場（v0.3.0のCHANGELOG）なので、筋は通っています。ただし、業務担当者と同じ図を囲んで話す使い方には向かないと考えます。

2つ目は、3層を1つのモデルに入れたことで、RDRAとのずれが設計上避けられない点です。`docs/vision.md` は、`condition` と `variation` の削除がRDRA 3.0と矛盾していたと自ら指摘し、2026-10-27の判断で復元しています。`docs/rdra-ish-interpretation.md` は、BUC・業務フロー・UCをRDRAとは違う責務で読むと明言しています。RDRAの成果物を期待して読む人には、この差分を毎回説明する必要があります。差分が文書化されている点は評価できますが、RDRA準拠のツールとしては扱えないと考えます。

遷移系を1つにした判断は、この版で最も効いていると考えます。図・表・検証の結果が互いに食い違う原因を構造的に消しています。一方で、これは検証の独立性を下げます。その点は判断3で扱います。

v1.0.0の時点では、`docs/vision.md` の冒頭が、`verify` が何も検査せずに成功しうるという直った問題を現在形のまま書いており、読む側が混乱しやすい状態でした（issue #96）。v1.1.0で冒頭は経緯として書き直され、「Both are fixed since v0.3.0」と、TLA+出力器が `states` / `check` / `verify` と共有の `TransitionSystem` だけを出力することが明記されました。この指摘は解消したと考えます。

## 2. 有界の check / states

### 仕組み

`check` と `states` は、遷移系を幅優先探索（BFS）で網羅します。探索の範囲は境界で区切ります。v1.1.0から、インスタンス数とIntの値域を `--instance-count` / `--int-range-max` で変えられます。既定値はv1.0.0と同じです。

| 項目 | `check` / `states` | 出典 |
|---|---|---|
| エンティティあたりのインスタンス数 | 既定1（`--instance-count`） | `Bounds::STATES`（`crates/rdra-ish-core/src/lifecycle/types.rs`） |
| Int / Money / Date などの値域 | 既定 `0..5`（`--int-range-max`） | 同上 |
| coneあたりの状態数の上限 | 65,536（`--max-states`） | `Caps::STATES`（`crates/rdra-ish-core/src/lifecycle/states.rs`） |
| エンティティビューあたりのパターン数の上限 | 256（`--max-patterns`） | 同上 |

探索はモデル全体を一度に回しません。不変条件やエンティティビューごとに、その対象が読む変数だけを集めた「cone of influence」を作り、coneごとに探索します。`docs/state-derivation.md` は、coneの到達状態は全体の到達状態の射影に一致すると書いています。例外は、coneが読まないエンティティを生成するアクションです。その場合coneはその生成を落とし、スロット不足で止まらないため、到達集合は上位集合になります。

上限に達したときは、結果を部分的なまま通しません。`StateCapReached` と `PatternCapReached` はerrorです。成功時の最終行には境界が入ります。

```
OK: no errors within 1 instance per entity, Int 0..5
```

`--instance-count 2` を渡せば、この行は `within 2 instances per entity` になります。

### 理由

`docs/vision.md` は、TLAPSや帰納的な不変条件による無限の証明を範囲外とし、「verification means bounded model checking with TLC, and the bounds are part of every result」と書いています。`check` の既定を1インスタンスにした理由そのものは、記録には見当たりません。`docs/formal-verification.md` には、モデル全体を2インスタンスで回す実行がclinic-opsでは終わらなかったという記録があります。日常のループに置く `check` を軽く保つための判断だと推測しますが、これは推測です。

### 評価

境界を結果の一部として印字する設計は誠実です。上限到達をerrorとして扱う点も、部分探索で「OK」を出す失敗を防いでいます。

一方で、1インスタンスの「OK」が保証する範囲は狭いです。次の限界は、すべて `docs/formal-verification.md` の「Known verification gaps」に文書化されています。

- 2インスタンスで初めて破れる規則は、既定の `check` では空虚に成り立ちます。1:1関係から生成される `Unique_*` がその代表です。`one_to_one_shared.rdra` は既定の `check` が通り、TLCで失敗します。v1.1.0では `check --instance-count 2` でも終了コード1になります。
- 削除したスロットは再利用しません。1インスタンスでは、エンティティは一度しか生成されません。
- イベントとタイマーは、起動するUCに順序を課しません。過大近似なので見逃しはありませんが、実際には起きない反例を報告することがあります。
- `--buc` で絞ると、到達witnessの欠如、実行されないUC、デッドロックは判定されず、`not checked:` に回ります。
- `check` は時間性質（`always` / `eventually` / `leads_to`）を評価せず、`note:` を出すだけです。

利用者が最も誤読しやすいのは、`check` の「OK」をモデルの正しさの証明として読むことだと考えます。境界は印字されていますが、`Unique_*` が1インスタンスでは検査として意味を持たないことは、OK行からは読み取れません。規則ごとに「この境界で空虚に成り立った」と示すほうが安全だと考えます。

もう1つの弱点は、空虚な制約の扱いです。どのUCも書かない列を読む制約には `UnwrittenConstrainedVar` が出ますが、重大度はwarningです（`crates/rdra-ish-core/src/lifecycle/diag.rs`）。その制約は初期値しか検査していません。それでも `check` は終了コード0で終わり得ます。探索中のモデルでwarningを許す方針（[段階的モデリング](/projects/rdra-ish/incremental-modeling/)）と組み合わさると、意味のない制約が「通った」ように見えます。

v1.0.0では、互換性契約との関係にも隙間がありました。`docs/compatibility.md` は境界をフラグで渡して判定を再現するよう勧めていたのに、`check` が受け付ける境界のフラグは `--max-states` と `--max-patterns` だけで、インスタンス数とIntの値域は固定でした（issue #95）。v1.1.0で `check` と `states` に `--instance-count` と `--int-range-max` が入り、`docs/compatibility.md` の「Bounds」の節も、この2つと `--max-states` を `check` と `states` に渡すよう書き直されました。フラグなしの実行は以前と同じ境界で回ります。契約の文面と実装は噛み合ったと考えます。

代替案は、`check` の既定を2インスタンスにすることです。`Unique_*` のような規則が既定の `check` で意味を持ちます。代わりに、状態数は大きく増えます。`docs/formal-verification.md` の表では、clinic-opsのいくつかのconeが2インスタンスで数十万から300万を超える状態に達します。65,536の上限を持つ `check` は、そのままでは止まります。v1.1.0からは、利用者が実行ごとに `--instance-count 2` を選べます。既定を1インスタンスに保ち、必要なときに広げられる現状は、妥当な折衷だと考えます。ただし、既定の `check` で何が見えないかは、OK行ではなく文書を読まないと分かりません。

## 3. TLA+/TLCを同じ遷移系の2つ目の探索器にする

### 仕組み

`export --kind tla` は遷移系全体を `RdraSpec.tla` と `.cfg` に書きます。`verify --backend tlc` は、不変条件と `after` アサーションごとにconeを切り、coneごとのSpecをTLCで並列に検査します。時間性質は1つずつ別のTLC実行に分けます。TLCは時間性質の反例で、どの性質が破れたかを名指ししないためです（v0.3.0のCHANGELOG、`docs/formal-verification.md`）。

| 項目 | `verify` の既定 | 出典 |
|---|---|---|
| インスタンス数 | 2（`--instance-count`） | `Bounds::VERIFY` |
| Intの値域 | `0..5`（`--int-range-max`） | 同上 |
| witness・デッドロック判定用BFSの上限 | 2^23 = 8,388,608状態/cone | `Caps::VERIFY` |
| モデル全体での時間性質の予算 | 300秒（`--temporal-budget`）、2,097,152状態 | `docs/formal-verification.md` |

2つの探索器が一致することは、テスト `engine_equivalence`（`crates/rdra-ish-cli/tests/engine_equivalence.rs`）が確かめます。全サンプルの全coneについて、到達状態、初期状態、辺の集合、witness・デッドロックの所見、各不変条件の判定を比べます。TLCが出した反例は、BFSの遷移関係で再生できなければなりません。

### 理由

記録上の理由は2つです。1つは、判断1で触れた、2つの読み方による食い違いをなくすことです。`docs/vision.md` のフェーズ4は、両エンジンが全サンプルで同じ到達状態を報告することを完了条件にしています。もう1つは扱える規模です。coneに分けるのは、モデル全体の実行が大きなサンプルで終わらないためだと `docs/formal-verification.md` は説明しています。

### 評価

この構成で得られる保証は、「探索の実装が正しい」ことです。BFSとTLCという別々の探索器が同じ状態グラフに着くので、探索器のバグはかなり見つかると考えます。TLA+の出力器が遷移系を忠実に書き出していることも、状態グラフの一致で間接的に確かめられます。

得られない保証は、「モデルの読み方が正しい」ことです。両者は同じ `TransitionSystem` を読みます。`.rdra` からその遷移系を組み立てる段階に誤読があれば、BFSとTLCは同じ誤読を検査します。`engine_equivalence` はその誤読を検出しません。TLCの「OK」は、独立した第2の意見ではありません。同じ解釈を別の方法で探索した結果です。この点は利用者が誤解しやすいと考えます。

さらに、`verify` の判定の一部はTLC由来ですらありません。到達witnessの欠如、デッドロック、実行されないUCは、`verify` の中でもBFSで計算します。サンプル表では `unwitnessed_state.rdra` と `deadlock.rdra` の列が「fail, pass」で、TLC単体は通ることが示されています（`docs/formal-verification.md`）。

一致テストの範囲にも穴があります。2インスタンスでBFSが200,000状態を超えるconeは、1インスタンスでしか比べません。`VERIFY_FALLBACK` に19個のconeが挙がっています。このconeについて、`docs/formal-verification.md` は「treat a `verify` verdict on these cones as TLC's alone」と書いています。リストの増減でテストが落ちる仕組みなので、穴の大きさは常に名指しされます。この点は丁寧だと考えます。

大きなモデルでは、検証できる範囲がモデルの書き方を縛ります。`patent-ops` は、出願が承認済みの起案に続くことを検査していません。そのガードと関係を足すと、coneが2インスタンスで10,000,000状態を超えるからです。`insurance-claim-ops` も同じ理由でガードを外しています。どちらも文書化されています。検証が回るように要件を削る圧力は、有界モデル検査一般の弱点です。ただ、要件モデルのツールでは削られるのは要件そのものなので、影響は重いと考えます。

代替案として、TLA+への変換を遷移系とは独立に実装し、N-version的に比べる方法が考えられます。解釈の誤りも検出できる可能性があります。しかしこのプロジェクトは、まさに2つの読み方が食い違って空虚なOKを出した経緯から1つに寄せています。独立実装は食い違いの調査コストを常に払うことになります。小規模な個人プロジェクトでは現状の選択が妥当だと考えます。解釈の正しさは、`// expect` ヘッダ付きのサンプル（`docs/formal-verification.md` の「Sample expectations」）で別途押さえる形になっています。

## 4. 1述語1形式とv1.0の互換性契約

### 仕組み

構文は「1つの述語に1つの書き方」に寄せられています。v0.4.0の変更は、UCを第1引数に置き、列を常に `Entity.column` と書き、キーワードを1語にする、という方向でそろえました（`docs/language-reference.md`）。

```rdra
transitions(Pay, Order.status, pending -> paid)   // v0.4.0以降
sets(Pay, Order.status == paid)                    // v1.0.0以降
```

廃止した書き方は `crates/rdra-ish-syntax/src/removed.rs` の `LEGACY_FORMS` に1か所で登録されます。各行は `Status::Deprecated`（ロードでき、警告を出す）か `Status::Removed`（書き換え後の行を示すロードエラー）です。移行は `scripts/migrate-phase3.py`、`migrate-syntax-v2.py`、`migrate-syntax-v3.py` で行います。

v1.0.0から、`docs/compatibility.md` が互換性を約束します。対象は次のとおりです。

- 構文：ロードできたモデルは、次のメジャーリリースまでロードできる
- 意味：同じモデル・同じ境界なら、`check` と `verify` はそれぞれ、リリースをまたいで同じ終了コードと同じerror名の集合を返す
- 診断名、lintのルールID、`// expect` ヘッダの文法
- サブコマンドとフラグ、終了コード、JSONのキーとCSVの列
- Mermaid図の符号化（ヘッダ、ノードID、`classDef`、辺ラベルの規則）
- TLA+の不変条件名・性質名・変数名

### 理由

破壊的変更の記録が、そのまま設計の圧力の記録になっています。日付はv0.3.0が2026-10-30、v0.4.0が2026-11-01、v1.0.0が2026-11-03です（`CHANGELOG.md`）。

| 版 | 主な破壊的変更 | 背景にある圧力 |
|---|---|---|
| v0.3.0 | 図をMermaidだけにしてRDRA 3.0の図に合わせて作り直す。`state`・`location`・`timing` などの削除 | 図を正ではなく投影にする。RDRAに対応物がない語彙を減らす |
| v0.4.0 | 述語の引数順と列の書き方を統一。トップレベル `when(...)` と `writes` の削除 | 同じ意味の別表記をなくす（`writes` は `updates` の別名だった） |
| v1.0.0 | `sets(UC, E, col == v)` を `sets(UC, E.col == v)` に。4引数の `sets` を `drives` に分離。キーを選ぶ `.by` を `.role` に | 代入と比較命題の駆動を別の述語に分ける |

v0.4.0とv1.0.0のCHANGELOGには、旧来の読み方が誤っていた箇所で判定が変わったことも書かれています。たとえばv1.0.0では、`@check` がnullで通らなくなりました。構文の統一は、意味の曖昧さを消す作業と一体だったと読めます。

### 評価

1述語1形式は、読み手とツールの両方に効く判断です。エージェント向けのskillや移行スクリプトが前提にする形が1つに決まり、`fmt` の出力も1つになります。廃止形をロードエラーにし、エラー文に書き換え後の行を入れる方式は、黙って意味を変えるより安全です。

ただし「1形式」は述語ごとの話で、チェーンの語は述語をまたいで多義のまま残っています。`.by(...)` はキーの選択では `.role(...)` に置き換わりましたが、`belongs(Buc, Business).by(Medium)` では媒体を指す意味で残っています（`docs/language-reference.md`）。

互換性契約については、範囲の広さと時期が気になります。

まず時期です。2026-10-30から11-03までの間に3回の破壊的リリースを経て、その直後に構文と意味を凍結しています。凍結した中には、イベントが順序を課さないという過大近似（#30。2026-11-01に#51で決定）も含まれます。`docs/vision.md` は、これを後で変えるにはメジャーリリースが要ると明記しています。安定版を早く出す利点はありますが、変更の勢いが収まったことを確かめる期間はほとんどなかったと考えます。

次に、非推奨の段階はまだ一度も使われていません。タグ時点の `LEGACY_FORMS` の行はすべて `Status::Removed` で、`Status::Deprecated` の行はありません。`docs/compatibility.md` も、1.0.0より前には非推奨期間がなかったと書いています。v1.0の約束を支える「非推奨→移行→メジャーで削除」の経路は、仕組みとしては実装済みですが、実運用では未検証です。v1.1.0でもこの状況は変わらず、`LEGACY_FORMS` の10行はすべて `Status::Removed` です。

最後に範囲です。「同じ境界で同じ判定」を約束すると、判定を変えるバグ修正はすべてCHANGELOGで名指しする必要があります。Mermaidの符号化まで契約に含めたので、図の改善も互換性の制約を受けます。TLA+の不変条件名 `Forbidden_<E>_<n>` の `<n>` は、モデルに同種の規則を足すと動きます。契約はこれを「ツールではなくモデルの変更」と整理していますが、名前で `.cfg` を手書きする利用者にとっては不安定な名前です。一方で、crateのAPI、メッセージの文面、状態数、図のレイアウト、TLA+のモジュール構成は契約の外にあり、保守の自由度は残しています。安定した契約があるからこそ、サンプルの `// expect` ヘッダやエージェント向けのスキルが出力に頼れる、という利点もあります。それでも、契約の範囲は個人プロジェクトの保守体力に対してかなり広いと考えます。

一方、`next` のStage番号については、表示ラベルと安定IDを分けています。`stage` の値（`"2"`、`"7A"`）は並びの変更で番号が変わる表示用で、安定なのは `slug` です（`docs/compatibility.md`）。実際にv1.0.0では、ルールのStageが6A–6Cから7A–7Cに番号を変えています（`CHANGELOG.md`）。変わりやすい部分を契約から外す判断は適切だと考えます。

v1.1.0は、契約の下で出た最初のminorリリースです。CHANGELOGは、v1.0.0で読み込めるモデルはすべて同じ判定・error・状態数・規則名で読み込めると書いています。新しい形（`links` など）、warning、info、lintルールはすべて追加です。一方で、終了コードが1つ変わりました。`csv` と `list` の終了コードは、ライフサイクルのerrorがあるとき1から0になりました（#94）。CHANGELOGはこれをバグ修正として名指しし、`csv` や `list` の失敗に頼っていたスクリプトは `check` を使うよう書いています。名指しして移行先を示す手順は、契約の趣旨に沿っていると考えます。ただし、契約が終了コードを対象に含む以上、「バグ修正」の例外をどこまで広く読むかで、契約の実際の強さが決まります。今回の変更は原則（2026-10-28の判断）に実装を合わせるもので、例外として妥当だと考えます。

## 5. Stage 0–7を1つの仕様から生成し next で判定する

### 仕組み

[段階的モデリング](/projects/rdra-ish/incremental-modeling/) のStage表は、`crates/rdra-ish-core/src/refinement/stages.rs` の `StageSpec` から生成されます。1つのStageについて、問い、追加する要素、ユーザーに聞く質問、検証コマンド、ゲートの検査を1か所に持ちます。`docs/incremental-modeling.md` には `<!-- stage-spec: map -->` のような生成ブロックがあり、ドキュメントとskillの表がずれるとテストが落ちます（v0.4.0のCHANGELOG）。

ゲートの各条項には重みがあります（`crates/rdra-ish-core/src/refinement/mod.rs`）。

```rust
pub enum Weight {
    /// A failure is a `Gap`: the stage reads `Open`.
    Blocking,
    /// A failure is a note under the stage: a review prompt that never blocks, ...
    Advisory,
}
```

`next` と `lint` の `stage-readiness` は同じ判定を使います。条項をすべて満たしても、そのStageが関わる `check` のerrorがあれば「blocked」になります。必須はStage 0–6で、7A–7Cは任意です。

### 理由

`docs/vision.md` の「One stage order replaces three」は、README、`lint.rs` の `stage-readiness`、`incremental-modeling.md` がそれぞれ違う順序を書いていたと記録しています。1つの順序に統一するのが目標でした。

### 評価

生成元を1つにした効果は明確です。人間向けの文書、エージェント向けのskill、CLIの判定が同じ順序を話します。Advisoryの条項を設け、意図的に未完成のモデルを止めない点もよい設計です。データを持たないUCや単独のエンティティは、ブロッカーではなく問いとして出ます。

限界は、ゲートが測るのは要素の有無だという点です。`docs/incremental-modeling.md` も「A met gate means the elements exist」と書き、次に進むかはレビューで決めるとしています。`next` が「Stage 6」と言っても、そのライフサイクルが妥当とは限りません。これは文書化された限界です。

もう1つ、目標と実装の間に差があります。`docs/vision.md` の目標順序はRDRAの3フェーズに沿います。最初のフェーズで情報と状態モデルを扱い、条件とバリエーションは3番目です。タグ時点の生成済みStage表は、`entity` をStage 3、`Enum`・`transitions`・`condition` をStage 6に置いています。順序は1つになりましたが、vision.mdが描いた「RDRAのフェーズに沿った順序」にはなっていません。どちらが正しいかは使い方次第です。ただ、RDRAの手順に慣れた人には、状態モデルが後回しになる点が違和感になると考えます。

代替案は、Stageを線形にせず、要素ごとの充足度だけを示すことです。順序を押し付けない分、柔軟です。しかし `next` の価値は、次に聞くことを1つに絞る点です。線形の順序はその価値の前提なので、現状の選択は妥当だと考えます。

## 6. 生成物の種類ごとのfail-closed

### 仕組み

生成系サブコマンドは2段の門を通ります。

1. parse/resolveのerrorがあれば、どの出力も書きません（`crates/rdra-ish-cli/src/load.rs` の `reject_model_errors`）
2. ライフサイクルのerrorで止まるかは、出力の種類で決まります

v1.1.0では、2段目の判定は `crates/rdra-ish-cli/src/lifecycle_gate.rs` の1か所にあります。出力が読むものを列挙型で表し、`list`・`csv`・`diagram`・`export` の全kindを網羅的な `match` で分類します。

```rust
pub(crate) enum Reads {
    /// Declared facts and the data layer only.
    Declared,
    /// The transition system, printed for TLC to explore. ...
    System,
    /// The explored states, such as each state model's start states and reachable states.
    States,
    /// The explored states, drawing each deadlock instead of refusing on it.
    StatesDrawingDeadlocks,
}
```

`States` に分類されるのは `export --kind typescript-states` だけで、errorがあると止まります。`diagram --kind state` は `StatesDrawingDeadlocks` で、errorがデッドロックだけなら図を書き、デッドロックを図の中で示します。`list` と `csv` の全kind、ほかの図とexportは `Declared` です。error件数を示す `note:` を1行出して成果物を書き、終了コード0で終わります。

`export --kind tla` は `System` です。`check` の結果を再利用せず、同じ `TransitionSystem` を `verify` の境界で組み立て直し、その構築時のerror（`DerivedColumnRead` など）で止まります（`crates/rdra-ish-cli/src/export.rs` の `checked_system`）。探索で見つかるerror（制約違反、witnessの欠如、デッドロック）では止まりません。そのときは、TLC単体ではデッドロックとwitnessを検査しないので `verify` を使うよう促すnoteを出します。`verify` は制約違反をTLCの反例で、witnessの欠如とデッドロックを自身のBFSで報告し、非ゼロで終了します。

新しいkindは、分類を書くまでコンパイルできません（`lifecycle_gate.rs` の冒頭のコメント）。`crates/rdra-ish-cli/tests/export_gate.rs` は全kindを実行し、`docs/cli-reference.md` の「Lifecycle errors」の表とも突き合わせます。

### 理由

2026-10-28の判断（`docs/vision.md`）は、データ系の出力をライフサイクルの完成を待たせないと決めています。DBMLやJSON Schemaは到達性の結果を読まないので、モデルのerrorだけで止め、ライフサイクルのerrorにはnoteを出す、という理由です。この結果、ライフサイクルにerrorを持つ6つの検証サンプルでもDBMLとJSON Schemaが出るようになりました。v1.1.0のCHANGELOGは、この判定が3か所の手書きリストで決まり、文書ともずれていたことをバグとして直したと書いています（#94）。

### 評価

原則は明快です。「その出力が誤ったライフサイクルを印字するなら止める。読まないなら止めない」。誤った状態表やTypeScriptのunionが実装に流れ込むのを防ぎつつ、ライフサイクルを書きかけの段階でもデータ設計のレビューを進められます。段階的モデリングとよく噛み合う判断だと考えます。

v1.0.0では、実装がこの原則から機械的に導かれておらず、止めるかどうかはkindの手書きリストで決まっていました。そのリストと原則は次の4点でずれていました。どれもv1.1.0で直っています。

- `csv` は `entity` 以外を止めていました。CSVの出力器はライフサイクルを読まないので、止めすぎです（issue #94）。v1.1.0では全kindが `Declared` で、noteを出して書きます。
- `list` も、ライフサイクルを読まない `list --kind actor` まで止めていました（#94）。v1.1.0では全kindが `Declared` です。
- `docs/vision.md` は、状態図と並んでシーケンス図も止まる出力に挙げていましたが、コードではシーケンス図は止まりませんでした（#94）。v1.1.0の `docs/vision.md` には、その一覧が誤りだったこと、止まるのは `export --kind typescript-states` と状態図だけであることが追記されています。
- `export --kind tla` は、探索のerrorがあってもnoteを出さず、手でTLCを回す利用者がデッドロックやwitnessの欠如を見逃し得ました（#93）。v1.1.0ではnoteを出します。`samples/formal-verification/deadlock.rdra` に対して、`check` は終了コード1です。`export --kind tla` は仕様を書いて終了コード0になり、stderrに `` note: the lifecycle has 1 error(s) (see `rdra-ish check`); TLC alone does not check deadlocks or witnesses ... `` と出ます。

v1.0.0版のこのページは、出力器が遷移系や状態レポートを受け取るかどうかを型で表せば、ずれは構造的に起きなくなると書きました。v1.1.0の解決は、その形そのものではありません。分類は今も人が書く `match` で、出力器の入力の型から導かれてはいません。ただし、網羅的な `match` なので分類の書き忘れはコンパイルで止まり、文書との食い違いはテストで止まります。ずれの原因だった「散らばったリスト」と「文書との不一致」は、どちらも構造的に塞がれたと考えます。残るのは、ある出力が本当に宣言された事実しか読まないか、という分類そのものを人が誤る余地です。小さな残余だと考えます。

`export --kind tla` の見逃しは、noteによって小さくなりました。ただし、TLAの仕様がデッドロックとwitnessを検査するようになったわけではありません。noteを読み飛ばして手でTLCを回せば、見逃しは今も起き得ます。

`states` の扱いは別の選択です。`[error]` 行を含めて全体を出し、非ゼロで終わります。止めるより、誤りを含む表を見せたほうがレビューに役立つという判断で、診断用のコマンドとしては妥当だと考えます。

代替案は、すべての生成物を一律でfail-closedにすることです。単純で予測しやすい反面、ライフサイクルを書き始めた途端にデータ系の生成物まで止まります。逆にすべてをfail-openにすると、誤った状態unionが黙って出ます。種類ごとに分ける方向は正しく、v1.1.0で分け方の実装も原則に追いついたと考えます。

## 総合評価

rdra-ish v1.1.0は、要件モデル・論理データ・ライフサイクルを1つのテキストモデルにまとめ、その上の検証結果の意味を厳しく管理しようとするツールです。最も強い判断は、遷移系を1つにして、すべての出力とBFS・TLCの両方にそれを読ませたことだと考えます。結果の食い違いを構造的に消し、境界を毎回印字し、上限到達をerrorにする姿勢は一貫しています。自らの検証の穴を「Known verification gaps」として列挙している点も誠実です。v1.1.0では、v1.0.0版で挙げた弱点のうち、`check` の境界をフラグで固定できない点、fail-closedの判定のずれ、`export --kind tla` の無言の書き出し、`docs/vision.md` の古い記述が直りました（issue #93〜#96）。

一方で、最も弱いのは「OK」が保証する範囲の伝え方です。境界は印字されますが、境界の中でどの規則が空虚に成り立ったかは見えません。

### 大きな未解決のリスク

1. **`check` のOKの過信**：既定の `check` は1インスタンスで回ります。そこでは `Unique_*` のような規則が空虚に成り立ち、どのUCも書かない列への制約もwarningで通ります。日常のループで使うコマンドの「OK」が、最も弱い保証です。v1.1.0で `--instance-count 2` を渡せるようになりましたが、既定は1インスタンスのままで、OK行は規則ごとの空虚さを示しません。リスクは小さくなったものの残っていると考えます。
2. **検証の独立性の誤解**：TLCは同じ遷移系の別の探索器です。`.rdra` の解釈の誤りは、BFSとTLCの両方を素通りします。解釈の正しさは、サンプルの `// expect` ヘッダと人のレビューに頼っています。
3. **早い凍結と広い契約**：4日間で3回の破壊的リリースを出した直後に、構文・意味・図の符号化・TLA+の名前まで凍結しました。非推奨の経路はまだ一度も使われていません。イベント順序の過大近似のような意味上の選択も、次のメジャーまで変えられません。v1.1.0は契約の下で出た最初のminorリリースで、モデルの読み込みと判定は保たれました。一方で、`csv` と `list` の終了コードの変更をバグ修正としてminorで出しています。
4. **TLAを手で回す経路の見落とし**：v1.0.0では、`export --kind tla` は探索で見つかるerrorでも黙って書き出していました。v1.1.0で、error件数と `verify` を促すnoteを出すようになりました（#93）。TLCは今もデッドロックとwitnessの欠如を検出しないので、noteを読み飛ばして手でTLCを回す利用者は見逃し得ます。リスクは小さくなったと考えます。
5. **規模の天井が要件を削る**：大きなサンプルでは、coneの状態数が上限に近づき、ガードや関係を意図的に外しています。検証が回るかどうかが、要件の書き方を左右しています。

### 評価を変える条件

- `check` が規則ごとに「この境界では空虚」と報告するか、`UnwrittenConstrainedVar` がerrorになれば、リスク1の評価は大きく下がります。ただしwarningをerrorにするのは契約上の破壊的変更で、メジャーリリースが要ります。規則ごとの空虚の報告なら、新しいwarningとしてminorで足せます
- `.rdra` から遷移系への変換を、独立した参照実装や仕様ベースのテストで押さえる仕組みが入れば、リスク2の評価を改めます
- `export --kind tla` が探索で見つかるerrorにnoteを出すか、TLAの仕様がデッドロックとwitnessも検査するようになれば、リスク4は小さくなる、とv1.0.0版では書きました。前半はv1.1.0で満たされました。後半が満たされれば、リスク4は解消します
- 最初の非推奨サイクル（minorで非推奨、メジャーで削除）を契約どおりに通せば、互換性契約を実績のあるものとして評価します
- 部分順序簡約や対称性の利用などでconeの状態数が下がり、`patent-ops` や `insurance-claim-ops` が外したガードを戻せれば、リスク5は小さくなります（upstreamのissue #74がこの簡約を追っています）
- v1.1.0で、fail-closedの判定は網羅的な分類とテストで原則と文書に結び付き、判断6の弱点はほぼ解消したと考えます。分類が出力器の入力の型から導かれるようになれば、人が誤分類する余地もなくなります
