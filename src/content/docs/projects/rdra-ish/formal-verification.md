---
title: "形式検証"
description: "rdra-ish v3.0.0 の形式検証（ネイティブ検査器、TLCとの照合、z3による証明）"
sidebar:
  order: 4.5
---

このページは、エンティティのライフサイクルと規則を `check` / `verify` で検査する方法をまとめます。何を判定するか、結果の読み方、passが何を保証しないかを順に説明します。フラグの一覧は [CLI リファレンス](/projects/rdra-ish/cli-reference/)、完全な仕様はupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/formal-verification.md) にあります。

v3.0.0から、`verify` はすべての検査を自前の検査器で判定し、JVMとTLCは不要です。TLCとz3は外から照合する役割です。

## 検証のレイヤ

3つのエンジンが同じ遷移系を読みます。遷移系の定義はupstreamの [state-derivation.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/state-derivation.md) にあります。

| コマンド | 判定するもの | エンジン |
|---|---|---|
| `check`, `states` | 不変条件、`after` アサーション、witness、デッドロック、実行されないUC。既定は1インスタンス。`property` は評価せず、`verify` を使うよう `note:` を出す | ネイティブBFS |
| `verify` | すべての不変条件、`after` アサーション、`property` をそれぞれのconeで判定し、エンティティconeの状態モデルも判定。既定は2インスタンス | ネイティブBFS |
| `verify --with-tlc` | 同じcone・同じ実行をTLCでも回し、判定を照合 | ネイティブBFSとTLC |
| `verify --prove` | 状態規則を、行が何個あっても、どのInt値でも成り立つか証明（実験的） | z3（上記と並行） |
| `verify --symmetry always` | coneをインスタンス対称性で縮めて探索（実験的） | ネイティブBFS |
| `export --kind tla` | 何も判定しない。手でTLCを回すためのTLA+を書き出す | なし |

- **ネイティブ検査器** は幅優先探索（BFS）ですべてを判定します。安全性と時間性質を、BFSが探索したグラフの上で決めます。設計はupstreamの [native-temporal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/design/native-temporal-verification.md) にあります
- **TLC** は `--with-tlc` のときだけ動く第二の意見です。両エンジンが判定した検査で結果が食い違うと `error[EngineDisagreement]` を出し、実行は失敗します。これはモデルの所見ではなくツールのバグを示します
- **z3** は `--prove` のときだけ動きます。反例は探しません。反例を見つけるのは有界のエンジンです

BFSの高速化の詳細はブログ記事 [RDRA-ishの状態探索BFSを「安直なBFS」から速くする](/blog/2026/rdra-ish-bfs-speedups/) にあります。

v2.3.0以前の `--backend tlc` は `--with-tlc` の非推奨の別名として残り、警告を出します。次のメジャーリリースで削除されます。

### TLCとの照合

`--with-tlc` は、各cone・各性質の実行をBFSと並べてTLCにも回します。`stable` / `unchanged` / `precedes` のconeと、BFSが最後まで探索した100,000状態までのエンティティconeの状態モデルも照合します。`can_reach` にはTLCの実行がありません。

```text
error[EngineDisagreement]: <module> [<checks>]: native <verdict>, TLC <verdict>; one engine is wrong (a tool bug, not a finding about the model)
```

