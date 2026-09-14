---
title: "言語リファレンス"
description: "rdra-ish DSL（.rdra）の構文概要（v0.2.0）"
sidebar:
  order: 6
---

このページは `.rdra` の構文と、同じモデルから出せる図表・表・エクスポートの概要です。完全な仕様はupstreamの [language-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/main/docs/language-reference.md) も参照してください。

## ファイル構造

```rdra
module buc.order

// インスタンス宣言（述語で参照する前に宣言する）
actor Customer "Customer"
business Commerce "Commerce"
buc BucOrder "Process Order"
usecase PlaceOrder "Place Order"

// エンティティ
entity Order "Order" {
  id: Int @pk
  status: Enum(pending, paid) @default(pending)
}

// 述語（関係）
performs(Customer, BucOrder)
belongs(BucOrder, Commerce)
contains(BucOrder, PlaceOrder)
creates(PlaceOrder, Order)
```

- **module / import**: ファイルパスと対応（`module buc.order` ↔ `buc/order.rdra` 等）
- コメント： `//` 行コメント、`/* */` ブロックコメント（`#` は非対応）

## インスタンス宣言

```
<kind> <Id> "Label"
<kind> <Id> "Label" description "Longer text"
```

### 主要なkind

| kind | 説明 |
|---|---|
| `actor` | 人間アクター |
| `extsystem` | 外部システム |
| `system` | 内部システム境界 |
| `business` | ビジネス領域 |
| `buc` | ビジネスユースケース（価値スライス） |
| `usecase` | ユースケース |
| `screen` | 画面 |
| `api` | API 境界 |
| `entity` | 永続化エンティティ |
| `concept` / `domain_object` | 概念モデル（DB前） |
| `requirement` / `nfr` / `constraint` | 要件・非機能 |
| `adr` | アーキテクチャ決定記録 |
| `event` | ライフサイクルイベント |
| `state` | 任意の図用ラベル（Enum バリアントの糖衣。遷移端点には使わない） |
| `permission` / `medium` / `location` / `timing` | 制約語彙 |

## エンティティ本体

```rdra
entity Order "Order" {
  id: Int @pk
  customer_id: Int @fk(Customer)
  status: Enum(pending, paid, shipped) @default(pending)
  total: Decimal
}
```

アノテーション例： `@pk`, `@fk`, `@unique`, `@default`, `@index`

## 関係述語

述語は `(Subject, Object)` またはチェーン形式で関係を記述します。

### スコープと所有

| 述語 | 意味 |
|---|---|
| `performs(Actor, Buc\|Usecase)` | アクターが実行 |
| `belongs(Buc, Business)` | BUCが事業領域に属する |
| `contains(Buc, Usecase)` | BUCがUCを包含 |
| `decides(Adr, Element)` | ADRが要素に影響 |

### データ操作

| 述語 | 意味 |
|---|---|
| `creates(Usecase, Entity)` | 作成 |
| `reads(Usecase, Entity)` | 参照 |
| `updates(Usecase, Entity)` | 更新 |
| `deletes(Usecase, Entity)` | 削除 |
| `relate(Entity, Entity, N:1)` など | エンティティ間関連（カーディナリティは **非クォート**、例: `N:1`。`N:M` は未対応で中間エンティティを使う） |

### 相互作用

| 述語 | 意味 |
|---|---|
| `displays(Usecase, Screen)` | 画面表示 |
| `invokes(Usecase, Api)` | API呼び出し |
| `requires_permission(Usecase\|Api, Permission)` | 必要権限 |
| `requires_medium(Screen, Medium)` | 媒体制約 |

### ライフサイクル

| 述語 | 意味 |
|---|---|
| `raises(Usecase, Event)` | イベント発行 |
| `sets(Event\|Usecase, Entity, col == val)` 等 | 列への代入（比較式） |
| `transitions(Entity.col, Event, from -> to)` | Enum 列上の遷移（グローバル `state` ラベルは端点に使わない） |
| `outbox(Event)` | 意図的な外部公開（未消費 warning 抑制） |

```rdra
transitions(Order.status, event::Capture, pending -> paid)
sets(CapturePayment, Order, status == paid)
```

### ルール

条件は比較式のみ（`col == val`、`stock < selling`）。タプルや平坦な `col, val` は不可。

| 述語 | 意味 |
|---|---|
| `forbidden(Entity, conditions...)` | 到達禁止（局所） |
| `forbidden(A, B, conditions...).along(A, B)` | マルチエンティティ禁止（旧 `cross_*` / `forbidden_when` は削除） |
| `invariant(Entity).when(...).then(...)` | 含意形の不変条件 |
| `when(...).none/has(...)` | 有限インスタンス上の量化 |
| `required(Entity, field, condition)` | 必須条件 |
| `exclusive(Entity, ...)` | 排他 |
| `property Name always/eventually/leads_to(...)` | 時間性質（`states` では未評価。TLA 向け） |

