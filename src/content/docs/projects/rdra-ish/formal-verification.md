---
title: "形式検証"
description: "rdra-ish v1.2.0 の TLA+/TLC 形式検証"
sidebar:
  order: 4.5
---

このページは、エンティティのライフサイクルと状態制約をTLA+にエクスポートし、TLCでモデル検査する手順です。`rdra-ish states`（高速なBFS到達性）を補完する古典的な検査レイヤです。完全な仕様と近似の一覧はupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.2.0/docs/formal-verification.md) を参照してください。

## コマンド

```bash
rdra-ish export <INPUTS...> --kind tla [-o <OUT>] [--instance-count N] [--int-range-max N]
rdra-ish verify <INPUTS...> --backend tlc [-o <OUT_DIR>] [--instance-count N] [--int-range-max N]
```

| コマンド | 役割 |
|---|---|
| `export --kind tla` | モデル全体の `RdraSpec.tla` と兄弟の `RdraSpec.cfg` に加え、デッドロックとwitnessを検査する `StateModel_<E>` specを出力 |
| `verify --backend tlc` | 不変条件ごとの影響範囲（cone）と時間性質ごとにSpecを出力し、`PATH` 上の `tlc` / `tlc2` を実行 |
| `states`, `check` | 同じ遷移系のローカル BFS（TLC 不要）。`--instance-count`（既定 `1`）と `--int-range-max`（既定 `5`）を受け付ける |

`--instance-count`（既定 `2`）はエンティティごとのインスタンス数、`--int-range-max`（既定 `5`）は `IntRange == 0..N` の上限です。`verify` のOKはこの範囲内でだけ成り立ちます。

