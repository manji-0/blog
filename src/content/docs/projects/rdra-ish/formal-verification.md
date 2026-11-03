---
title: "形式検証"
description: "rdra-ish v1.0.0 の TLA+/TLC 形式検証"
sidebar:
  order: 4.5
---

このページは、エンティティのライフサイクルと状態制約をTLA+にエクスポートし、TLCでモデル検査する手順です。`rdra-ish states`（高速なBFS到達性）を補完する古典的な検査レイヤです。完全な仕様と近似の一覧はupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.0.0/docs/formal-verification.md) を参照してください。

## コマンド

```bash
rdra-ish export <INPUTS...> --kind tla [-o <OUT>] [--instance-count N] [--int-range-max N]
rdra-ish verify <INPUTS...> --backend tlc [-o <OUT_DIR>] [--instance-count N] [--int-range-max N]
```

| コマンド | 役割 |
|---|---|
| `export --kind tla` | モデル全体の `RdraSpec.tla` と兄弟の `RdraSpec.cfg` を出力 |
| `verify --backend tlc` | 不変条件ごとの影響範囲（cone）と時間性質ごとにSpecを出力し、`PATH` 上の `tlc` / `tlc2` を実行 |
| `states`, `check` | 同じ遷移系のローカル BFS（TLC 不要） |

`--instance-count`（既定 `2`）はエンティティごとのインスタンス数、`--int-range-max`（既定 `5`）は `IntRange == 0..N` の上限です。`verify` のOKはこの範囲内でだけ成り立ちます。

`export` の `-o` が `.tla` で終わる場合は、その隣に `.cfg` を書きます。ディレクトリ（または拡張子なし）なら `<dir>/RdraSpec.tla` / `.cfg` になります。`verify -o <dir>` はconeごとの `Cone_<名前>.tla` / `.cfg` と、各モジュールが答える検査を並べた `cones.txt` を書きます。`-o` を省くと一時ディレクトリに書き、失敗したときだけ残します。`.cfg` は `CHECK_DEADLOCK FALSE` を設定します（終端ライフサイクル状態をTLCデッドロック扱いにしないため）。

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
| 抽象命題 | `rdra-ish states` | `stock < selling` を Bool 軸として扱い、`drives(UC, Item.stock < selling, true/false)` で駆動 |
| 算術モデル検査 | `export --kind tla` / `verify` | Int / Money / Decimal / Date / DateTime / `now` を `IntRange` 変数として TLC 算術 |

`states` でinertな比較制約でも、TLAエクスポート側では算術Safetyになることがあります。期待値を混ぜないでください。

## 推奨ワークフロー

1. `transitions` / `sets` とエンティティ局所ルールでライフサイクルを書く
2. `rdra-ish states` でEnum/Bool/Nullable軸を素早く確認
3. `rdra-ish export --kind tla -o /tmp/rdra-tla` でSpecを眺める
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

v1.0.0では `check` もBFSで同じ規則を検査し、表の各行でBFSとTLCは同じ判定になります。ただし時間性質と2インスタンスで初めて出る違反はTLCだけが見ます。`temporal_unmet.rdra` や `one_to_one_shared.rdra` は `check` がexit 0でもTLCではfailです。否定判定はTLC側で取ります。ほかのサンプルはupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.0.0/docs/formal-verification.md#samples) に一覧があります。

## 次に読む

- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- upstream: [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.0.0/docs/formal-verification.md)
