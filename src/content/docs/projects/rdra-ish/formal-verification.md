---
title: "形式検証"
description: "rdra-ish v0.2.0 の TLA+/TLC 形式検証"
sidebar:
  order: 4.5
---

v0.2.0から、エンティティのライフサイクルと状態制約を **TLA+** にエクスポートし、**TLC** でモデル検査できます。`rdra-ish states`（高速なBFS到達性）を補完する古典的な検査レイヤです。

完全な仕様と近似の一覧はupstreamの [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/main/docs/formal-verification.md) を参照。

## コマンド

```bash
rdra-ish export <INPUTS...> --kind tla [-o <OUT>]
rdra-ish verify <INPUTS...> --backend tlc [-o <OUT_DIR>]
```

| コマンド | 役割 |
|---|---|
| `export --kind tla` | `RdraSpec.tla` と兄弟の `RdraSpec.cfg` を出力 |
| `verify --backend tlc` | エクスポート後、`PATH` 上の `tlc` / `tlc2` を実行 |
| `states` | ローカル BFS（TLC 不要） |

`-o` が `.tla` で終わる場合は、その隣に `.cfg` を書きます。ディレクトリ（または拡張子なし）なら `<dir>/RdraSpec.tla` / `.cfg` になります。`.cfg` は `CHECK_DEADLOCK FALSE` を設定します（終端ライフサイクル状態をTLCデッドロック扱いにしないため）。

## モデルとの対応（要約）

| RDRA | TLA+ |
|---|---|
| Enum + `transitions(Entity.col, Ev, a -> b)` | `VARIABLES` / `Init` / `Next` のアクション |
| エンティティ局所の `invariant` / `forbidden` / `required` / `exclusive` | Safety |
| マルチエンティティ `forbidden` / `invariant`（`.along` 可） | 複数変数上の Safety |
| `when(...).none/has(...)` | 有限インスタンス上の `\A` / `\E` |
| `after(UC).assert` | 独立した `PROPERTY`（SpecActions への代入注入ではない） |
| `property` + `always` / `eventually` / `leads_to` | `.cfg` の `PROPERTY` |

```rdra
property PaidLeadsToShipped "paid eventually reaches shipped"
  leads_to(Order.status == paid, Order.status == shipped)

property StockOk
  always(Item.stock >= Item.selling)

forbidden(Item, stock < selling)
after(DeliverOrder).assert(Order.status == delivered)

when(Cert, status == revoked).none(Assign.status == active)

forbidden(Order, Payment, Order.status == cancelled, Payment.status == captured)
  .along(Order, Payment)
```

パス性質（`always` / `eventually` / `leads_to`）は `states` では評価しません。`export` / `verify` を使います。

## 2つのレイヤ: Int / `now`

| レイヤ | ツール | 連続値の扱い |
|---|---|---|
| 抽象命題 | `rdra-ish states` | `stock < selling` を Bool 軸として扱い、`sets(..., cmp, true/false)` で駆動 |
| 算術モデル検査 | `export --kind tla` / `verify` | Int / Money / Decimal / `now` を `IntRange` 変数として TLC 算術 |

`states` でinertな比較制約でも、TLAエクスポート側では算術Safetyになることがあります。期待値を混ぜないこと。

## 推奨ワークフロー

1. `transitions` / `sets` とエンティティ局所ルールでライフサイクルを書く
2. `rdra-ish states` でEnum/Bool/Nullable軸を素早く確認
3. `rdra-ish export --kind tla -o /tmp/rdra-tla` でSpecを眺める
4. [TLA+ tools](https://github.com/tlaplus/tlaplus) を入れ `tlc` をPATHに通す
5. `rdra-ish verify --backend tlc -o /tmp/rdra-tla`

エージェント向けにはupstreamのskill `rdra-ish-verify`（`skills/README.md`）があります。

## サンプル

canonicalは `skills/rdra-ish-verify/samples/`（各ファイルは **単体** で扱う。ディレクトリ一括 `check` はID衝突するため不可）。リポジトリでは `samples/formal-verification/` がシンボリックリンクされています。

| サンプル | TLC 意図 | 焦点 |
|---|---|---|
| `order.rdra` | pass | ライフサイクル Safety + `after.assert` + 時間性質 |
| `int_stock.rdra` | pass | Int 軸・算術 `forbidden` |
| `now_coupon.rdra` | fail（想定） | `now` / 制約なし Assign・TickNow |
| `cross_order_payment.rdra` | fail（想定） | マルチインスタンス + `.along` |
| `quantifier_none.rdra` | fail（想定） | `when(...).none` |

`check` がwarningのみでexit 0でも、TLCではfailになるサンプルがあります。否定判定はTLC側で取る。

## 関連ページ

- [図表とエクスポート](/projects/rdra-ish/diagram-and-export/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [言語リファレンス](/projects/rdra-ish/language-reference/)
- upstream: [formal-verification.md](https://github.com/manji-0/rdra-ish-dsl/blob/main/docs/formal-verification.md)
