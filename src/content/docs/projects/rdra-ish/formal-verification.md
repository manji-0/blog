---
title: "形式検証"
description: "rdra-ish main 169cdf3 の形式検証（ネイティブ検査器、z3による証明、TLCとの照合）"
sidebar:
  order: 4.5
---

このページは、エンティティのライフサイクルと規則を `check` / `verify` で検査する方法をまとめます。何を判定するか、結果の読み方、passが何を保証しないかを順に説明します。フラグの一覧は [CLI リファレンス](/projects/rdra-ish/cli-reference/)、完全な仕様はupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/formal-verification.md) にあります。

対象：main `169cdf3`（v3.0.0以降の未リリース版）。`verify` はすべての検査を自前の検査器で判定し、JVMとTLCは不要です。z3が見つかれば、状態規則を行数に依らず証明する処理も既定で走ります。TLCは外から照合する役割です。

## 検証のレイヤ

3つのエンジンが同じ遷移系を読みます。遷移系の定義はupstreamの [state-derivation.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/state-derivation.md) にあります。

| コマンド | 判定するもの | エンジン |
|---|---|---|
| `check`, `states` | 不変条件、`after` アサーション、witness、デッドロック、実行されないUC。既定は1インスタンス。`property` は評価せず、`verify` を使うよう `note:` を出す | ネイティブBFS |
| `verify` | すべての不変条件、`after` アサーション、`property` をそれぞれのconeで判定し、エンティティconeの状態モデルも判定。既定は2インスタンス。さらに各状態規則を、行が何個あっても、モデルが組めるどのInt範囲でも成り立つか証明する | ネイティブBFS、証明はz3 |
| `verify --no-prove` | 上と同じで、証明だけしない | ネイティブBFS |
| `verify --with-tlc` | `verify` と同じ。同じcone・同じ実行をTLCでも回し、判定を照合 | ネイティブBFS、z3、TLC |
| `verify --symmetry always` | coneをインスタンス対称性で縮めて探索（実験的） | ネイティブBFS |
| `export --kind tla` | 何も判定しない。手でTLCを回すためのTLA+を書き出す | なし |

- **ネイティブ検査器** は幅優先探索（BFS）ですべてを判定します。安全性と時間性質を、BFSが探索したグラフの上で決めます。設計はupstreamの [native-temporal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/native-temporal-verification.md) にあります
- **TLC** は `--with-tlc` のときだけ動く第二の意見です。両エンジンが判定した検査で結果が食い違うと `error[EngineDisagreement]` を出し、実行は失敗します。これはモデルの所見ではなくツールのバグを示します
- **z3** は `--no-prove` を付けない限り `verify` で動きます。z3が見つからなければ `note:` を出して証明を飛ばします。z3は反例を探しません。反例を見つけるのは有界のエンジンです

BFSの高速化の詳細はブログ記事 [RDRA-ishの状態探索BFSを「安直なBFS」から速くする](/blog/2026/rdra-ish-bfs-speedups/) にあります。

v2.3.0以前の `--backend tlc` は `--with-tlc` の非推奨の別名として残り、警告を出します。次のメジャーリリースで削除されます。

### TLCとの照合

`--with-tlc` は、各cone・各性質の実行をBFSと並べてTLCにも回します。`stable` / `unchanged` / `precedes` のconeと、BFSが最後まで探索した100,000状態までのエンティティconeの状態モデルも照合します。縮約しないエンティティconeでは、TLCが数えた異なる状態の数もBFSと一致しなければなりません。`can_reach` にはTLCの実行がありません。

```text
error[EngineDisagreement]: <module> [<checks>]: native <verdict>, TLC <verdict>; one engine is wrong (a tool bug, not a finding about the model)
```

