---
title: "言語リファレンス"
description: "rdra-ish DSL（.rdra）の構文概要（v1.1.0）"
sidebar:
  order: 6
---

このページは `.rdra` の構文と、同じモデルから出せる図表・表・エクスポートの概要です。完全な仕様はupstreamの [language-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.1.0/docs/language-reference.md) も参照してください。

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
| `extsystem` | 外部システム（イベントでUCとつながる） |
| `system` | 内部システム境界 |
| `business` | ビジネス領域 |
| `buc` | ビジネスユースケース（価値スライス） |
| `flow` / `step` | ビジネスフローとそのステップ |
| `usecase` | ユースケース |
| `screen` / `field` | 画面と画面項目 |
| `api` / `dto` | API 境界とペイロード形 |
| `entity` | 永続化エンティティ |
| `variation` / `condition` | バリエーション（アクターが選ぶ値の集合）と条件 |
| `goal` / `requirement` / `nfr` / `quality` / `constraint` | 目標・要件・非機能 |
| `adr` | アーキテクチャ決定記録 |
| `event` | ドメインイベント（UC間、UCと外部システム間のインタフェース） |
| `timer` | UCを起動するスケジュール |
| `permission` / `medium` | 制約語彙 |

`concept` / `domain_object`、`state`、`location`、`timing` は削除されました。使うと置き換え先を示すエラーで読み込みに失敗します。状態は `transitions` が名指すEnum列のバリアントから導出されます。

## エンティティ本体

```rdra
entity Order "Order" {
  id: Int @pk
  status: Enum(pending, paid, shipped) @default(pending)
  total: Decimal
  paid_at: DateTime @null
}
```

アノテーション例： `@pk`, `@unique`, `@default`, `@index`, `@null`。列の制約と導出には `@check(expr)` と `@derived(expr)` を使います。`@fk` はありません。外部キー列は手で書かず、`relate` に生成させます。

## 関係述語

述語は `(Subject, Object)` またはチェーン形式で関係を記述します。

### スコープと所有

| 述語 | 意味 |
|---|---|
| `performs(Actor, Buc\|Usecase\|Step)` | アクターが実行 |
| `belongs(Buc, Business)` | BUCが事業領域に属する |
| `contains(Buc, Usecase)` | BUCがUCを包含 |
| `decides(Adr, Element)` | ADRが要素に影響 |
| `exposes(System, Usecase\|Event\|Entity)` / `shares(System, Entity)` | 他のモデルへ要素を公開する（v0.4.0で追加） |

### データ操作

| 述語 | 意味 |
|---|---|
| `creates(Usecase\|Api, Entity)` | 作成 |
| `reads(Usecase\|Api, Entity)` | 参照 |
| `updates(Usecase\|Api, Entity)` | 更新 |
| `deletes(Usecase\|Api, Entity)` | 削除 |
| `relate(Entity, Entity, N:1)` など | エンティティ間関連。外部キー列を自動生成する（カーディナリティは **非クォート**、例: `N:1`。`N:M` は `.via(中間エンティティ)` が必須） |

### 相互作用

| 述語 | 意味 |
|---|---|
| `displays(Usecase, Screen)` | 画面表示 |
| `shows(Screen, Entity)` | 画面が見せるエンティティ |
| `navigates(Screen, Screen)` | 画面遷移（`.via(Usecase)` で遷移を起こすUC） |
| `invokes(Usecase, Api)` | API呼び出し |
| `has_permission(Actor, Permission)` | アクターが持つ権限 |
| `requires_permission(Usecase\|Api, Permission)` | 必要権限 |
| `requires_medium(Usecase\|Api, Medium)` | 媒体制約 |

### ライフサイクル