どちらか一方の `not decided` は不一致に数えません。TLCの出力はネイティブの行の後に `tlc:` 行として並び、`result:` の後に `tlc_result:` 行が続きます。TLCの入手方法はupstreamの [Getting TLC](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#getting-tlc) を参照してください。

速度の差はCHANGELOGのv3.0.0リリース判定に記録されています（release build、既定の範囲、壁時計時間とピークRSS）。

| サンプル | ネイティブ `verify` | TLC |
|---|---|---|
| patent-ops | 1.0 s / 187 MB | 33.3 s / 795 MB |
| food-permit-ops | 2.7 s / 681 MB | 24.0 s / 1.61 GB |
| insurance-claim-ops | 5.9 s / 867 MB | 127.0 s / 2.10 GB |

出典：[CHANGELOG.md v3.0.0](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/CHANGELOG.md)。

## 推奨ワークフロー

1. `transitions` / `sets` とエンティティ規則でライフサイクルを書く
2. `rdra-ish check` で素早く確認する（1インスタンス、安全性のみ）
3. `rdra-ish verify` で、すべての規則と性質を2インスタンスで検査する
4. `result:` が `not decided` なら、`not checked:` の行を読んで範囲やメモリを調整する。CIでは `--deny-undecided` を付ける
5. `--prove` を加え、状態規則を行数に依らず証明する。証明できない規則はCTIを読み、補題を足す
6. 第二の意見が欲しいときは `--with-tlc` を加える
7. TLA+を読みたいときは `rdra-ish export --kind tla -o /tmp/rdra-tla` で書き出す

エージェント向けには、同じ手順をたどるupstreamのskill [`skills/rdra-ish-verify/`](https://github.com/manji-0/rdra-ish-dsl/tree/v3.0.0/skills/rdra-ish-verify) があります。

## 範囲と上限

結果は常に範囲付きです。すべての結果がその範囲を印字します。

| 項目 | `check`, `states` | `verify`, `export --kind tla` |
|---|---|---|
| エンティティごとのインスタンス数 `--instance-count` | 1 | 2 |
| Int / Money / Decimal / Date / DateTime と `now` の範囲 `--int-range-max` | `0..5` | `0..5` |
| 状態数の上限 `--max-states` | なし | なし |
| メモリ上限 `--memory` | `4GiB` | `16GiB`（`--with-tlc` ではBFSがその半分） |

`--instances <Entity>=<n>` で1つのエンティティだけ数を変えられます。`rdra.toml` の `[verify]` にも `memory`、`instances` などを書けます。範囲外のIntリテラルはエラー `IntLiteralOutOfBounds` です。削除したスロットは再利用しません。

メモリ上限が数えるのはBFSの状態ストアと（`--with-tlc` のとき）TLCのヒープで、プロセス全体ではありません。上限で止まった実行が上限の1.85倍まで使った計測もあるので、`--memory` は空けられるメモリの半分程度に設定します。`RDRA_JOBS` は同時に回すconeの数とcone内のスレッド数を決めますが、出力は変わりません。

### 結果の読み方

`verify` はstdoutの先頭に範囲を、最後に結果を出します。

```text
$ rdra-ish verify samples/formal-verification/order.rdra
bounds: 2 instances per entity, Int 0..5 (TLA+ InstanceCount=2, IntRange=0..5); no state cap per BFS cone, memory 16GiB; entities a check does not read are unbounded
cones: 1 for 2 invariant(s) and 1 after-assert(s)
temporal properties: 2, each checked on its cone, and on the whole model only when the cone does not decide it (budget 300 s)
state models (BFS on 1 entity cone): 1 state model, 5 states witnessed, 0 deadlocks, 0 use cases that never run
Cone_Forbidden_Order_0 [Forbidden_Order_0, Inv_Order_0, AfterAssert_DeliverOrder_0]: ok (31 states)
Cone_PaidLeadsToShipped [PaidLeadsToShipped]: not decided (31 states, Cone_PaidLeadsToShipped_WF: ok, needs the whole model's WF_vars(Next))
Cone_EventuallyTerminal [EventuallyTerminal]: not decided (31 states, Cone_EventuallyTerminal_WF: ok, needs the whole model's WF_vars(Next))
RdraSpec_PaidLeadsToShipped [PaidLeadsToShipped]: ok (31 states)
RdraSpec_EventuallyTerminal [EventuallyTerminal]: ok (31 states)
result: ok
OK: no errors within 2 instances per entity, Int 0..5
```

| `result:` | 意味 | 終了コード |
|---|---|---|
| `ok` | すべての検査が成り立ち、未判定もない | 0 |
| `not decided` | 失敗はないが、上限・予算・`--deny-unproved` で判定できないものが残った | 0（`--deny-undecided` / `--deny-unproved` なら1） |
| `counterexample` | 検査・性質の違反、または状態モデルの所見（デッドロック、witnessのない状態、`can_reach` の違反） | 1 |
| `tool_error` | ネイティブの反例が自己検査に失敗した、エンジンが食い違った、またはTLCがモデル違反なしで失敗した | 1 |

判定できなかったものは `not checked:` 行に並び、stderrに `warning:` が出ます。`OK:` 行は判定できたものについてだけ成り立ちます。`--deny-undecided` を付けると未判定で終了コード1になります。ただし `--buc` / `--entity` で範囲を絞って残ったものは数えません。

## coneによる分割

`verify` はモデル全体を一度に探索しません。検査ごとに影響範囲（cone of influence）へ系を制限し、各coneをBFSで並列に判定します。coneは対象が読む変数と、それを書くアクションが読む変数を閉包したものです。

- **安全性のcone**：不変条件と `after` アサーションごとにconeがあります。同じ変数のconeは1回の実行（`Cone_<最初の検査>`）を共有します。coneの到達状態はモデル全体の到達状態の射影なので、全coneの `ok` はモデル全体の `ok` です
- **スロットを解放するcone**：coneのアクションが、coneの読まないエンティティを作る場合は、そのスロット数を数えず上位集合を探索します。`ok` はそのまま成り立ちます。一方、違反の再現には上限より多いインスタンスを要する場合があります
- **包含されるcone**：大きいconeが小さいconeの全要素を持つなら、小さい方は実行せず `ok (checked in Cone_<larger>)` と出します
- **性質のcone**：各 `property` は自分のconeで判定し、coneで決まらないときだけモデル全体で判定します
- **エンティティのcone**：エンティティごとのconeで状態モデルを判定します

反例は `check` と同じ形式で印字します。各ステップのUC、束縛したインスタンス、変化した値が並び、BFSの最短経路になります。ネイティブの反例は印字前に遷移関係で再生して検査し直します。再生できない反例はツールのバグ `error[LassoFault]` です。

### 独立した部分ライフサイクルによる簡約

coneには、対象が書かず一部しか読まない別のライフサイクルが入っていることがよくあります。insurance-claim-opsの請求のconeには、案件の示談が入っています。`verify` はこの部分ライフサイクルを単独で探索し、対象側から区別できない状態を1つのクラスにまとめてから探索します。

- 簡約したconeは元のconeと同じ判定を下します。反例は簡約前のconeの経路に戻してから印字するので、長くなったり部分ライフサイクル側のUCが出たりします
- `--max-states` は簡約後の状態を数えます
- TLA+の表が530,000セルを超える簡約は使いません
- `can_reach` のconeは簡約しません。`check` と `states` も簡約しません

論証はupstreamの [cone-soundness.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/design/cone-soundness.md) に、読み物としてはブログ記事 [RDRA-ishの形式検証(TLA+/TLC)を論文調で読み解く](/blog/2026/rdra-ish-formal-verification/#6-独立副ライフサイクルによる縮約) にあります。

### インスタンス対称性

`verify --symmetry always` は実験的な機能です（既定は `never`、`rdra.toml` の `[verify]` の `symmetry` でも指定可）。スロットの入れ替えだけが違う状態を1つの軌道としてまとめて保存します。メモリ上限を超えるconeを完走させるための手段です。

- 通常の実行で決まらないconeだけを対称性で回します。安全性のcone、`eventually` / `leads_to` のcone、簡約しない `always` のcone、メモリ上限で止まったエンティティconeが対象です
- 状態数は `about 31 states` のように軌道サイズの合計として出ます
- 判定は通常の実行と同じです。反例は具体的なスロットに戻して再生してから印字するので、`never` とは別のインスタンス名になることがあります

```text
Cone_PaidLeadsToShipped [PaidLeadsToShipped]: not decided (about 31 states, Cone_PaidLeadsToShipped_WF: ok, needs the whole model's WF_vars(Next))
```

詳細はupstreamの [Instance symmetry](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#instance-symmetry) と [instance-symmetry.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/design/instance-symmetry.md) にあります。

## verifyが検査するもの

| 種類 | 書き方 | 判定 |
|---|---|---|
| 状態規則 | `forbidden`, `invariant`, `required`, `exclusive`, `@check`, `.when(..).none/has(..)`, `@unique`, `relate` の多重度 | 安全性のcone |
| 遷移後の表明 | `after(UC).assert(...)` | 安全性のcone |
| 時間性質 | `property P always(..)` / `eventually(..)` / `leads_to(p, q)` | 性質のcone（`.fair` に従う） |
| 順序と安定性 | `stable(p)`, `unchanged(E.col, ..).when(p)`, `precedes(p, q)` | 性質のconeでBFS |
| 回復可能性 | `can_reach(goal)` | 性質のconeでBFS（TLCでは検査できない） |
| 状態モデル | `transitions` が駆動する列 | エンティティのcone |

```rdra
property PaidLeadsToShipped "paid eventually reaches shipped"
  leads_to(Order.status == paid, Order.status == shipped)

property EventuallyTerminal "order finishes"
  eventually((Order.status == delivered) or (Order.status == cancelled))

forbidden(Item, stock < selling)
after(DeliverOrder).assert(Order.status == delivered)
invariant(Cert).when(status == revoked).none(Assign.status == active)
```

構文の詳細は [言語リファレンス](/projects/rdra-ish/language-reference/) を参照してください。`check` と `states` は `property` を評価しません。

### 時間性質と公平性

`eventually` / `leads_to` を含むSpecには `WF_vars(Next)` が入ります。ただしこの弱公平性はconeに制限できません。coneの外のステップでも満たせるからです。そこで1つの性質は最大3段階で判定します。

1. `Cone_<P>`：`WF_vars(Next)` なしのcone。`ok` なら決まります。`always` はこれだけです
2. `Cone_<P>_WF`：同じconeに `WF_vars(Next)` を加えます。反例なら決まります。`ok` で決まるのは、書かれる変数をすべてconeが持つときだけです
3. `RdraSpec_<P>`：モデル全体で判定します。`--temporal-budget`（既定300秒）、メモリ上限、`--max-states` で止まり、反例が見つかる前に止まれば `not decided` です

`WF_vars(Next)` は別のインスタンスの無限ループでも満たされます。そのため、ある1件についての性質は他のインスタンスだけが動く実行で破れます。**性質が頼るUCは `.fair(UC, ...)` で書きます。** `.fair` はUCのアクションごと・インスタンスごとの弱公平性を加え、性質をconeの中で判定できるようにします。`verify` は `<P> assumes weak fairness per instance on ...` と前提を印字します。強公平性はありません。

`eventually` / `leads_to` の反例はlassoで、`then loops back to step K` か `then nothing changes forever` で終わります。

### 順序・安定性と回復可能性

`stable` / `unchanged` / `precedes` は安全性の性質です。BFSが各辺で読み、最初に破る辺までの最短トレースを出します。`precedes(p, q)` はインスタンスごとのラッチで「`q` の前に `p` があったか」を読みます。

`can_reach(goal)` はCTLの `AG EF` に当たり、TLA+では書けないのでTLCは検査しません。到達可能なすべての状態から、そのインスタンスが目標に届く経路が残っているかを判定します。違反すると、届かなくなった後にインスタンスが閉じ込められる状態を `confined:` として示します。`can_reach` のconeは厳密である必要があるので簡約せず、スロットも解放しません。

### 状態モデル：witnessとデッドロック

エンティティconeの探索では、`check` と同じ状態モデルの所見を出します。規則がすべて成り立っていても、エラーがあれば `verify` は失敗します。

| 所見 | 種類 | 意味 |
|---|---|---|
| `Witness_<E>_<col>_<s>` | error | 状態 `s` に至る経路（witness）がない |
| `Deadlock_<E>_<col>_<s>` | error | インスタンスが終端でない状態 `s` から永遠に動けない |
| `Deadlock_...`（at the bound） | warning | 抜け出すには作成先エンティティの空きスロットが要る |
| `Runs_<UC>` | warning | そのUCはどの到達状態でも実行できない |

デッドロックはインスタンスごとに判定します。別のUCが動き続けていても、止まったインスタンスは隠れません。抜け出す遷移があっても留まってよい状態は、列に `@end(v, ...)` を付けて終端状態として宣言します。

### TLC単体で状態モデルを検査する

TLCの組み込みのデッドロック検査は切ってあります（`CHECK_DEADLOCK FALSE`）。有界のライフサイクルは必ず有効なアクションのない状態で終わるうえ、TLCは他が動く間に1件だけ止まる状況を見られないからです。代わりに `export --kind tla` は、状態モデルを持つエンティティconeごとに次のファイルを書きます。

| ファイル | 検査するもの |
|---|---|
| `StateModel_<E>.tla` | `verify` と同じように簡約したcone。`Witness_` と `Deadlock_` の不変条件を持つ |
| `StateModel_<E>.cfg` | `TypeOK` と `Deadlock_` 不変条件 |
| `StateModel_<E>_witnesses.cfg` | `TypeOK` と `Witness_` 不変条件 |

`Witness_<E>_<col>_<s>` は「どのインスタンスも `s` にいない」という不変条件です。健全なモデルではすべて違反になり、TLCが報告しない `Witness_` がwitnessのない状態です。TLC側のデッドロックのpassは証明になりません。列のconeが永遠に動き続けると、止まったインスタンスが隠れるからです。デッドロックを判定するのは `check` と `verify` です。

## --proveによる証明

`verify --prove` は実験的な機能です。BFSとTLCは固定のインスタンス数と上限付きのInt範囲で検査するので、2インスタンスで成り立つ規則も3インスタンスで破れることがあります。`--prove` はz3を使い、各状態規則が **任意の行数** と **任意の非負Int値** で成り立つかを調べます。`now` にも上限はありません。

- 各エンティティの行を未解釈ソート、各列を関数、各UCをステップ関係として符号化します
- 規則が **帰納的** な集合に属せば証明済みです。初期状態で成り立ち、すべてが成り立つ状態からどのステップでも破れない集合です
- 真でも単独では帰納的でない規則が多いので、候補の補題を加えて、帰納的な最大の集合を残します（Houdini）。補題はBFSの探索結果などから採掘しますが、同じ検査を通るまでは推測として扱います
- 証明できない規則には、帰納法の反例（CTI）を出します。CTIの前の状態は到達可能とは限りません
- 足りない事実は、規則に `.lemma()` を付けて補題として書けます。`check` がその補題を通常の規則として検査します
- z3の各検査は時間ではなく資源単位（`rlimit`）で打ち切るので、マシンの負荷で結果が変わりません

```text
$ rdra-ish verify samples/formal-verification/order.rdra --prove
...
proof (Z3 version 5.1.0 - 64 bit): 2 state rules, for any number of rows and any Int value
proved: Forbidden_Order_0
proved: Inv_Order_0
...
proof: 2 proved, 0 unproved, 0 out of scope
...
OK: no errors within 2 instances per entity, Int 0..5; 2 of 2 rules proved for any number of rows and any Int value
```

`--prove` が読むのは状態規則だけで、`after` アサーションや時間性質は対象外です。BFSがメモリ上限で止めた不変条件のconeは、z3がそのconeの規則をすべて証明すれば `ok` として判定済みになります。それ以外では、証明結果が終了コードを変えるのは `--deny-unproved` のときだけです。z3の入手はupstreamの [Getting z3](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#getting-z3) を参照してください。

証明の仕組みを、ブログ記事 [RDRA-ishはz3の帰納的証明をどう安全に自動生成しているか](/blog/2026/rdra-ish-z3-induction/) で詳しく解説しています。

## export --kind tlaの役割

v3.0.0では、`export --kind tla` は検査の前提ではありません。TLA+を読みたいとき、または手でTLCを回したいときに使います。

```bash
rdra-ish export <INPUTS...> --kind tla [-o <OUT>] [--instance-count N] [--instances E=N] [--int-range-max N]
```

- `-o` が `.tla` で終わればそのモジュールと隣の `.cfg` を、それ以外はディレクトリに `RdraSpec.tla` / `RdraSpec.cfg` を書きます。隣に `StateModel_<E>` specも書きます
- `RdraSpec.cfg` は規則ごとに `INVARIANT`、`after` アサーションと時間性質ごとに `PROPERTY` を持ち、`CHECK_DEADLOCK FALSE` を設定します
- `check` がライフサイクルのエラーを見つけるモデルでも、specを書いて終了コード0で終わり、エラー件数のnoteを出します
- `export` は前回の `StateModel_` ファイルを消しません。空のディレクトリに書き出します
- `verify -o <dir>` はcone・実行ごとのモジュールと、各モジュールが答える検査を並べた `cones.txt` を書きます。ネイティブ検査器はこれらのファイルを読みません

## サンプル

正本は [`skills/rdra-ish-verify/samples/`](https://github.com/manji-0/rdra-ish-dsl/tree/v3.0.0/skills/rdra-ish-verify/samples) にあり、`samples/formal-verification/` からリンクされています。各ファイルは単体で扱います。ディレクトリをまとめて `check` するとIDが衝突します。`unique_double_booking.rdra`、`unique_booking_guarded.rdra`、`counting_rules.rdra` は `samples/formal-verification/` にだけあります。

`check` / `verify` の列は、各ファイルの `// expect` ヘッダが定める終了ステータスです（ヘッダのないファイルは両方pass）。`--prove` の列は証明できる状態規則の数です。

| サンプル | `check` | `verify` | `--prove` | 焦点 |
|---|---|---|---|---|
| `order.rdra` | pass | pass | 2 of 2 | 不変条件、`after` アサーション、`WF_vars(Next)` 下の `leads_to` と `eventually` |
| `int_stock.rdra` | pass | pass | 1 of 1 | Int列、算術の `forbidden`、Intの時間性質 |
| `now_coupon.rdra` | fail | fail | 0 of 1 | `now` と `Tick`：`expired_at < now` の禁止状態に届く |
| `cross_order_payment.rdra` | pass | pass | 1 of 1 | 複数インスタンスと `.along`。Payは1つの原子的ステップなのでCancelが割り込めない |
| `cross_order_payment_split.rdra` | fail | fail | 0 of 1 | Payを2つのAPIに分けた版。`Pay_1` と `Pay_2` の間にCancelが割り込む |
| `split_run_order.rdra` | pass | pass | 2 of 2 | 2つのAPIにまたがるUCが `invokes` 順の1つの実行として動き、`.fair` で完了する |
| `quantifier_none.rdra` | fail | fail | 0 of 1 | `invariant(...).when(...).none(...)`：Assignが有効なままRevokeする |
| `quantifier_guard.rdra` | pass | pass | 1 of 1 | Revokeに `holds(..).none(..)` のガードを付けて成り立たせる |
| `untriggered_sets.rdra` | fail | fail | 0 of 1 | 遷移を駆動しないUCの `sets` が禁止状態に届く |
| `event_order.rdra` | pass | pass | 状態規則なし | `triggers` によりIssueCertはイベント発生後にだけ動く |
| `after_assert_unmet.rdra` | fail | fail | 状態規則なし | 成り立たせる `sets` のない `after(DeliverOrder).assert` |
| `temporal_fair.rdra` | pass | fail | 状態規則なし | 公平性なしの `leads_to` は破れ、`.fair(Register, Dismiss)` なら成り立つ |
| `order_stability.rdra` | pass | fail | 状態規則なし | `stable`、`unchanged(..).when(..)`、`precedes` の成立例と違反例 |
| `temporal_along.rdra` | pass | fail | 状態規則なし | PaymentとOrderにまたがる `always` が `.along` 付きで成り立ち、なしで破れる |
| `temporal_unmet.rdra` | pass | fail | 状態規則なし | 破れる `always` と `leads_to`。後者はlassoを出す |
| `one_to_one_shared.rdra` | pass | fail | 0 of 1 | `relate(.., 1:1)` の `Unique_Shipment_Order` は2インスタンスで初めて破れる |
| `unique_double_booking.rdra` | pass | fail | 0 of 1 | 2件の予約が同じ部屋の午前を取り `@unique(room_id, slot)` が破れる |
| `unique_booking_guarded.rdra` | pass | pass | 1 of 1 | `.none(Booking.slot == am)` のガードで枠を守る |
| `counting_rules.rdra` | pass | pass | 2 of 2 | `relate(Loan, Member, 0..3:1)` と `.at_most(3, ..)`。既定の範囲では空虚で、警告が `--instances Loan=4` を示す |
| `none_any_child.rdra` | pass | pass | 1 of 1 | `.none(Invoice)` はリンクだけを読み、coneは `Invoice.status` を含まない |
| `none_any_child_bypassed.rdra` | pass | fail | 0 of 1 | 同じモデルでガードのないReissueを持つ |
| `min_card_unmet.rdra` | fail | fail | 0 of 1 | `relate(OrderLine, Order, 1..*:1)`。Placeが明細のないOrderを作る |
| `min_card_met.rdra` | pass | pass | 1 of 1 | PlaceがOrderと最初の明細を1つのトランザクションで作る |
| `check_unmet.rdra` | fail | fail | 0 of 1 | `@check(qty >= 1)`。ClearQtyが `qty` を0にする |
| `check_met.rdra` | pass | pass | 2 of 2 | 同じcheckを範囲内に保つ。`forbidden` がBoolの `@derived` 列を読む |
| `unwitnessed_state.rdra` | fail | fail | 1 of 1 | `refunded` にwitnessがなく `shipped` がデッドロック。規則のconeはpass |
| `deadlock.rdra` | fail | fail | 状態規則なし | Shipのガードが `pending` の間だけ成り立ち、Orderが `paid` から抜けられない |
| `can_reach_unmet.rdra` | pass | fail | 状態規則なし | `can_reach` が破れる。Orderが `pending` と `on_hold` を永遠に行き来できる |
| `can_reach_met.rdra` | pass | pass | 状態規則なし | 同じモデルにRestockを加え、どの状態からも完了できる |
| `partial_scope.rdra` | fail | fail | 実行されない | ビルドエラー `DerivedColumnRead` が両コマンドを止める。`--entity Order` なら後回しにしてpass |
| `fail/order.rdra` | fail | fail | 0 of 1 | 到達可能な不変条件違反 |

`--with-tlc` では、TLCは実行するすべての検査でネイティブと同じ判定を出します。

## 既知の検証ギャップ

passした `check` / `verify` は、探索しなかった部分について何も言いません。

| ギャップ | 見える場所 | 対処 |
|---|---|---|
| **範囲**：結果はインスタンス数とInt範囲の中でだけ成り立つ。`check` は1インスタンスなので、`Unique_*` のように2行で破れる規則は空虚に成り立つ | `bounds:` 行と `OK:` 行 | `--instance-count`、`--instances`、`--int-range-max` を上げる。`--prove` で証明する |
| **イベントの順序**：トリガされたUCは行ごとの発生の後にだけ動くが、記録はラッチで回数を数えない。発生元をすべて持たないconeではハンドラが順序なしに動く | `triggers` 行のinfo、トレースの `note:` 行 | 発生元が設定する状態から始める、規則に発生元の書く値を読ませる、`.counted(k)` を使う |
| **coneがメモリ上限や `--max-states` で止まる**：止まったconeは所見を判定しない | `not checked:` とstderrの `warning:`。`check` では `MemoryCapReached_<E>` / `StateCapReached_<E>` | `--memory` を上げる、別エンティティを読むガードを移してconeを狭める、`--symmetry always` を試す |
| **coneで決まらない性質**：モデル全体を予算付きで回す | 性質の行と `not checked:` の `not decided` | `.fair(...)` を付ける、`--temporal-budget` を上げる |
| **範囲を絞った実行**：`--buc` / `--entity` は性質を検査せず、`--buc` は状態モデルの所見を未判定にする | `temporal properties: 2, not checked: a scoped run checks none` | 絞らずに `verify` を回す。`--entity` のconeは厳密 |
| **TLCとの比較が1インスタンスだけのcone**：upstreamのテストは、簡約後で300,000状態を超えるcone（24個）を1インスタンスでだけTLCと比べる | テストの `VERIFY_FALLBACK` 一覧 | そのconeは `verify --with-tlc` で第二の意見を取る |

ほかに、モデル自体の近似があります。`.on_delete` は拒否としてだけ働き、`cascade` などは実行しません。UCはトランザクショングループごとに原子的です。`now` は自由に進みます。公平性は弱公平性だけです。サンプル固有のギャップは、upstreamの各サンプルのREADMEにあります（[patent-ops](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/samples/patent-ops/README.md#known-verification-gaps)、[food-permit-ops](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/samples/food-permit-ops/README.md#known-verification-gaps)、[insurance-claim-ops](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/samples/insurance-claim-ops/README.md#known-verification-gaps)）。

v3.0.0の既知の問題として、coneで決まらない時間性質（patent-opsの `GrantEnds` など）は、モデル全体が大きすぎると `not decided` のままです。

## 次に読む

- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
- upstream: [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/formal-verification.md)、[engine-agreement.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/engine-agreement.md)
- ブログ： [形式検証の論文調の解説](/blog/2026/rdra-ish-formal-verification/)、[BFSの高速化](/blog/2026/rdra-ish-bfs-speedups/)、[z3による帰納的証明](/blog/2026/rdra-ish-z3-induction/)