時間結合子は `and` / `or` / `not` を推奨（`/\` `\/` `~` はエイリアス）。詳細と形式検証は [形式検証](/projects/rdra-ish/formal-verification/) を参照してください。

## ビジネスフロー

```rdra
flow OrderFlow "Order Flow"
step S1 "Validate cart"
step S2 "Place order"

precedes(S1, S2)
contains(BucOrder, OrderFlow)
```

## 配置ルール

- BUC固有述語を `shared/` に置かない
- 安定語彙（actor, business, 共有entity）は `shared/`
- 1 BUC = 原則1ファイル（`buc/buc_<name>.rdra`）

詳細は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) を参照してください。

## 図表生成

```bash
rdra-ish diagram <INPUTS...> --kind <KIND> --format <FORMAT> [OPTIONS]
```

| オプション | 説明 |
|---|---|
| `--kind` | 図の種類（下表） |
| `--format` | `mermaid` / `plantuml` |
| `--buc` | 特定BUCにスコープ |
| `--show-description` | 説明メタデータを注釈として表示 |

### 図の種類

| kind | 用途 |
|---|---|
| `rdra` | RDRA レイヤ図（BUC・UC・エンティティの関係） |
| `er` | ER 図 |
| `sequence` | ユースケースシーケンス |
| `state` | 状態遷移 |
| `event-flow` | イベントフロー |
| `boundaryless` | 境界なし全体グラフ |
| `business-area` | ビジネス領域ビュー |
| `diff` | ベースとの差分図（`--diff-base` の意味エラーでも fail-closed） |

早期レビューでは **Mermaid**（`--format mermaid`）が推奨です。テキストなのでdiffしやすい。

```bash
rdra-ish diagram src/ --kind sequence --format mermaid --buc BucOrder
rdra-ish diagram src/ --kind event-flow --format mermaid
```

PlantUMLでPNG/SVGが必要な場合はJava + plantuml.jarが必要です。

## レビュー表

```bash
rdra-ish csv <INPUTS...> --kind <KIND> [--format table|json|csv]
```

| kind | 内容 |
|---|---|
| `matrix` | CRUD マトリクス |
| `api-list` | API 一覧 |
| `screen-constraints` | 画面制約 |
| `actor-permission-audit` | 権限とアクター割当の監査 |
| `requirement-trace` | 要件トレーサビリティ |

## 状態導出

BUC横断で到達可能なエンティティ状態パターンを導出します（BFS）。

```bash
rdra-ish states <INPUTS...> [--entity <EntityId>] [--format table|json]
```

- 到達不能なenum variant
- 作成経路の欠落
- `forbidden` / `invariant` / `required` / `exclusive` 違反（マルチエンティティ含む）

ライフサイクルレビュー（Stage 5–6）では `states` と `diagram --kind event-flow` をセットで使います。Int / `now` の算術・時間性質は `states` では扱わず [形式検証](/projects/rdra-ish/formal-verification/) へ。

## 機械可読エクスポート

```bash
rdra-ish export <INPUTS...> --kind <KIND> [--out <path>]
```

| kind（例） | 内容 |
|---|---|
| `openapi` / `asyncapi` | API・イベント契約のたたき台 |
| `dbml` / `json-schema` | 論理スキーマ |
| `typescript-states` | 状態ユニオン（TS） |
| `tla` | TLA+ Spec + TLC `.cfg`（v0.2.0） |

exportは **レビュー起点のたたき台** です。モデルを更新した後に再生成し、差分をレビューする運用を前提とします。

生成系サブコマンド（`diagram` / `csv` / `list` / `export` / `states` / `verify`）はモデルにerrorがあるとき **fail-closed** です。

## 検証コマンド

```bash
rdra-ish check src/
rdra-ish fmt src/ --check
rdra-ish states src/ --entity Order
# 形式検証（TLC が PATH にある場合）
rdra-ish verify src/ --backend tlc -o /tmp/rdra-tla
```

## レビューの観点

構造は `check` でerrorゼロを前提にし、カバレッジは `csv --kind matrix`、境界は `diagram --kind sequence`、アクセスは `csv --kind actor-permission-audit` で見ます。ライフサイクルは `states` と `diagram --kind event-flow`、厳密な比較・時間性質は `export --kind tla` / `verify --backend tlc`。トレーサビリティは `list --kind requirement` と `lint` です。

## 次に読む

- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