| 述語 | 意味 |
|---|---|
| `raises(Usecase\|ExtSystem, Event)` | イベント発行 |
| `triggers(Event\|Timer, Usecase\|Buc\|ExtSystem)` | イベントやタイマーがUC・BUCを起動する（タイマーは外部システムを起動できない） |
| `transitions(Usecase, Entity.col, from -> to)` | Enum 列上の遷移。遷移を起こすのはUC |
| `transitions(Usecase, Entity.col, (a, b) -> to)` | 遷移元を並べる形（v1.1.0）。遷移元ごとに1行ずつ書いたのと同じ |
| `sets(Usecase, Entity.col == val)` | 列への代入。`Entity.col == Source.col` で値をコピーする。`Date` / `DateTime` 列には `now` の時計上の点として数値を書ける（v1.1.0） |
| `drives(Usecase, Entity.col op rhs, true\|false)` | 比較命題の真偽を駆動する |
| `chooses(Usecase, Entity.col)` | バリエーション列の値をアクターが選び直す |
| `links(Usecase, Child, Parent)` | 既存の子の行を既存の親の行につなぐ（v1.1.0） |
| `relinks(Usecase, Child, Parent)` | つながっている子を、UCが束縛する親へ移す。同じ親でもよい（v1.1.0） |
| `unlinks(Usecase, Child, Parent)` | つながっている子を親から外す（v1.1.0） |
| `outbox(Event)` | 意図的な外部公開（未消費 warning 抑制） |

```rdra
transitions(CapturePayment, Order.status, pending -> paid)
sets(CapturePayment, Order.paid_at == present)

// 遷移元を並べる形。3行に分けて書いたのと同じ
transitions(CancelOrder, Order.status, (pending, held, confirmed) -> cancelled)

// Date列：`now` の時計上の点。時計が3を過ぎると expires_at < now が真になる
sets(Issue, Coupon.expires_at == 3)
```

遷移元の並びの後ろに `.when(Cond)` を付けると、すべての遷移をガードします。「すべての状態から」を表す `*` はありません。遷移先自身や終端状態を含むかに1つの答えがないので、遷移元を書き並べます。

v0.3.0でイベントを渡す `transitions(Entity.col, Event, from -> to)` が削除され、v0.4.0で `transitions(Entity.col, UC, …)` が `transitions(UC, Entity.col, …)` に変わりました。今はUCを先頭に書く形だけです。v1.0.0で `sets(UC, Entity, col == val)` も削除され、列は常に `Entity.col` で書きます。古い形は書き換え後の行を示すエラーで読み込みに失敗します。upstreamの `scripts/migrate-phase3.py`（v0.3.0向け）、`scripts/migrate-syntax-v2.py`（v0.4.0向け）、`scripts/migrate-syntax-v3.py`（v1.0.0向け）がモデルを書き換えます。

#### 既存の子をつなぐ：`links` / `relinks` / `unlinks`

`links(UC, Child, Parent)` は、子から親への `.optional()` のキーを通じて、既存の子を既存の親につなぎます。担当なしで開いた案件に担当を付ける、といった操作です。`relinks` はつながっている子をUCが束縛する親へ移し（同じ親でもよい）、`unlinks` は親を外します。3つとも同じ引数を取り、同じキーをたどります。

```rdra
entity Handler "Handler" { id: Int @pk  busy: Bool @default(false) }
entity Case "Case" { id: Int @pk  status: Enum(new, assigned) @default(new) }
relate(Case, Handler, N:1).optional()

usecase OpenCase "Open a case"
usecase Assign "Assign a handler to the case"
creates(OpenCase, Case)
transitions(Assign, Case.status, new -> assigned)
links(Assign, Case, Handler)
invariant(Case).when(status == assigned).has(Handler)
```