`export` の `-o` が `.tla` で終わる場合は、その隣に `.cfg` を書きます。ディレクトリ（または拡張子なし）なら `<dir>/RdraSpec.tla` / `.cfg` になります。その隣に `StateModel_<E>` specも書きます（[TLC単体で状態モデルを検査する](#tlc単体で状態モデルを検査する)）。`verify -o <dir>` はconeごとの `Cone_<名前>.tla` / `.cfg` と、各モジュールが答える検査を並べた `cones.txt` を書きます。`-o` を省くと一時ディレクトリに書き、失敗したときだけ残します。`.cfg` は `CHECK_DEADLOCK FALSE` を設定します（終端ライフサイクル状態をTLCデッドロック扱いにしないため）。

そのため、モデル全体のSpecをTLCにかけて検査されるのは不変条件と性質だけです。デッドロックとwitnessの欠如は、隣に書く `StateModel_<E>` specが検査します。`verify` はTLCと自身のBFSを回し、デッドロックとwitnessはBFSで判定します。`check` がライフサイクルのerrorを見つけるモデルでも、`export --kind tla` はSpecを書き出して終了コード0で終わり、error件数と `StateModel_*` spec、`verify` を案内するnoteを1行出します。

## TLC単体で状態モデルを検査する

v1.1.0までは、デッドロックとwitnessの欠如は `check` と `verify` のBFSからしか出ず、書き出したSpecを手でTLCにかける利用者は見逃し得ました。v1.2.0の `export --kind tla` は、`verify` のBFSが探索するのと同じconeをTLA+で書き出します（upstream issue #97）。状態モデルを持つエンティティのconeごとに、次の3ファイルを書きます。

| ファイル | 検査するもの |
|---|---|
| `StateModel_<E>.tla` | `verify` と同じように簡約したcone。状態モデルの各状態 `s` に `Witness_<E>_<col>_<s>` 不変条件、ほかの状態への出口がある各状態に `Deadlock_<E>_<col>_<s>` 不変条件を持つ |
| `StateModel_<E>.cfg` | `TypeOK` と `Deadlock_` 不変条件 |
| `StateModel_<E>_witnesses.cfg` | `TypeOK` と `Witness_` 不変条件 |

不変条件の名前は `check` が印字する所見の名前と同じです。

```bash
tlc -continue -config StateModel_Order.cfg StateModel_Order.tla
tlc -continue -config StateModel_Order_witnesses.cfg StateModel_Order.tla
```

`Deadlock_<E>_<col>_<s>` は「インスタンスが `s` にいる状態では、その列のconeを動かすステップがまだある」という不変条件です。TLCが違反を報告した状態は、`check` も報告するデッドロックです。別のUCが無関係な列を行き来させていても、デッドロックは隠れません。

`Witness_<E>_<col>_<s>` は「どのインスタンスも `s` にいない」という不変条件です。`s` に届けばTLCが違反を報告するので、健全なモデルではすべての `Witness_` が違反になり、TLCは非ゼロで終わります。TLCが報告しない `Witness_` が、witnessのない状態です。

注意点が3つあります。

- **デッドロック側のpassは証明になりません。** 列のconeのどこかに循環があると、ステップが常に有効なままになり、デッドロックが隠れます。たとえば、ガードが読む別の列を2つのUCが行き来させ続ける場合です。`check` はこのデッドロックを報告し、TLCは通します。upstreamのテスト `engine_equivalence` はこの例を固定しています。デッドロックを判定するのは `check` と `verify` です
- **`-continue` の出力が大きくなります。** `-continue` を付けると、TLCは違反する状態ごとにトレースを印字します。witnessesのcfgではほぼすべての到達状態が違反するので、clinic-opsの `Encounter` のcone（93,425状態）で1.5 GBの出力になります。大きなconeでは `-continue` を外し、報告された不変条件を除いて再実行を繰り返します
- **古いファイルが残ります。** `export` は前回書いた `StateModel_` ファイルを消しません。空のディレクトリに書き出します

`verify` はこれらのspecを実行しません。BFSが同じ所見を報告し、`verify` の出力は変わりません。

## 独立した部分ライフサイクルによる簡約

coneには、対象のアクションが書かず、一部しか読まない別のライフサイクルが入っていることがよくあります。insurance-claim-opsの請求のconeには案件の示談が、clinic-opsの会計のconeには予約と診察が入っています。そのライフサイクルのすべての状態が対象側のすべての状態と組み合わさるので、厳密なconeはその直積より小さくなりません。

v1.2.0の `verify` は、各coneをこの部分ライフサイクルで簡約してから探索します（upstream issue #74）。対象が書かないエンティティを単独で探索し、残りのconeがそこから読むものについて、stuttering同値で商を取ります。簡約したconeは元のconeと同じ判定を下します。その論証はupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.2.0/docs/formal-verification.md#reduction-by-an-independent-sub-lifecycle) にあります。

- 判定、error名、`// expect` ヘッダは変わりません。印字される状態数は小さくなります。状態数は互換性契約の対象外です
- 反例トレースは、簡約前のconeの経路に戻してから印字します。簡約後より長くなることがあり、部分ライフサイクル側のUCがステップに出ることもあります
- 時間性質の反例は、簡約しないcone（`Cone_<P>_Full`）でも再実行し、トレースはそちらのlassoを読みます
- 商が何も減らさないcone（部分ライフサイクルの各状態がそれぞれ1つのクラスになる場合）は簡約しません（#101）
- `check` と `states` は簡約しません

効果は大きく、clinic-opsの `verify --deny-undecided` は約2.5分・3.7 GBから約40秒・1.4 GBになりました。`Charge` のconeは8,388,608状態超から38,533状態になりました。`Prescription` のconeは4,266,635状態から1,690状態です。v1.2.0では、patent-opsが出願のガード（承認済みの起案だけを出願する）を、insurance-claim-opsが示談のガードと規則を書き戻しました。どちらも簡約したconeなら `verify --deny-undecided` ですべての検査を判定できます。一方で、insurance-claim-opsの「支払期限が延長の理由に従う」は、`sets(..).when` で書けるものの、coneが上限内で判定できないため、まだサンプルに入っていません。

## モデルとの対応

| RDRA | TLA+ |
|---|---|
| Enum + `transitions(UC, Entity.col, a -> b)` | `VARIABLES` / `Init` / `Next` のアクション（UCごとの演算子） |
| エンティティ局所の `invariant` / `forbidden` / `required` / `exclusive` | Safety |
| マルチエンティティ `forbidden` / `invariant`（`.along` 可） | 複数変数上の Safety |
| `invariant(...).when(...).none/has(...)` | 有限インスタンス上の `\A` / `\E` |
| `after(UC).assert` | 独立した `PROPERTY`（SpecActions への代入注入ではない） |
| `property` + `always` / `eventually` / `leads_to` | `.cfg` の `PROPERTY` |

```rdra
property PaidLeadsToShipped "paid eventually reaches shipped"
  leads_to(Order.status == paid, Order.status == shipped)

property StockOk
  always(Item.stock >= Item.selling)

forbidden(Item, stock < selling)
after(DeliverOrder).assert(Order.status == delivered)

invariant(Cert).when(status == revoked).none(Assign.status == active)

forbidden(Order, Payment, Order.status == cancelled, Payment.status == captured)
  .along(Order, Payment)
```

パス性質（`always` / `eventually` / `leads_to`）は `states` では評価しません。`export` / `verify` を使います。

## Intレイヤとnowレイヤ

| レイヤ | ツール | 連続値の扱い |
|---|---|---|
| 有界BFS | `rdra-ish states` / `check` | Int / Money / Decimal / Date / DateTime / `now` を `0..--int-range-max` の値として探索（既定1インスタンス） |
| 算術モデル検査 | `export --kind tla` / `verify` | 同じ列を `IntRange` 変数として TLC 算術（既定2インスタンス） |

どちらも同じ遷移系を読むので、比較の扱いは一致します。`drives(UC, Item.stock < selling, true/false)` で駆動する比較は、どちらでもBool変数です。駆動しない比較はInt列の算術です。

`Date` / `DateTime` 列には `sets(Issue, Coupon.expires_at == 3)` のように数値を代入できます。値は `now` が刻む時計上の点です。`expires_at < now` は、時計が3を過ぎるまで偽で、過ぎると真になります。行によって期限が変わるなら、`sets(UC, E.due == 3).when(Cond)` を場合ごとに書き、タイマーのUCを `holds(Due, E.due <= now)` のようなガードで待たせます（[言語リファレンス](/projects/rdra-ish/language-reference/#条件に従う値)）。

## 推奨ワークフロー

1. `transitions` / `sets` とエンティティ局所ルールでライフサイクルを書く
2. `rdra-ish states` で状態軸（Enum/Bool/Nullable、範囲内のIntと `now`）を素早く確認
3. `rdra-ish export --kind tla -o /tmp/rdra-tla` でSpecを眺める。手でTLCを回すなら `StateModel_<E>` specも使う
4. [TLA+ tools](https://github.com/tlaplus/tlaplus) を入れ `tlc` をPATHに通す
5. `rdra-ish verify --backend tlc -o /tmp/rdra-tla`

エージェント向けにはupstreamのskill `rdra-ish-verify`（`skills/README.md`）があります。

## サンプル

canonicalは `skills/rdra-ish-verify/samples/`（各ファイルは **単体** で扱う。ディレクトリ一括 `check` はID衝突するため不可）。リポジトリでは `samples/formal-verification/` がシンボリックリンクされています。

| サンプル | `check` / TLC | 焦点 |
|---|---|---|
| `order.rdra` | pass / pass | ライフサイクル Safety + `after.assert` + 時間性質 |
| `int_stock.rdra` | pass / pass | Int 軸・算術 `forbidden` |
| `now_coupon.rdra` | fail / fail（想定） | `now` と `Tick`。`expired_at < now` の禁止状態に届く |
| `cross_order_payment.rdra` | pass / pass | マルチインスタンス + `.along`。Payは1つの原子的アクションなのでCancelが割り込めない |
| `cross_order_payment_split.rdra` | fail / fail（想定） | 同じモデルでPayを2つのAPIに分けた版。2トランザクションの間にCancelが割り込む |
| `quantifier_none.rdra` | fail / fail（想定） | `invariant(...).when(...).none(...)` |
| `unwitnessed_state.rdra` | fail / pass | `refunded` にwitnessがない。モデル全体のSpecではTLCは通るが、`StateModel_Order` specならTLC単体でも見つかる |
| `deadlock.rdra` | fail / pass | Orderが `paid` から抜けられない。同じく `StateModel_Order` specならTLC単体でも見つかる |

`check` もBFSで同じ規則を検査し、表の各行でBFSとTLCは同じ判定になります。ただし既定の `check` では、時間性質と2インスタンスで初めて出る違反はTLCだけが見ます。`temporal_unmet.rdra` や `one_to_one_shared.rdra` は `check` がexit 0でもTLCではfailです。`one_to_one_shared.rdra` は `check --instance-count 2` ならexit 1になります。時間性質は `check` では評価しないので、その否定判定はTLC側で取ります。ほかのサンプルはupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.2.0/docs/formal-verification.md#samples) に一覧があります。

## 次に読む

- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- upstream: [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.2.0/docs/formal-verification.md)