どちらか一方の `not decided` は不一致に数えません。TLCの出力はネイティブの行の後に `tlc:` 行として並び、`result:` の後に `tlc_result:` 行が続きます。各 `tlc:` 行の末尾には、TLCの起動にかかった時間・ヒープ・ワーカー数が `(31 states, 0.3 s, -Xmx1g, 8 workers)` のように付きます。TLCの入手方法はupstreamの [Getting TLC](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#getting-tlc) を参照してください。

TLCの実行は、メモリだけでなくコア数でも割り振ります。1つの実行には、そのモジュールでBFSが数えた50,000状態ごとに1ワーカー（1から8）を与え、大きい実行から始めます。`--tlc-jobs` と `--tlc-workers` で同時実行数とワーカー数を指定できます。破れた安全性のconeは1ワーカーで回し直すので、トレースは最短です。`verify` はTLCのトレースを同じ遷移関係で再生し、`counterexample (N steps, from TLC)` としてモデルの言葉で印字します。両エンジンをどう突き合わせているかは [TLCとの一致](/projects/rdra-ish/theory/tlc-agreement/) で解説しています。

速度の差はCHANGELOGのv3.0.0のリリース判定に記録されています（release build、既定の範囲、壁時計時間とピークRSS）。

| サンプル | ネイティブ `verify` | TLC |
|---|---|---|
| patent-ops | 1.0 s / 187 MB | 33.3 s / 795 MB |
| food-permit-ops | 2.7 s / 681 MB | 24.0 s / 1.61 GB |
| insurance-claim-ops | 5.9 s / 867 MB | 127.0 s / 2.10 GB |

出典：[CHANGELOG.md v3.0.0](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/CHANGELOG.md#v300---2026-11-26)。この表は証明を回さない時点の数値です。CHANGELOGのUnreleasedによると、mainでは証明が既定で走るため、`scripts/verify-samples.sh` の43回の実行の合計は約40秒から85秒に増えます（証明書キャッシュが空のとき。温まっていれば59秒、`RDRA_JOBS=1`）。overflow検査付きのビルドになったことで、`verify` はサンプルで約10%遅くなっています。

## 推奨ワークフロー

1. `transitions` / `sets` とエンティティ規則でライフサイクルを書く
2. `rdra-ish check` で素早く確認する（1インスタンス、安全性のみ）
3. `rdra-ish verify` で、すべての規則と性質を2インスタンスで検査し、状態規則を行数に依らず証明する。証明にはz3が要る（`nix develop` で `PATH` に入る）
4. `result:` が `not decided` なら、`not checked:` の行を読んで範囲やメモリを調整する。CIでは `--deny-undecided` を付ける
5. 証明できない規則はCTIと `lemma:` 行を読み、足りない事実を補題として書く。CIで証明を必須にするなら `--prove` か `--deny-unproved` を付ける
6. 第二の意見が欲しいときは `--with-tlc` を加える
7. TLA+を読みたいときは `rdra-ish export --kind tla -o /tmp/rdra-tla` で書き出す

エージェント向けには、同じ手順をたどるupstreamのskill [`skills/rdra-ish-verify/`](https://github.com/manji-0/rdra-ish-dsl/tree/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/skills/rdra-ish-verify) があります。

## 範囲と上限

結果は常に範囲付きです。すべての結果がその範囲を印字します。

| 項目 | `check`, `states` | `verify`, `export --kind tla` |
|---|---|---|
| エンティティごとのインスタンス数 `--instance-count` | 1 | 2 |
| Int / Money / Decimal / Date / DateTime と `now` の範囲 `--int-range-max` | `0..5` | `0..5` |
| 状態数の上限 `--max-states` | なし | なし |
| メモリ上限 `--memory` | `4GiB` | `16GiB`（`--with-tlc` ではBFSがその半分） |

`--instances <Entity>=<n>` で1つのエンティティだけ数を変えられます。`rdra.toml` の `[verify]` にも `memory`、`instances` などを書けます。範囲外のIntリテラルはエラー `IntLiteralOutOfBounds` です。削除したスロットは再利用しません。

メモリ上限が数えるのはBFSの状態ストアと（`--with-tlc` のとき）TLCのヒープで、プロセス全体ではありません。探索を終えたconeに対する後処理（liveness、`can_reach`、デッドロック、縮約の分割）、伸びる実行の予備バッファ、z3は数えません。上限で止まった実行が上限の1.85倍まで使った計測もあるので、coneが上限で止まるときは `--memory` を空けられるメモリの半分程度に設定します。`--no-prove` でない限り、z3のプロセス（`RDRA_JOBS` 個）がそれぞれ別にメモリを使います。サンプルでは1プロセスあたり29〜63 MBです（z3 5.1.0、`RDRA_JOBS=1`）。

上限で止まったエンティティconeは、所見を読んだ直後に保持していたメモリを返すので、後のconeが動けます。`RDRA_JOBS` は同時に回すconeの数（既定はコア数、最大8）とcone内のスレッド数（既定はコア数の3分の1、4以上12以下）を決めますが、出力は変わりません。

### 結果の読み方

`verify` はstdoutの先頭に範囲を、最後に結果を出します。証明の行は安全性のconeの行より前に並びます。

```text
$ rdra-ish verify samples/formal-verification/order.rdra
bounds: 2 instances per entity, Int 0..5 (TLA+ InstanceCount=2, IntRange=0..5); no state cap per BFS cone, memory 16GiB; entities a check does not read are unbounded
cones: 1 for 2 invariant(s) and 1 after-assert(s)
temporal properties: 2, each checked on its cone, and on the whole model only when the cone does not decide it (budget 300 s)
state models (BFS on 1 entity cone): 1 state model, 5 states witnessed, 0 deadlocks, 0 use cases that never run
proof (Z3 version 5.1.0 - 64 bit): 2 state rules, for any number of rows, in the whole model
proved: Forbidden_Order_0 (for any number of rows, in the whole model)
proved: Inv_Order_0 (for any number of rows, in the whole model)
lemma: an absent Order row holds base values (for any number of rows, in the whole model)
lemma: no Order row is ever deleted (for any number of rows, in the whole model)
lemma: every present Order row is one of 5 reached patterns of (status, delivered_at) (for any number of rows, in the whole model)
lemma: a present Order row's (status, delivered_at) is one of {(pending, null), (paid, null), (shipped, null), (delivered, present), (cancelled, null)} (for any number of rows, in the whole model)
proof: 2 proved, 0 unproved, 0 out of scope
Cone_Forbidden_Order_0 [Forbidden_Order_0, Inv_Order_0, AfterAssert_DeliverOrder_0]: ok (31 states)
Cone_PaidLeadsToShipped [PaidLeadsToShipped]: not decided (31 states, Cone_PaidLeadsToShipped_WF: ok, needs the whole model's WF_vars(Next))
Cone_EventuallyTerminal [EventuallyTerminal]: not decided (31 states, Cone_EventuallyTerminal_WF: ok, needs the whole model's WF_vars(Next))
RdraSpec_PaidLeadsToShipped [PaidLeadsToShipped]: ok (31 states)
RdraSpec_EventuallyTerminal [EventuallyTerminal]: ok (31 states)
result: ok
OK: no errors within 2 instances per entity, Int 0..5; 2 of 2 rules proved for any number of rows, in the whole model
```

| `result:` | 意味 | 終了コード |
|---|---|---|
| `ok` | すべての検査が成り立ち、未判定もない | 0 |
| `not decided` | 失敗はないが、上限・予算・`--deny-unproved` で判定できないものが残った | 0（`--deny-undecided` / `--deny-unproved` なら1） |
| `counterexample` | 検査・性質の違反、または状態モデルの所見（デッドロック、witnessのない状態、`can_reach` の違反） | 1 |
| `tool_error` | 印字する前のトレースが再生に失敗した、エンジンが食い違った、またはTLCがモデル違反なしで失敗した | 1 |

判定できなかったものは `not checked:` 行に並び、stderrに `warning:` が出ます。`OK:` 行は判定できたものについてだけ成り立ちます。`--deny-undecided` を付けると未判定で終了コード1になります。ただし `--buc` / `--entity` で範囲を絞って残ったものは数えません。

ツールがpanicで止まったとき（整数のoverflowや内部検査の失敗）は、stderrの先頭に `tool error: rdra-ish <version> panicked at <file:line:col> ...` と出ます。終了コードは101です。モデルの所見ではないので、コマンドとモデルを添えてupstreamに報告します。

## coneによる分割

`verify` はモデル全体を一度に探索しません。検査ごとに影響範囲（cone of influence）へ系を制限し、各coneをBFSで並列に判定します。coneは対象が読む変数と、それを書くアクションが読む変数を閉包したものです。cone上の判定がモデル全体の判定と一致する理由は [coneの理論](/projects/rdra-ish/theory/cones/) で解説しています。

- **安全性のcone**：不変条件と `after` アサーションごとにconeがあります。同じ変数のconeは1回の実行（`Cone_<最初の検査>`）を共有します。coneの到達状態はモデル全体の到達状態の射影なので、全coneの `ok` はモデル全体の `ok` です
- **スロットを解放するcone**：coneのアクションが、coneの読まないエンティティを作る場合は、そのスロット数を数えず上位集合を探索します。`ok` はそのまま成り立ちます。一方、違反の再現には上限より多いインスタンスを要する場合があります
- **イベントの記録を含まないcone**：ハンドラは持つが発生元をすべては持たないconeでは、ハンドラがイベントなしで動きます。`ok` はそのまま成り立ちます。イベントなしでハンドラを動かす反例は候補にすぎず、coneに発生元を加えて回し直します。反例がイベントなしのUCを含まなくなるか、検査の厳密なconeに達するまで繰り返します。結果は `note: <check>: the cone's counterexample is a candidate only, ...; on the cone refined with the event's raisers: ok` のように出ます
- **包含されるcone**：大きいconeが小さいconeの全要素を持つなら、小さい方は実行せず `ok (checked in Cone_<larger>)` と出します。大きいconeが失敗したときは小さい方も回すので、トレースは最小のconeから出ます
- **性質のcone**：各 `property` は自分のconeで判定し、coneで決まらないときだけモデル全体で判定します
- **エンティティのcone**：エンティティごとのconeで状態モデルを判定します。このconeは、UCが待つイベントの発生元をすべて含みます

反例は `check` と同じ形式で印字します。各ステップのUC、束縛したインスタンス、変化した値が並び、BFSの最短経路になります。印字するトレースはすべて、初期状態から実行自身の遷移関係で再生して検査し直します。対象は状態規則・`after` アサーション・各種の性質・`can_reach` の違反・デッドロック・`states` のwitnessで、縮約や対称性を使った実行も含みます。再生できないトレースはツールのバグで、トレースなしで次のエラーになります。

| エラー | 対象 |
|---|---|
| `error[LiftFault_<check>]` | 状態規則、`after` アサーション |
| `error[LassoFault]` | 性質 |
| `error[TraceFault_<finding>]` | デッドロック、`can_reach` の違反、witness |

どのエンジンも動かす前に、2つの検査もします。組み立てたアクションが証明の受け付けるスロットの構文から外れると、`tool error: the built step of …` で実行を止めます。coneが自身の検査（閉じていること、検査の読むものを含むこと、必要な所で厳密であること）に落ちたときは、警告を出してモデル全体で判定します。

### 独立した部分ライフサイクルによる縮約

coneには、対象が書かず一部しか読まない別のライフサイクルが入っていることがよくあります。insurance-claim-opsの請求のconeには、案件の示談が入っています。`verify` はこの部分ライフサイクルを単独で探索し、対象側から区別できない状態を1つのクラスにまとめてから探索します。部分ライフサイクルは、イベントの記録や前にしか進まない状態のように、上がるだけの対象側の変数を読んでもかまいません。

- 縮約したconeは元のconeと同じ判定を下します。反例は縮約前のconeの経路に戻してから印字するので、長くなったり部分ライフサイクル側のUCが出たりします
- 縮約は毎回、クラス分けが正しいことを証明書として確かめます。確かめに失敗した分割はツールのバグで、警告を出して別の手順で求めた分割を使います
- `--max-states` は縮約後の状態を数えます
- 部分ライフサイクルを `obs` の外で読む検査や、部分ライフサイクル側のアクションに付いた `after` アサーションは、別のconeで回します
- TLA+の表が530,000セルを超える縮約は使いません
- `can_reach` のconeは縮約しません。`check` と `states` も縮約しません

論証はupstreamの [cone-soundness.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/cone-soundness.md#the-reduction-by-an-independent-sub-lifecycle) と [coneの理論](/projects/rdra-ish/theory/cones/) に、読み物としてはブログ記事 [RDRA-ishの形式検証(TLA+/TLC)を論文調で読み解く](/blog/2026/rdra-ish-formal-verification/#6-独立副ライフサイクルによる縮約) にあります。

### インスタンス対称性

`verify --symmetry always` は実験的な機能です（既定は `never`、`rdra.toml` の `[verify]` の `symmetry` でも指定可）。スロットの入れ替えだけが違う状態を1つの軌道としてまとめて保存します。メモリ上限を超えるconeを完走させるための手段です。

- 通常の実行で決まらないconeだけを対称性で回します。安全性のcone、`eventually` / `leads_to` のcone、縮約しない `always` のcone、メモリ上限で止まったエンティティconeが対象です
- エンティティconeは、通常の実行が所見を残したまま止まったときだけ、返されたメモリの中で回し直します。完走すればその結果で所見を決め、また止まれば通常の実行の所見が残ります
- 状態数は `about 31 states` のように軌道サイズの合計として出ます
- 判定は通常の実行と同じです。反例やデッドロックのトレースは具体的なスロットに戻して再生してから印字するので、`never` とは別のインスタンス名になることがあります

```text
Cone_PaidLeadsToShipped [PaidLeadsToShipped]: not decided (about 31 states, Cone_PaidLeadsToShipped_WF: ok, needs the whole model's WF_vars(Next))
```

詳細はupstreamの [Instance symmetry](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#instance-symmetry) と [instance-symmetry.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/instance-symmetry.md) にあります。

## verifyが検査するもの

| 種類 | 書き方 | 判定 |
|---|---|---|
| 状態規則 | `forbidden`, `invariant`, `required`, `exclusive`, `@check`, `.when(..).none/has(..)`, `@unique`, `relate` の多重度 | 安全性のconeとz3の証明 |
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
2. `Cone_<P>_WF`：1段目で反例が出たら、同じconeに `WF_vars(Next)` を加えます。反例なら決まります。`ok` で決まるのは、書かれる変数をすべてconeが持つときだけです
3. `RdraSpec_<P>`：モデル全体で判定します。`--temporal-budget`（既定300秒）、メモリ上限、`--max-states` で止まり、反例が見つかる前に止まれば `not decided` です

`WF_vars(Next)` は別のインスタンスの無限ループでも満たされます。そのため、ある1件についての性質は他のインスタンスだけが動く実行で破れます。**性質が頼るUCは `.fair(UC, ...)` で書きます。** `.fair` はUCのアクションごと・インスタンスごとの弱公平性を加え、性質をconeの中で判定できるようにします。`verify` は `<P> assumes weak fairness per instance on ...` と前提を印字します。強公平性はありません。

`eventually` / `leads_to` の目標は、既定では削除された行の基本値でも満たされます。`@default` が目標を満たす行は、削除されるだけで目標に届きます。目標でも行の存在を求めるときは `.present()` を付けます。`leads_to(p, q).present()` は `(present /\ p) ~> (present /\ q)` を意味します。`check` と `verify` は、削除のあるエンティティについて、削除後の基本値が満たしてしまう目標に `info[GoalMetByDelete_*]` を出します。`.present()` を `always` などの目標を持たない性質に付けると、エラー `PresentOnNonGoalProperty` です。

`eventually` / `leads_to` の反例はlassoで、`then loops back to step K` か `then nothing changes forever` で終わります。

### 順序・安定性と回復可能性

`stable` / `unchanged` / `precedes` は安全性の性質です。BFSが各辺で読み、最初に破る辺までの最短トレースを出します。`precedes(p, q)` はインスタンスごとのラッチで「`q` の前に `p` があったか」を読みます。

`can_reach(goal)` はCTLの `AG EF` に当たり、TLA+では書けないのでTLCは検査しません。到達可能なすべての状態から、そのインスタンスが目標に届く経路が残っているかを判定します。違反すると、届かなくなった後にインスタンスが閉じ込められる状態を `confined:` として示します。`can_reach` のconeは厳密である必要があるので縮約せず、スロットも解放しません。

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
| `StateModel_<E>.tla` | `verify` と同じように縮約したcone。`Witness_` と `Deadlock_` の不変条件を持つ |
| `StateModel_<E>.cfg` | `TypeOK` と `Deadlock_` 不変条件 |
| `StateModel_<E>_witnesses.cfg` | `TypeOK` と `Witness_` 不変条件 |

`Witness_<E>_<col>_<s>` は「どのインスタンスも `s` にいない」という不変条件です。健全なモデルではすべて違反になり、TLCが報告しない `Witness_` がwitnessのない状態です。TLC側のデッドロックのpassは証明になりません。列のconeが永遠に動き続けると、止まったインスタンスが隠れるからです。デッドロックを判定するのは `check` と `verify` です。

## z3による証明

BFSとTLCは固定のインスタンス数と上限付きのInt範囲で検査するので、2インスタンスで成り立つ規則も3インスタンスで破れることがあります。`verify` はz3を使い、各状態規則が **任意の行数** と、モデルが組める **すべてのInt範囲** で成り立つかも調べます。mainでは、この証明は `--prove` なしで既定で走り、実験的ではなくなりました。

| 実行 | z3あり | z3なし |
|---|---|---|
| `verify` | 証明を回す | stderrに `note: z3 not found on PATH: the proof was skipped (...)` を出し、`--no-prove` と同じに振る舞う |
| `verify --prove` | 証明を回す（ほかは何も変わらない） | エラー、終了コード1 |
| `verify --deny-unproved` | 証明を回し、証明できない規則で失敗する | エラー、終了コード1 |
| `verify --no-prove` | 証明せず、z3も探さない | 証明せず、noteも出さない |

z3は `--z3`、`RDRA_Z3`、`PATH` 上の `z3` の順に探します。`--no-prove` と `--prove` / `--deny-unproved` / `--z3` の併用は使い方のエラー（終了コード2）です。見つかったz3が失敗したときは、フラグに依らずエラーです。z3がないだけで証明なしにpassしないよう、証明を必須にするCIでは `--prove` か `--deny-unproved` を付けます。z3の入手はupstreamの [Getting z3](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#getting-z3) を参照してください。

`proved:` と `lemma:` の各行、`proof (...)` の見出し、`OK:` 行の末尾は、同じ主張を同じ言葉で述べます。たとえば `for any number of rows and every --int-range-max from 4 to 254, in the whole model` です。

- **行数**：任意です。符号化に行数の上限はありません
- **Int**：モデルが組める `--int-range-max` のすべてです。下端はモデルのIntリテラルがすべて収まる最小の値で、上端は255（nullableなInt列があれば254）です。Int列のないモデルは範囲を書きません
- **スコープ**：`in the whole model`、または `--buc` などのスコープを付けたときは `in the selected scope: <flags>` です。後者は、除いたUCを持たない系での証明なので、モデル全体では破れることがあります

### 証明の仕組み

- 各エンティティの行を未解釈ソート、各列を関数、各UCをステップ関係として符号化します
- 規則が **帰納的** な集合に属せば証明済みです。初期状態で成り立ち、すべてが成り立つ状態からどのステップでも破れない集合です
- どの証明にも `false` という見張りの候補を入れます。これが初期状態で落ちなければ符号化が矛盾しているので、どの規則も証明済みにしません
- 符号化はBFSの遷移系を広げる向きにだけ近似します。符号化で表せないガードや書き込みは同じ向きに広げて `note:` で示し、表せない規則は `out of scope` です。件数の規則は、`.at_least(k, ..)` が `k = 8` まで、`.at_most` / `.exactly` が `k = 7` まで厳密に表せます
- 真でも単独では帰納的でない規則が多いので、候補の補題を加えて、帰納的な集合を残します（Houdini）。補題は、削除行や外部キーに関する事実のほか、BFSが実行の範囲と1インスタンスで見た行のパターンや列の値から採掘します。件数ガードからの件数の補題と、別エンティティの行の存在を言う∀∃の補題は、規則がそれなしで証明できないときだけ加わります。採掘の探索は50,000状態で止まり、補題は同じ検査を通るまでは推測として扱います
- 証明できない規則には、帰納法の反例（CTI）を出します。CTIの前の状態は到達可能とは限りません
- z3の各検査は時間ではなく資源単位（`rlimit`）で打ち切るので、マシンの負荷で結果が変わりません。上限は規則で20,000,000、証明器が足す補題で2,000,000です
- 上限はz3 5.1.0で測った値です。ほかの版のz3では、`note: z3 <version> is not a version the proof's resource limits were measured on (5.1.0); ...` をstderrに出します。結果は変えません
- 証明が残した集合を、ユーザーのキャッシュディレクトリに証明書として保存します。次の実行で符号化が同じなら、まず証明書を1回の検査で確かめ直します。キャッシュの判定をそのまま信じることはなく、出力はどちらでも同じです

健全性の論証は [z3の理論](/projects/rdra-ish/theory/z3/) で解説しています。

```text
$ rdra-ish verify samples/formal-verification/one_to_one_shared.rdra --instance-count 1
...
unproved: Unique_Shipment_Order: not inductive; Ship(Order#1, Shipment#1) breaks it from a state where it, every proved rule, and every kept lemma hold (not necessarily reachable)
  Order#1 (present) status=placed -> status=shipped
  Shipment#1 (absent -> present) Order=Order#2 -> Order=Order#1
  Shipment#2 (present) Order=Order#1
```

このCTIは実際の実行でもあり、2インスタンスではBFSが違反をトレース付きで報告します。同じ実行でBFSが破った規則は、どんな帰納法でも保てないので証明を試みません。`refuted:` 行に出て、`proof:` 行で `refuted` に数えます。これはBFSのエラーなので、`--deny-unproved` は数えません。

```text
$ rdra-ish verify samples/formal-verification/one_to_one_shared.rdra
...
refuted: Unique_Shipment_Order (BFS counterexample at 2 instances)
proof: 0 proved, 0 unproved, 0 out of scope, 1 refuted
...
```

### 補題

証明できない規則が残ると、証明器はIC3の要領で、CTIの前の状態を自分で除こうとします。その状態の事実（各行の列や印、行どうしのキー）から1つずつ事実を落として節を弱め、帰納的なまま残った節を候補に加えます。残った節は `lemma: from the CTI of <rule>: <text>` と出ます。言語で書ける場合、`<text>` はモデルにそのまま写せる `.lemma()` のソースです。このような補題は証明書に入らないので、それを要したモデルは毎回証明を最初から回します。

```text
lemma: from the CTI of MultiForbidden_Light_0: forbidden(Door, Light, Door.state == ajar, Light.state == off).global().lemma()
```

証明器の補題で足りないときは、足りない事実を `.lemma()` 付きの規則として書きます。`check` はそれを通常の規則として検査するので、誤った補題はトレース付きで失敗します。`verify` は補題のための独自のconeを回しません。読む変数が別の規則のconeに収まる補題はそのconeで検査し、偽なら `refuted: lemma <name>` と反例を出して失敗します。補題は `proved: lemma <name>` などと出て、`OK:` 行の規則数には数えません。補題に限り、行の印（`Door.in_run(Open)`、`Sign.raised(EvShut)`）を読めます。

insurance-claim-opsは、「賠償の請求は示談書がそろってから完了する」を、示談交渉前の案件の状態をまとめた次の補題で証明しています。

```rdra
forbidden(Claim, ClaimCase, Claim.completed_on == present, ClaimCase.status in (received, responded, investigating), ClaimCase.coverage in (bodily_liability, property_liability)).along(Claim, ClaimCase).label("賠償責任の事故は示談交渉の前に請求を完了しない").lemma()
```

### 証明が変えるもの

証明が読むのは状態規則だけで、`after` アサーションや時間性質は対象外です。BFSが違反の前にメモリ上限で止めた不変条件のconeは、z3がそのconeの規則をすべて証明すれば `ok` として判定済みになります。

```text
Cone_Forbidden_CartLine_0 [Forbidden_CartLine_0, Check_CartLine_qty_0]: ok (16 states, BFS stopped at the memory limit, decided by proof: z3 proved every check for any number of rows)
```

`after` アサーションや証明できない規則を含むconeと、`--max-states` で止まったconeは `not decided` のままです。`export --kind sql` のスキーマが強制しない規則には `[not enforced by the SQL schema: <why>]` が付き、`proof: the SQL schema leaves <n> rules to the application: ...` 行で数えます。

**範囲を超えた検査（escalation）**：証明できず、実行の範囲ではBFSがpassした規則は、ほかのBFSがすべて終わった後で、自分のconeでインスタンスを1つ、さらに2つ増やして検査し直します。状態数の上限はなく、メモリで抑えます。

```text
escalated: Forbidden_Order_0: counterexample at 3 instances (BFS on its cone; ok at 2)
escalated: Forbidden_Item_0: ok at 3 instances, ok at 4 instances (BFS on its cone; ok at 2)
```

そこでの反例は到達可能なので、`--deny-unproved` の有無に依らずエラーです。トレースの見出しは `counterexample (4 steps, at 3 instances):` のように必要なインスタンス数を示し、実行は `<n> invariant or after-assert violation(s) at more instances than the run's` で失敗します。coneの行は実行の範囲での判定を保ち、TLCはそちらと照合します。上限で止まったときは `not decided at <n> instances` と出て、終了コードは変わりません。

証明の仕組みを、ブログ記事 [RDRA-ishはz3の帰納的証明をどう安全に自動生成しているか](/blog/2026/rdra-ish-z3-induction/) で詳しく解説しています。

## export --kind tlaの役割

`export --kind tla` は検査の前提ではありません。TLA+を読みたいとき、または手でTLCを回したいときに使います。

```bash
rdra-ish export <INPUTS...> --kind tla [-o <OUT>] [--instance-count N] [--instances E=N] [--int-range-max N]
```

- `-o` が `.tla` で終わればそのモジュールと隣の `.cfg` を、それ以外はディレクトリに `RdraSpec.tla` / `RdraSpec.cfg` を書きます。隣に `StateModel_<E>` specも書きます
- `RdraSpec.cfg` は規則ごとに `INVARIANT`、`after` アサーションと時間性質ごとに `PROPERTY` を持ち、`CHECK_DEADLOCK FALSE` を設定します
- `check` がライフサイクルのエラーを見つけるモデルでも、specを書いて終了コード0で終わり、エラー件数のnoteを出します
- `export` は前回の `StateModel_` ファイルを消しません。空のディレクトリに書き出します
- `verify -o <dir>` はcone・実行ごとのモジュールと、各モジュールが答える検査を並べた `cones.txt` を書きます。ネイティブ検査器はこれらのファイルを読みません

## サンプル

正本は [`skills/rdra-ish-verify/samples/`](https://github.com/manji-0/rdra-ish-dsl/tree/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/skills/rdra-ish-verify/samples) にあり、`samples/formal-verification/` と `samples/formal-verification-fail/` からリンクされています。各ファイルは単体で扱います。ディレクトリをまとめて `check` するとIDが衝突します。`unique_double_booking.rdra`、`unique_booking_guarded.rdra`、`counting_rules.rdra` は `samples/formal-verification/` にだけあります。

2列目は `check` の判定と、`verify` のconeの判定です。witnessのない状態やデッドロックは、coneがすべてpassしても両コマンドを失敗させます。証明の列は `verify` が証明する状態規則の数です。終了ステータスは各ファイルの `// expect` ヘッダが定めます。

| サンプル | `check`、`verify` のcone | 証明 | 焦点 |
|---|---|---|---|
| `order.rdra` | pass、pass | 2 of 2 | 不変条件、`after` アサーション、`WF_vars(Next)` 下の `leads_to` と `eventually` |
| `int_stock.rdra` | pass、pass | 1 of 1 | Int列、算術の `forbidden`、Intの時間性質 |
| `now_coupon.rdra` | fail、fail | 0 of 1 | `now` と `Tick`：`expired_at < now` の禁止状態に届く |
| `cross_order_payment.rdra` | pass、pass | 1 of 1 | 複数インスタンスと `.along`。Payは1つの原子的ステップなのでCancelが割り込めない |
| `cross_order_payment_split.rdra` | fail、fail | 0 of 1 | Payを2つのAPIに分けた版。`Pay_1` と `Pay_2` の間にCancelが割り込む |
| `split_run_order.rdra` | pass、pass | 2 of 2 | 2つのAPIにまたがるUCが `invokes` 順の1つの実行として動き、`.fair` で完了する |
| `quantifier_none.rdra` | fail、fail | 0 of 1 | `invariant(...).when(...).none(...)`：Assignが有効なままRevokeする |
| `quantifier_guard.rdra` | pass、pass | 1 of 1 | Revokeに `holds(..).none(..)` のガードを付けて成り立たせる |
| `untriggered_sets.rdra` | fail、fail | 0 of 1 | 遷移を駆動しないUCの `sets` が禁止状態に届く |
| `event_order.rdra` | pass、pass | 状態規則なし | `triggers` によりIssueCertはイベント発生後にだけ動く |
| `after_assert_unmet.rdra` | fail、fail | 状態規則なし | 成り立たせる `sets` のない `after(DeliverOrder).assert` |
| `temporal_fair.rdra` | pass、fail | 状態規則なし | 公平性なしの `leads_to` は破れ、`.fair(Register, Dismiss)` なら成り立つ |
| `order_stability.rdra` | pass、fail | 状態規則なし | `stable`、`unchanged(..).when(..)`、`precedes` の成立例と違反例 |
| `temporal_along.rdra` | pass、fail | 状態規則なし | PaymentとOrderにまたがる `always` が `.along` 付きで成り立ち、なしで破れる |
| `temporal_unmet.rdra` | pass、fail | 状態規則なし | 破れる `always` と `leads_to`。後者はlassoを出す |
| `one_to_one_shared.rdra` | pass、fail | 0 of 1 | `relate(.., 1:1)` の `Unique_Shipment_Order` は2インスタンスで初めて破れる |
| `unique_double_booking.rdra` | pass、fail | 0 of 1 | 2件の予約が同じ部屋の午前を取り `@unique(room_id, slot)` が破れる |
| `unique_booking_guarded.rdra` | pass、pass | 1 of 1 | `.none(Booking.slot == am)` のガードで枠を守る |
| `counting_rules.rdra` | pass、pass | 2 of 2 | `relate(Loan, Member, 0..3:1)` と `.at_most(3, ..)`。既定の範囲では空虚で、警告が `--instances Loan=4` を示す |
| `none_any_child.rdra` | pass、pass | 1 of 1 | `.none(Invoice)` はリンクだけを読み、coneは `Invoice.status` を含まない |
| `none_any_child_bypassed.rdra` | pass、fail | 0 of 1 | 同じモデルでガードのないReissueを持つ |
| `min_card_unmet.rdra` | fail、fail | 0 of 1 | `relate(OrderLine, Order, 1..*:1)`。Placeが明細のないOrderを作る |
| `min_card_met.rdra` | pass、pass | 1 of 1 | PlaceがOrderと最初の明細を1つのトランザクションで作る |
| `check_unmet.rdra` | fail、fail | 0 of 1 | `@check(qty >= 1)`。ClearQtyが `qty` を0にする |
| `check_met.rdra` | pass、pass | 2 of 2 | 同じcheckを範囲内に保つ。`forbidden` がBoolの `@derived` 列を読む |
| `unwitnessed_state.rdra` | fail、pass | 1 of 1 | `refunded` にwitnessがなく `shipped` がデッドロック。規則のconeはpass |
| `deadlock.rdra` | fail、pass | 状態規則なし | Shipのガードが `pending` の間だけ成り立ち、Orderが `paid` から抜けられない |
| `can_reach_unmet.rdra` | pass、fail | 状態規則なし | `can_reach` が破れる。Orderが `pending` と `on_hold` を永遠に行き来できる |
| `can_reach_met.rdra` | pass、pass | 状態規則なし | 同じモデルにRestockを加え、どの状態からも完了できる |
| `partial_scope.rdra` | fail、実行されない | 実行されない | ビルドエラー `DerivedColumnRead` が両コマンドを止める。`--entity Order` なら後回しにしてpass |
| `fail/order.rdra` | fail、fail | 0 of 1 | 到達可能な不変条件違反 |

`--with-tlc` では、TLCは実行するすべての検査でネイティブと同じ判定を出します。

## 既知の検証ギャップ

passした `check` / `verify` は、探索しなかった部分について何も言いません。

各判定がどの証明・テスト・仮定に支えられ、どこに穴が残るかは [検証の理論](/projects/rdra-ish/theory/) で解説しています。そちらはv3.0.0以降のmainを対象にしています。

| ギャップ | 見える場所 | 対処 |
|---|---|---|
| **範囲**：結果はインスタンス数とInt範囲の中でだけ成り立つ。`check` は1インスタンスなので、`Unique_*` のように2行で破れる規則は空虚に成り立つ。3行で破れる規則は既定では検査しない | `bounds:` 行と `OK:` 行 | `--instance-count`、`--instances`、`--int-range-max` を上げる。行数に依らず成り立つ `proved:` 行を読む |
| **イベントの順序**：トリガーされたUCは行ごとの発生の後にだけ動くが、記録はラッチで回数を数えない。発生元をすべて持たないconeではハンドラが順序なしに動く。その反例は候補として、発生元を加えたconeで判定し直す。厳密なconeはずっと大きくなりうる | `triggers` 行のinfo、coneの行の下の `note: ... on the cone refined with the event's raisers: ...` | 発生元が設定する状態から始める、規則に発生元の書く値を読ませる、`.counted(k)` を使う |
| **coneがメモリ上限や `--max-states` で止まる**：止まったconeは所見を判定しない。止まる前に見つけた反例は到達可能なので報告する | `not checked:` とstderrの `warning:`。`check` では `MemoryCapReached_<E>` / `StateCapReached_<E>` | `--memory` を上げる、別エンティティを読むガードを移してconeを狭める、`--symmetry always` を試す |
| **coneで決まらない性質**：モデル全体を予算付きで回す。モデル全体が大きすぎると `not decided` のまま | 性質の行と `not checked:` の `not decided` | `.fair(...)` を付ける、`--temporal-budget` を上げる |
| **範囲を絞った実行**：`--buc` / `--entity` は性質を検査しない | `temporal properties: 2, not checked: a scoped run checks none` | 絞らずに `verify` を回す |
| **`--buc` の所見**：除いたUCが状態に届かせたり抜け出させたりしうるので、witness・実行されないUC・デッドロックを未判定にする | `not checked:` | `--buc` なしで回すか、coneが厳密な `--entity` を使う |
| **TLCとの比較が1インスタンスだけのcone**：upstreamのテスト `engine_equivalence` は、縮約後で300,000状態を超えるcone（25個）を1インスタンスでだけTLCと比べる | テストの `VERIFY_FALLBACK` 一覧 | そのconeは `verify --with-tlc` で第二の意見を取る |

ほかに、モデル自体の近似があります。`.on_delete` は拒否としてだけ働き、`cascade` などは実行しません。UCはトランザクショングループごとに原子的です。`now` は自由に進みます。公平性は弱公平性だけです。サンプル固有のギャップは、upstreamの各サンプルのREADMEにあります（[patent-ops](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/samples/patent-ops/README.md#known-verification-gaps)、[food-permit-ops](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/samples/food-permit-ops/README.md#known-verification-gaps)、[insurance-claim-ops](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/samples/insurance-claim-ops/README.md#known-verification-gaps)）。

## 次に読む

- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
- [検証の理論](/projects/rdra-ish/theory/)
- upstream: [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/formal-verification.md)、[engine-agreement.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/engine-agreement.md)
- ブログ： [形式検証の論文調の解説](/blog/2026/rdra-ish-formal-verification/)、[BFSの高速化](/blog/2026/rdra-ish-bfs-speedups/)、[z3による帰納的証明](/blog/2026/rdra-ish-z3-induction/)