- 親は、そのステップが束縛する行です。UCが書く行、分割したUCの前のステップが書いた行、どちらもなければ存在する任意の親の順に選びます
- `links` はまだつながっていない子だけをつなぎます。つながっている子は動かしません。動かすのは `relinks`（必須キーも可）、外すのは `unlinks`（`.optional()` キーのみ）です
- キーがなければ `LinkWithoutKey`、`links` / `unlinks` のキーが必須なら `LinkOnMandatoryKey`、キーが複数あって `.role(role)` で選んでいなければ `AmbiguousOwnerLink` です。1つのUCが同じキーに2つの形を書くと `ConflictingLinks` です
- `check`、`states`、TLA+出力、`verify` は、作成時に設定するキーと同じようにこのつながりを読みます

### ルール

条件は比較式のみ（`col == val`、`stock < selling`、`status in (paid, shipped)`）。タプルや平坦な `col, val` は不可。規則には `.label("...")` で業務の言葉の名前を付けられます。

| 述語 | 意味 |
|---|---|
| `forbidden(Entity, conditions...)` | 到達禁止（局所） |
| `forbidden(A, B, conditions...).along(A, B)` | マルチエンティティ禁止（旧 `cross_*` / `forbidden_when` は削除） |
| `invariant(Entity).when(...).then(...)` | 含意形の不変条件 |
| `forbidden(...).when(Cond)` / `invariant(...).when(Cond)` | 条件 `Cond` の `holds` 本体の比較を、その場に書いたものとして読む（v1.1.0） |
| `invariant(Entity).when(...).none/has(...)` | 有限インスタンス上の量化（トップレベルの `when(...)` 規則は削除） |
| `required(Entity, conditions...)` | 必須条件 |
| `exclusive(Entity, conditions...)` | 排他（2条件以上） |
| `after(Usecase).assert(...)` | UC実行後の状態に対するアサーション |
| `property Name always/eventually/leads_to(...)` | 時間性質（`states` では未評価。TLA 向け） |

規則は対象エンティティを先頭の引数に書きます。v1.0.0で、条件から始まる `forbidden(Order.status == paid)` やエンティティなしの `invariant()` は削除されました。

v1.1.0から、`forbidden` と `invariant` の `.when(...)` に `condition` を渡せます。業務ルールを条件として1回書けば、UCのガードと規則の両方で使えます。

```rdra
condition PastDeadline "the deadline has passed"
holds(PastDeadline, Coupon.expires_at < now)

forbidden(Coupon, status == active).when(PastDeadline)
// 次と同じ規則
forbidden(Coupon, status == active, expires_at < now)
```

局所の規則、マルチエンティティの規則、量化のどれにも付けられます。`holds` は規則より後ろに書いてもかまいません。本体のない条件は `WhenConditionWithoutBody` です。本体に `.has` / `.none` / `.along` / `.role` がある場合や、局所の規則が読まないエンティティを比べる場合は `RuleWhenConditionScope` です。条件でないものを渡すと `RuleWhenArg` です。

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
| `--kind` | 図の種類（下表。既定 `rdra`） |
| `--format` | `mermaid` のみ（既定） |
| `--buc` | 特定BUCにスコープ（繰り返し可） |
| `--usecase` | 指定UCだけを描く（`usecase` / `robustness` / `sequence`。`sequence` は1つだけ必須） |
| `--entity` | 指定エンティティの状態モデルだけを描く（`state`） |
| `--node-kind` / `--edge-kind` | `rdra` 図をノード種別・関係種別で絞る |
| `-o` | `.mmd` ファイルに書く（省略時はstdout） |

`--show-description` は削除されました。`--kind rdra` は説明メタデータを `%% desc <id>: <text>` のコメント行として書きます。

### 図の種類

| kind | 用途 |
|---|---|
| `rdra` | RDRA レイヤ図（モデル全体の関係） |
| `context` | システムコンテキスト |
| `requirement` | 要求モデル |
| `business` | ビジネスコンテキスト / BUC |
| `usecase` | UC複合図 |
| `robustness` | ロバストネス図 |
| `sequence` | 1つのUCのシーケンス図 |
| `flow` | 業務フロー |
| `screen` | 画面遷移図 |
| `information` | 情報モデル（列なし） |
| `condition` | バリエーション・条件 |
| `er` | ER 図 |
| `state` | 状態遷移 |
| `event` | イベントのraises / triggersリンク |

`event-flow` は `event` に置き換わりました。`boundaryless-graph` / `business-area` / `diff` は削除されました。出力はMermaidだけで、テキストなのでdiffしやすいです。

```bash
rdra-ish diagram src/ --kind sequence --format mermaid --usecase PlaceOrder
rdra-ish diagram src/ --kind event --format mermaid
```

PlantUML出力は削除されました。

## レビュー表

```bash
rdra-ish csv <INPUTS...> --kind <KIND> [--format csv|markdown] [-o <out>]
```

| kind | 内容 |
|---|---|
| `actor` / `entity` | アクター一覧 / エンティティと列（既定 `entity`） |
| `matrix` | CRUD マトリクス |
| `api` | API 一覧 |
| `api-matrix` | API × エンティティのCRUDマトリクス |
| `screen-constraints` | 画面制約 |
| `permission-callables` | 権限ごとに呼べるUC/API |
| `actor-permission-audit` | 権限とアクター割当の監査 |
| `business-inputs` | 業務側の入力候補 |

要件トレーサビリティは `list --kind requirement` と `lint` で見ます。

## 状態導出

BUC横断で到達可能なエンティティ状態パターンを導出します（BFS）。

```bash
rdra-ish states <INPUTS...> [--entity <EntityId>] [--format table|csv|json|typescript] [--instance-count <N>] [--int-range-max <N>]
```

- 到達不能なenum variant
- 作成経路の欠落
- `forbidden` / `invariant` / `required` / `exclusive` 違反（マルチエンティティ含む）

ライフサイクルレビュー（Stage 6–7）では `states` と `diagram --kind state` / `--kind event` をセットで使います。Int / `now` の比較は `states` も境界（既定でInt `0..5`、1インスタンス）の範囲で探索します。時間性質は `states` では扱わず [形式検証](/projects/rdra-ish/formal-verification/) へ。

## 機械可読エクスポート

```bash
rdra-ish export <INPUTS...> --kind <KIND> [--out <path>]
```

| kind（例） | 内容 |
|---|---|
| `openapi` / `asyncapi` | API・イベント契約のたたき台 |
| `dbml` / `json-schema` | 論理スキーマ |
| `typescript-states` | 状態ユニオン（TS） |
| `mermaid-er` | Mermaid の ER 図 |
| `tla` | TLA+ Spec + TLC `.cfg` |

exportは **レビュー起点のたたき台** です。モデルを更新した後に再生成し、差分をレビューする運用を前提とします。

生成系サブコマンドはparse/resolve errorがあると成果物を出しません。ライフサイクルのerrorで止まる（**fail-closed**）のは、到達性の結果を印字する出力（`diagram --kind state`、`export --kind typescript-states`）だけです。`states` は `[error]` 行を含めて出力し、非ゼロで終了します。`list`、`csv`、ほかの図やexportは書き出し、stderrにnoteを出します。詳細は [CLI リファレンス](/projects/rdra-ish/cli-reference/#ライフサイクルのerror) を参照してください。

## 検証コマンド

```bash
rdra-ish check src/
rdra-ish next src/
rdra-ish fmt src/ --check
rdra-ish states src/ --entity Order
# 形式検証（TLC が PATH にある場合）
rdra-ish verify src/ --backend tlc -o /tmp/rdra-tla
```

## レビューの観点

構造は `check` でerrorゼロを前提にし、カバレッジは `csv --kind matrix`、境界は `diagram --kind sequence --usecase <UC>`、アクセスは `csv --kind actor-permission-audit` で見ます。ライフサイクルは `states` と `diagram --kind state`、厳密な比較・時間性質は `export --kind tla` / `verify --backend tlc`。トレーサビリティは `list --kind requirement` と `lint` です。

## 次に読む

- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
