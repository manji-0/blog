---
title: "言語リファレンス"
description: "rdra-ish DSL（.rdra）の構文概要（main 169cdf3）"
sidebar:
  order: 6
---

対象：main `169cdf3`（v3.0.0以降の未リリース版）。

このページは `.rdra` の構文と、同じモデルから出せる図・表・エクスポートの概要です。各構文の診断名や細かな規則は省いています。完全な仕様はupstreamの [docs/language-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/language-reference.md) を参照してください。

モデルは層ごとに1つのレビューの問いに答えます。

| 層 | 主なkind | 問い |
|---|---|---|
| 要求とトレーサビリティ | `goal` `requirement` `adr` `nfr` `quality` `constraint` | なぜ存在し、どの品質基準が効くか |
| ビジネス | `business` `buc` `flow` `step` `timer` `medium` | どの業務価値に、どの順で役立つか |
| インタラクション | `actor` `usecase` `screen` `field` `event` | 誰がどの画面で何をし、何を引き起こすか |
| システム境界 | `system` `extsystem` `api` `dto` `permission` | どの境界が操作を持ち、誰が呼べるか |
| データ | `entity` `variation` `condition` | 何を保存し、どう関連するか |
| ライフサイクルと規則 | `transitions` `chooses` `sets` `drives` `links`、規則、`after`、`property` | どの状態に到達でき、どれが禁止か |

## ファイル構造とインポート

1つの `.rdra` ファイルには、省略可能な `module` 宣言と `import` 宣言を書きます。その後に、インスタンス宣言・エンティティ本体・述語・規則を任意の順で並べます。

```rdra
module buc.order

import shared.actors                // every name, in flat scope
import shared.actors as a           // names under the alias: a.Staff
import shared.actors.{Staff}        // one name, in flat scope
import shared.actors.{Staff as S}   // one name under a local alias
```

- コメントは `//` の行コメントと `/* ... */` のブロックコメントです。`#` は構文エラーです
- `import` はファイルではなくモジュールを指します。読み込んだファイルの `module` 行で解決し、未読み込みなら `import a.b` を `a/b.rdra` として探します
- `import` を書いたファイルだけが閉じたスコープになります。`import` のないファイルは、読み込んだ全ファイルから素の名前を解決します
- 1つのIDが複数のkindを指すときは `usecase::Cancel` のようにkindを前置します

```rdra
contains(BucOrder, usecase::Cancel)
raises(usecase::Cancel, event::Cancel)
```

## 宣言とkind

```
<kind> <Id> "Label" [description "Text"] [clauses...]
```

IDはkindの中で一意で、慣例はUpperCamelCaseです。メタデータ節の値は、自由文なら引用符付きの文字列、識別子や数値1つなら裸のトークンです（`priority must`、`target "<=300"`）。

| 層 | kind | 説明 |
|---|---|---|
| 要求 | `goal` | 要求が目指す成果。`metric` `baseline` `target` `window` で測り方を書く |
| 要求 | `requirement` | BUCを動機付け、ゴールを達成する要求。`status "out-of-scope"` でやらないことを表す |
| 要求 | `adr` | アーキテクチャ決定記録。`decides` で影響先をつなぐ |
| 要求 | `nfr` / `quality` / `constraint` | 非機能要求、品質特性、監査や保持期間などのガードレール |
| ビジネス | `business` / `buc` | 業務領域と、その中の業務価値の単位 |
| ビジネス | `flow` / `step` | BUC内の業務フローとステップ |
| ビジネス | `timer` | UCを起動するスケジュール（RDRAのタイマー） |
| ビジネス | `medium` | 端末や操作媒体 |
| インタラクション | `actor` | UCを実行する人 |
| インタラクション | `usecase` | 画面を表示し、エンティティを読み書きする具体的な操作 |
| インタラクション | `screen` / `field` | 画面と画面項目 |
| インタラクション | `event` | UC間、UCと外部システム間のドメインイベント |
| システム境界 | `system` / `extsystem` | 内部システム境界と外部システム |
| システム境界 | `api` / `dto` | UCが呼ぶAPIと、そのペイロード形 |
| システム境界 | `permission` | アクターに割り当てる権限 |
| データ | `entity` | 論理データモデル（表に近い永続構造） |
| データ | `variation` | アクターが選ぶ値の閉じた集合（RDRAのバリエーション） |
| データ | `condition` | バリエーションと状態モデルで業務ルールを選ぶ条件。`holds` 本体を持つとガードになる |

```rdra
goal ShortWait "受付から診察までの待ち時間を短くする"
  metric "受付から診察開始までの中央値"
  baseline "45分"
  target "30分"
  window "月次"
achieves(ReqSwiftCheckIn, ShortWait)

usecase CapturePayment "Capture payment"
  precondition "The order is authorized."
  error "Authorization expires before capture."
```

UCの `precondition` や `guard` などはレビュー用の文です。`check` と `verify` は評価しません。検査する事後条件は `after(UC).assert(...)`、ガードは `condition` で書きます。

`usagescene`、`timing`、`uses`、`location`、`state`、`concept`、`domain_object` などのkindは削除済みです。使うと、置き換え先を示すエラーで読み込みに失敗します。状態は `transitions` が名指す `Enum` 列の値から導出します。

## エンティティ本体

```rdra
entity Order "Order"
  table "orders"
  rows 5000 {
  id: Int @pk
  total: Money(12, 2)
  delivered_at: DateTime @null
  status: Enum(pending "受付前", paid "支払済", shipped, cancelled) @default(pending) @end(shipped, cancelled)
}
```

- 列は `name: Type [annotations...]` です。DTOの本体も同じ形で、`@null` は省略可能なフィールドを表します
- `table "name"` は `export --kind sql` と `dbml` で使う表名です。ほかの出力や規則名はエンティティIDのままです
- `rows <n>` は表の行数の見積もりです。`lint` の `query-index-missing` は10,000行未満のエンティティを飛ばします

### 列の型

| 型 | 意味 |
|---|---|
| `Int` | 整数 |
| `String`, `String(n)` | 文字列（最大 `n` 文字） |
| `Money`, `Money(p, s)` / `Decimal`, `Decimal(p, s)` | 金額と10進数。`p` 桁、小数点以下 `s` 桁 |
| `DateTime`, `DateTime(tz)`, `DateTime(local)` / `Date` | 日時と日付 |
| `Bool` | 真偽値。状態の軸になる |
| `Enum(a, b, c)` | インラインの値集合。`transitions` が動かすと状態モデルになる。値にラベルを付けられる |
| `<VariationId>` | バリエーションの値の1つ。属性であり、状態の軸にもライフサイクルにもならない |

型引数はスキーマ用です。`export --kind sql` / `dbml` / `json-schema` が出力し、`check` / `states` / `verify` は無視します。規則の中の `Int` や `Decimal` は `0..--int-range-max`（既定 `0..5`）の範囲を動きます。

### 列のアノテーション

| アノテーション | 意味 |
|---|---|
| `@pk`, `@pk(a, b)` | 主キー。複合キーも書ける |
| `@unique`, `@unique(a, b)` | 一意制約。ライフサイクルは `Unique_<Entity>_<columns>` として検査する |
| `@index`, `@index(a, b)` | インデックス |
| `@null` | nullを列の値の1つに含める（[nullの扱い](#nullの扱い)） |
| `@default(v)` | 開始値。`Enum` ならその値、`Bool` なら `true` / `false` |
| `@default(now())`, `@default(uuid())` | DBが計算する既定値。ライフサイクルは作成時に `present` とみなす |
| `@on_update(now())` | 更新のたびに現在日時を書く |
| `@generated(identity \| uuid \| ulid)` | キーの作り方 |
| `@version` | `Int` の楽観ロック版数。更新ごとに確認して1増やす |
| `@check(expr)` | 自エンティティの列に対する検査。`Check_<Entity>_<column>_<n>` として検査する |
| `@derived(expr)` | 自エンティティの列から導出する値。`Bool` なら条件、数値なら `+` `-` `*` を1つ |
| `@end(v, ...)` | 行がずっと留まってよい状態。そこではデッドロックを報告せず、状態図は終了状態を描く |
| `@label("...")` | 列の表示ラベル |
| `@soft_delete` / `@history` / `@tenant` | 論理削除、履歴、テナント識別子の目印 |

`@check(...)` と `@derived(...)` は引用符なしで式を書きます（`@check(status == open or closed_at == present)`）。外部キーを表すアノテーションはありません。キー列は手で書かず、`relate` に生成させます。

```rdra
entity Product "Product" {
  id: Int @pk @generated(identity)
  sku: String(32) @unique
  created_at: DateTime @default(now())
  updated_at: DateTime @on_update(now())
  revision: Int @version
  qty: Int @null @check(qty == null or qty >= 1)
  bulk: Bool @derived(qty >= 3)
}
```

### `relate` と生成されるキー

```rdra
relate(OrderLine, Order, N:1)                     // OrderLine.order_id
relate(Shipment, Order, 1:1)                      // Shipment.order_id, unique
relate(Order, Product, N:M).via(OrderProduct)     // OrderProduct.order_id, OrderProduct.product_id
relate(Order, Address, N:1).role(ship_to)         // Order.ship_to_id
relate(OrderLine, Product, N:1).references(sku)   // OrderLine.product_sku
relate(OrderLine, Order, 1..*:1)                  // every Order has an OrderLine
```

`relate(Child, Parent, Card)` は子に `{role}_{親のキー列}` のキー列を生成します。カーディナリティは引用符なしの `1:1` `1:N` `N:1` `N:M` です。

| チェーン | 意味 |
|---|---|
| `.optional()` | キーをnull可にする。子は親なしで存在できる |
| `.via(Junction)` | `N:M` に必須の中間エンティティ |
| `.role(name)` | キーに名前を付ける。同じ親への2本のキーには別の役割名が要る |
| `.key(col, ...)` | 生成せず、子が宣言した列をキーとして採用する |
| `.references(col, ...)` | 親の主キー以外の一意な列を参照する |
| `.on_delete(...)` / `.on_update(...)` | `cascade` `restrict` `set_null` `set_default` `no_action` |

子の側には `lo..hi` の範囲を書けます。最小1は `MinCard_<Child>_<role>`、1より大きい最大は `MaxCard_<Child>_<role>` として検査します。

## 関係述語

述語は宣言済みのインスタンスをIDでつなぎます。主なものを用途ごとにまとめます。全体の一覧はupstreamの [Relationship predicates](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/language-reference.md#relationship-predicates) にあります。

### スコープと所有

| 述語 | 意味 |
|---|---|
| `performs(Actor, UseCase \| Buc \| Step)` | アクターが実行する。BUCに書くと、BUCの全UCとその権限が対象になる |
| `belongs(Buc, Business)` | BUCが業務領域に属する。`.by(...)` で媒体を記録する |
| `contains(...)` | 包含。`(Buc, UseCase \| Flow)`、`(Flow, Step)`、`(Screen, Field)`、`(System, Api)` |
| `owns(System, Entity)` | システムがエンティティに責任を持つ |
| `exposes(System, UseCase \| Event \| Entity)` | 他のモデルへ要素を公開する。エンティティには `.append()` か `.upsert()` を付ける |
| `shares(System, Entity)` | 内部エンティティを他のモデルから名指しさせる（warning `SharedInternalEntity`） |
| `motivates` / `achieves` / `decides` | 要求とBUC、要求とゴール、ADRと影響先 |
| `applies_to` / `qualifies` / `constrains` | NFRや条件の適用先、品質特性、制約の適用先 |

### データ操作

| 述語 | 意味 |
|---|---|
| `creates` / `reads` / `updates` / `deletes` `(UseCase \| Api, Entity)` | CRUD。`deletes` は1行を消す |
| `invokes(UseCase, Api)` | UCがAPIを呼ぶ。APIの書き込みはUCの1トランザクションになる |
| `request` / `response` / `error_response` `(Api, Dto)` | APIのペイロード |
| `maps_field(Field \| Dto.field, Entity.column)` | 項目を列に対応付ける |
| `coordinates(UseCase, Entity, Entity)` | システム境界をまたぐ関連をUCが整合させる |

`reads` にはチェーンで行の探し方を書けます。`lint` は読み取りに必要なインデックスを示し、`export --kind sql` はそのインデックスと `SELECT` を書きます。

```rdra
reads(ListOrders, Order).by(customer_id, status).order(created_at.desc).page(cursor)
reads(OrderTotals, Order).by(customer_id).sum(total)
```

| メソッド | 意味 |
|---|---|
| `.by(a, b)` | 各列を値と等値比較する |
| `.order(a, b.desc)` | 並び順。`.desc` は降順 |
| `.page(cursor)` / `.page(offset)` | キーセットのページングか `LIMIT` / `OFFSET`。`cursor` は `.order` が必要 |
| `.count()` / `.sum(column)` | 件数か合計の1行。`.order` や `.page` と併用しない |

### インタラクション

| 述語 | 意味 |
|---|---|
| `displays(UseCase, Screen)` / `shows(Screen, Entity)` | UCが画面を表示する / 画面がエンティティを見せる |
| `navigates(Screen, Screen)` | 画面遷移。`.via(UseCase)` で遷移を起こすUCを書く |
| `raises(UseCase \| ExtSystem, Event)` | イベントを発行する。外部システムからは受信方向 |
| `triggers(Event \| Timer, UseCase \| Buc \| ExtSystem)` | UCやBUCを起動する。外部システムへは送信方向。タイマーはUCかBUCだけ |
| `outbox(Event)` | モデル外へ公開するイベント。未消費のwarningだけを抑える |
| `has_permission` / `requires_permission` / `requires_medium` | 権限の保持と、UCやAPIが要る権限・媒体 |
| `precedes` / `branches` / `excepts` / `repeats` `(Step, Step)` | 主経路、分岐、例外、繰り返し |
| `covers(Step, UseCase \| Api \| Event \| Timer)` | ステップが要素を業務の意味に結び付ける |

### ライフサイクル

| 述語 | 意味 |
|---|---|
| `transitions(UseCase, Entity.col, from -> to)` | `Enum` 列の状態遷移。`(a, b) -> z` は遷移元ごとの1行と同じ |
| `sets(UseCase, Entity.col == value)` | UCが残す列の値 |
| `drives(UseCase, Entity.col op rhs, true \| false)` | 比較命題の真偽を直接動かす |
| `chooses(UseCase, Entity.col[, value])` | アクターがバリエーションの値を選び直す |
| `links` / `relinks` / `unlinks` `(UseCase, Child, Parent)` | 既存の子を親へつなぐ、移す、外す |

```rdra
transitions(CancelOrder, Order.status, (pending, held, confirmed) -> cancelled)
transitions(DecideFiling, InventionDisclosure.status, searched -> decided_file).when(RightsAcquired)
transitions(DecideFiling, InventionDisclosure.status, searched -> decided_secret)
```

- 1つのUCが同じ状態から複数の遷移を持つと、1回の実行でアクターが1つを選びます
- `.when(Condition)` はその遷移だけをガードします。`applies_to(Cond, UC)` はUCのすべてのステップをガードします
- `*` はありません。遷移元を書き並べます
- 1つのエンティティが `transitions` で動かす `Enum` 列を複数持つと、各列が独立した状態モデルです

`sets` の値は列の型で決まります。

```rdra
sets(Capture, Payment.status == captured)          // Enum: a value
sets(Restock, Stock.stock == 3)                    // Int, Money, Decimal: a number
sets(Issue, Coupon.expires_at == 3)                // Date, DateTime: a point on the clock
sets(Login, UserAccount.last_login_at == present)  // @null: present
sets(Logout, Session.token == null)                // @null: null
sets(RegisterPermit, BusinessPermit.business_type == PermitApplication.business_type)  // a copy
sets(ExtendPeriod, Extension.due_on == 3).when(ExpertInquiry)                          // guarded
```

- 1つのUCが同じ列に2つの値を残すと `ConflictingEffects` です。値を選ぶなら `.when(Cond)` 付きの行を値ごとに書き、ガードを互いに排他にします
- コピー元は、そのステップが束縛する行（UCが書く行、前のステップが書いた行、または `relate` の親）です
- `now` は値ではありません。現在時刻を刻む列は `@null` にして `present` を書きます
- 比較式を `sets` に書いても何も起きません（`SetsNoEffect`）。比較の真偽は `drives` で動かします

```rdra
drives(Sell, Stock.stock < selling, true)
drives(Refund, Stock.stock < selling, false)
chooses(DraftResponse, OfficeAction.amendment, free).when(FirstNoticeOnly)
chooses(DraftResponse, OfficeAction.amendment, limited)
```

`links` は `.optional()` のキーでまだ親のない子をつなぎます。`relinks` はつながっている子を移し（必須キーも可）、`unlinks` は外します（`.optional()` のキーだけ）。親は、UCが書く行、前のステップが書いた行、存在する任意の親の順に決まります。

```rdra
relate(Case, Handler, N:1).optional()
transitions(Assign, Case.status, new -> assigned)
links(Assign, Case, Handler)
relinks(Reassign, Case, Handler)
unlinks(Release, Case, Handler)
```

`deletes(UC, Parent)` の子の扱いは、キーの `.on_delete` で変わります。

| `.on_delete` | ライフサイクルでの意味 |
|---|---|
| なし、`restrict`、`no_action` | 存在する子が行を指す間は削除できない。`DanglingKey_<Child>_<role>` を検査する |
| `cascade`、`set_null`、`set_default` | 検証はこの動作を実行しない。削除はでき、子は消えた行を指したまま残る。`DanglingKey_*` は検査しない |

検証が参照動作を実行しないことを、2つのwarningが知らせます。

- `DeleteLeavesChildren`: `cascade` の親を消し、子を消さないUCに出ます。1回の実行で子を1行消すには `deletes(UC, Child)` を加えます
- `DeleteLeavesChildKeys`: `set_null` か `set_default` の親を消し、子を消さずキーも動かさないUCに出ます。1回の実行で子1行のキーを外すには `unlinks(UC, Child, Parent)` を加えます。キーに既定値を書く操作はないので、`set_default` にぴったり対応する書き方はありません

1回の実行で消せる子は1行です。そのため2インスタンスの範囲では、明細が2行ある注文は、`restrict` のキーでは削除できないままです。

`export --kind sql` は `ON DELETE CASCADE` などの動作を書きます。そのDBでは子が消えるか、キーが外れるか既定値に戻ります。上の2つのwarningは、検証したモデルとそのDBが食い違うUCを示します。生成するGo・Rust・TypeScriptのコードも参照動作を実装しません。モデルの削除と同じく1行だけを消し、動作は未検査の義務 `OnDelete_<Child>_<columns>` として残します。

`@soft_delete` 列を持つ親は削除せず、印を付けるだけです。ガードと `DanglingKey_*` はなく、どちらのwarningも出ません。削除の読み方の定義は [意味論 D9](/projects/rdra-ish/theory/semantics/#d9) にあります。

## 規則

規則は、到達できる状態についての事実を書きます。到達できる状態が規則を破るときだけ報告します。対象エンティティを先頭の引数に書き、条件は比較式です。

| 規則 | 形 | 名前 |
|---|---|---|
| `forbidden(E, c1, c2, ...)` | すべての条件を満たす到達状態がない | `Forbidden_<E>_<n>` |
| `invariant(E).when(g...).then(r...)` | ガードが成り立てば要求も成り立つ | `Inv_<E>_<n>` |
| `required(E, c1, ...)` | すべての到達状態が条件を満たす | `Required_<E>_<n>` |
| `exclusive(E, c1, c2, ...)` | 2つ以上の条件を同時に満たす状態がない | `Exclusive_<E>_<n>` |
| 複数エンティティの `forbidden` / `invariant`、または `.along` 付き | 行の組み合わせに対する規則 | `MultiForbidden_<E>_<n>` / `MultiInv_<E>_<n>` |
| `invariant(E).when(...).has(...)` / `.none(...)` | 関連する行の量化 | `Quantifier_<E>_<n>` |
| `after(UseCase).assert(...)` | UCの各実行が残す状態 | `AfterAssert_<UseCase>_<i>` |

v2.0.0で、複数エンティティの規則名は `Cross*` から `Multi*` に変わりました。

```rdra
forbidden(Order, status == delivered, refunded == true)
invariant(Order).when(status == delivered).then(delivered_at == present)
required(Order, status == paid, paid_at == present)
exclusive(Order, cancelled_at == present, delivered_at == present)

invariant(Order, Payment).along(Order, Payment).when(Order.status == paid).then(Payment.status == captured)
invariant(Member).at_most(3, Loan.status == open)
invariant(Member).when(status == withdrawn).none(Loan.status == open).along(Member, Card, Loan)

after(Pay).assert(Order.status == paid, Payment.status == captured).label("A paid order has a captured payment")
```

- 複数エンティティの規則では列を `Entity.column` で書きます。`.along(A, B, ...)` がなければ、つながっていない行の組にも成り立つ必要があります
- `lint` の `multi-rule-unscoped` は、キーで関連するのに `.along` がない規則を指摘します。すべての組を意図するなら `.global()` を書きます
- `.at_most(n, ...)` / `.at_least(n, ...)` / `.exactly(n, ...)` は関連する行を数えます
- `.label("...")` は規則に業務の言葉の名前を付けます。違反は `「label」: ` で始まります
- `.lemma()` は `verify --prove` を助ける補題の印です。`check` は補題も検査します。`verify` は補題だけのconeを作りませんが、同じものを読む別の規則のconeで検査し、違反すれば失敗します
- 何も主張せずに成り立つ規則には、warning `Vacuous_<name>` を出します
- `after(UC).assert(...)` は、何も変えない最後のステップでは評価しません。TLA+ の `[][…]_vars` が足踏みを許すのと同じです。最後のステップが常にそうなら、warning `Vacuous_AfterAssert_*` が出ます

`.when(Cond)` には `condition` を渡せます。規則は、その条件の `holds` 本体を書いたものとして読みます。業務ルールを条件として1回書けば、UCのガードと規則の両方に使えます。

```rdra
condition PastDeadline "the deadline has passed"
holds(PastDeadline, Coupon.expires_at < now)
applies_to(PastDeadline, Expire)

invariant(Coupon).when(PastDeadline).then(status == expired)
forbidden(Coupon, status == active).when(PastDeadline)
```

### 補題が読む印

`.lemma()` を付けた規則だけは、行の印（実行中の分割UCや発行済みのイベント）を読めます。証明に要る、途中の実行や発行についての事実を書くためです。

| 条件 | 成り立つとき |
|---|---|
| `E.in_run(UC)` | 分割したUC `UC` のステップが、その行で実行中である |
| `E.in_run(UC, k)` | その行のUCの実行が、ステップ `k` を終えて次をまだ行っていない |
| `E.raised(Ev)` | その行の `Ev` のラッチが立っている |

```rdra
forbidden(Light, Door, Light.state == off, Door.in_run(Open)).global().lemma()
invariant(Sign).when(Sign.raised(EvShut)).then(Sign.state == dark).lemma()
```

- 印は `forbidden` の条件か、`invariant` の `.when(...)` と `.then(...)` に書きます。ほかの場所や `.lemma()` のない規則では `MarkOutsideLemma` です。ほかの規則の意味は変わりません
- ライフサイクルに変数のない印はerror `NoSuchMark` です。1トランザクションのUC、範囲外の `k`、ラッチを持たないイベント（ラッチを読むのは `.counted` のない `triggers` だけ）が当たります。`k` が0なら `MarkStepOutOfRange` です

### 条件とガード

`condition` はトレーサビリティだけの形と、`holds` 本体を持つ形があります。本体を持つ条件は、`applies_to` 先のUCやAPIをガードします。

```rdra
condition CopayCappedAtLimit "窓口負担は限度額までとする"
combines(CopayCappedAtLimit, BurdenRatio)
combines(CopayCappedAtLimit, Appointment.status)
applies_to(CopayCappedAtLimit, CalculateVisitBill)

condition NoActiveAssignment "有効な割当がない証明書だけ失効できる"
holds(NoActiveAssignment, ClientCertificate.status == active).none(TerminalCertAssignment.status == active)
applies_to(NoActiveAssignment, Revoke)

holds(SettlementSigned, Settlement.status == agreed).along(Claim, ClaimCase, Settlement)
```

- 本体の比較はAND結合です。選択肢は `in (...)` と `not in (...)` で書きます
- UCが書くエンティティの比較はその行を読みます。作る行ならステップ後の新しい行を読みます
- ほかのエンティティの比較は、条件を満たす行がどこかに存在すれば成り立ちます。関連する行を読むなら `.along` でキーの経路を書きます
- キーで結べないエンティティを比べると、warning `UnjoinedGuardRead` を出します

### 比較式

| 演算子 | 列の型 |
|---|---|
| `<` `>` `<=` `>=` | `Int` `Money` `Decimal` `Date` `DateTime` |
| `==` `!=` | すべて |
| `in (...)` / `not in (...)` | `Enum`、バリエーション、`Bool`、`@null`。整数リテラルなら数値型も |

右辺の素の識別子は、左辺の列の型で読みます。`Enum`、バリエーション、`Bool` の列なら値です。そのほかの `@null` 列なら `null` か `present`、ほかは列名です。`now` は `Date` / `DateTime` 列との比較で使う時計です。数値と日付の列は `0..5` の変数になり、`now` は5まで進みます。

## 時間性質

`property` は `verify` だけが検査します。`check` と `states` は評価しません。`check` に守らせたい規則は `forbidden`、`invariant`、`after` で書きます。

```rdra
property PaidLeadsToShipped "paid eventually reaches shipped"
  leads_to(Order.status == paid, Order.status == shipped)

property NeverBoth "mutex"
  always(not ((Order.status == paid) and (Order.status == cancelled)))

property GrantEnds "a granted application is registered or dismissed"
  leads_to(Application.status == granted, Application.status in (registered, dismissed)).fair(Register, Dismiss)

property CancelledStaysCancelled
  stable(Order.status == cancelled)

property AmountKeptOnceApproved
  unchanged(Order.amount).when(Order.status in (approved, shipped))

property ShippedAfterPaid
  precedes(Order.paid == true, Order.status == shipped)

property OrderCanFinish "every order can still be delivered or cancelled"
  can_reach(Order.status in (delivered, cancelled))
```

| 形 | 意味 |
|---|---|
| `always(p)` | 存在する行で常に `p` が成り立つ |
| `eventually(p)` | 存在する行ごとに、いつか `p` が成り立つ |
| `leads_to(p, q)` | 存在する行で `p` が成り立てば、いつか `q` が成り立つ |
| `stable(p)` | 一度成り立った `p` は、行が存在する限り保たれる |
| `unchanged(E.col, ..).when(p)` | `p` が成り立つ間、列の値が変わらない |
| `precedes(p, q)` | `q` が成り立つとき、`p` は今かそれ以前に成り立った |
| `can_reach(p)` | どの到達状態からも、行が存在したまま `p` に至る経路が残っている。CTLの `AG (present => E[present U (present /\ expr)])` |

- 結合子は `and` / `or` / `not` です（`/\` `\/` `~` は別名）
- `.fair(UseCase, ...)` は `eventually` / `leads_to` が前提とする、インスタンスごとの弱公平なUCを書きます。安全性の性質や `can_reach` には付けられません。公平性の定義は [意味論 D20](/projects/rdra-ish/theory/semantics/#d20) にあります
- 複数エンティティを読む性質は `.along(...)` で行の組を絞ります
- `can_reach` はTLA+で書けないので、`verify` が自前の探索で判定します

### 削除とゴール: `.present()`

`present` を読むのは、性質が行について語り始める箇所です。`always` の全体と、`eventually` / `leads_to` のトリガーが当たります。ゴールは、行が存在するかどうかにかかわらず読みます。削除した行の列は基底値に戻るので、削除は基底値が満たすゴールを満たします。`pending` が `@default` なら、`leads_to(Order.status == paid, Order.status == pending)` は支払済みの注文がいずれ削除されるモデルで成り立ちます。

```rdra
property HeldReleased "a held order is released"
  leads_to(Order.held == true, Order.held == false).fair(Release).present()
```

- `.present()` を付けると、`eventually` か `leads_to` のゴールに、束縛したすべての行の存在を求めます。ゴールの前に行が削除されると、ゴールは満たされず、性質が破れます
- 引数はとりません。1回だけ書き、`.fair` `.along` `.role` `.global()` の前後どちらにも置けます
- `always` `stable` `unchanged` `precedes` `can_reach` に付けると `PresentOnNonGoalProperty` です。引数付きや2回書くと `PresentRequiresNoArguments` です
- 行を削除するUCがあり、ゴールがその行の基底値で成り立つなら、`check` と `verify` はhint `info[GoalMetByDelete_*]` を出します。warningではありません。削除でゴールを満たしたくないなら `.present()` を付けます
- cone、縮約、インスタンスの対称性は `.present()` がなくても同じです。TLCも同じ式を検査します

付けないときの読み方は既定のままです。定義は [意味論 D21](/projects/rdra-ish/theory/semantics/#d21) にあります。

検査の仕組みは [形式検証](/projects/rdra-ish/formal-verification/) を参照してください。

## イベントとタイマー

```rdra
transitions(ExecuteCertIssue, CertificateOrder.status, requested -> executed)
raises(ExecuteCertIssue, EvOrderExecuted)
triggers(EvOrderExecuted, IssueCert)
creates(IssueCert, ClientCertificate)
relate(ClientCertificate, CertificateOrder, N:1)
after(IssueCert).assert(CertificateOrder.status == executed)

timer IntakeExpiryCheck "Nightly intake expiry check"
triggers(IntakeExpiryCheck, ExpireIntakeForms)
```

UCが発行するイベントで起動されるUCは、そのイベントを発行したUCが実行された後に、同じ行の上でだけ実行されます（v2.0.0から）。

- 発行側の最後のステップが行に記録を残します。起動されるUCの最初のステップは、記録のある行（自分の行、発行側のキーでたどる親、キー1本で結ばれる行）でだけ実行されます
- 記録はラッチです。一度発行されれば、起動されるUCは状態とガードが許す限り何度でも実行されます
- `triggers(Ev, UC).counted(k)` は発行回数を数えます。発行1回につき実行1回です。保留が `k` を超える発行は違反 `EventOverflow_<E>_<Ev>_<UC>` です
- 発行側は、起動されるUCを待ちません
- 複数のイベントで起動されるUCは、そのどれかの後に実行されます。トレースでは `<UC>_by_<Ev>` と表示します
- タイマーと外部システムが発行するイベントは自由なトリガーです。状態とガードが許せばいつでも実行されます
- イベントなしでも始まるUCは、始まる地点で発行する2つ目のイベントと、2つ目の `triggers` を書きます

`triggers(Event, Buc)` は、入口のUCが決まる前に「このイベントがこのBUCを始める」ことを書く形です。タイマーには引数がありません。期限は行の `Date` 列に持たせ、タイマーのUCを `due_on <= now` のような条件でガードします。

## nullの扱い

`@null` 列は、型にかかわらず `null` を値の1つとして持ちます。比較は常に真か偽で、不明にはなりません。

- 値を与えず `@default` もない `@null` 列は、作成時に `null` から始まります。`Enum` と `Bool` も同じです（`color: Enum(red, blue) @null` は `red` ではなく `null` から始まる）
- nullの列は、値・列・`now` とのどの比較も満たしません。`!=` は常に満たします
- 2つのnullの列は等しくありません。`qty == lim` は偽、`qty != lim` は真です
- `col == null` と `col == present` はnullそのものを問います。`color in (red, null)` はnullで成り立ちます
- `not` は二値の結果を反転します。`x` がnullの間、`not (x < 3)` は成り立ち、`x >= 3` は成り立ちません。順序比較とその否定の書き換えは、nullでだけ食い違います
- 論理的な `@derived` 列だけは例外で、SQLと同じく比較を読みます。`qty` がnullの間、`@derived(qty in (1, 2))` もnullになり、`not` を付けてもnullです
- 一意制約もnullを同じように読みます。2つのnullの行は衝突しません
- `@default(null)` は `Enum` や `Bool` の値ではありません

`x` と `y` を両方nullの `Int @null`、`k` を3を持つ `Int` とすると、比較は次のとおりです。各セルは「`l op r` が成り立つか / `not (l op r)` が成り立つか」です。upstreamはこの表をテストで計算しています。

| 左, 右 | `==` | `!=` | `<` `<=` `>` `>=` |
|---|---|---|---|
| `x`, `3` / `x`, `k` / `k`, `x` / `x`, `y` | false / true | true / false | false / true |

| 比較 | 成り立つか / `not` で成り立つか |
|---|---|
| `x == null` | true / false |
| `x != null` | false / true |
| `x in (1, 3)` | false / true |
| `x not in (1, 3)` | true / false |

つまり `required(Item, qty >= 0)` はnullの `qty` で失敗し、`qty: Int @null @check(qty >= 1)` はnullの間ずっと失敗します。nullを許す規則は `@check(qty == null or qty >= 1)` のように明示します。

lintのwarning `negated-order-admits-null` は、nullable列の `<` `<=` `>` `>=` に `not` をかけた箇所を指摘します。対象は `@check` と `property` で、`check`、`lint`、エディタが表示します。同じ式が列のnullを名指していれば（`qty == null or ...`）指摘しません。nullを除くなら `qty >= 1` と順序比較そのものを書き、nullを許すなら `qty == null or qty >= 1` と書きます。`!=` と `not in` はどの規則でもnullで成り立つので指摘しません。比較の定義は [意味論 D5](/projects/rdra-ish/theory/semantics/#d5) にあります。

## 図

```bash
rdra-ish diagram <INPUTS...> --kind <KIND> [--buc <ID>]... [--usecase <ID>]... [--entity <ID>]... [--actor <ID>]...
rdra-ish diagram <INPUTS...> --all -o <DIR>
```

出力はMermaidだけです。kindは既定の `rdra` と、RDRA 3.0の図に対応する13種類です。

| kind | RDRAの図 | 描くもの |
|---|---|---|
| `rdra` | RDRAGraph | すべての要素と関係を層ごとに |
| `context` | システムコンテキスト | アクターと外部システムからシステムへの導出エッジ |
| `requirement` | 要求モデル | ゴール、要求、動機付けるBUC。やらないことは別枠 |
| `business` | 業務の流れ図 | 業務領域とBUC、イベントによるBUC間の受け渡し |
| `usecase` | UC複合図 | UCとアクター、画面、エンティティ、イベント、条件、遷移 |
| `robustness` | ロバストネス図 | アクター、境界、制御、エンティティ |
| `sequence` | シーケンス図 | 1つのUCの順序。ガード、書き込み、発行するイベント |
| `flow` | 業務フロー | フローとステップ、アクターごとのレーン |
| `screen` | 画面遷移図 | `navigates` と、フローから導く業務上の順番 |
| `information` | 情報モデル | エンティティの関連、状態モデル、バリエーション |
| `condition` | バリエーション・条件 | 条件と、組み合わせるバリエーションと状態モデル |
| `state` | 状態モデル | スコープなしなら一覧。`--entity` か `--buc` で状態モデル全体 |
| `event` | システム間連携 | `raises` と `triggers` のつながり |
| `er` | 論理データモデル | 列とカーディナリティを持つ `erDiagram` |

- `--buc` はすべてのkindで使えます。BUCから到達する範囲だけを描きます
- `--usecase` は `usecase` `robustness` `sequence` 用です。`sequence` は1つ（または `--buc`）が必須です
- `--entity` は `state` `er` `information` `usecase` `robustness`、`--actor` は `usecase` `robustness` 用です
- `--node-kind` / `--edge-kind` は `rdra` 図をノードの種類や関係で絞ります
- `--all -o <dir>` はレビュー用の図一式を書きます。全体の図、BUCごとの `usecase` `robustness` `flow` `sequence`、エンティティごとの `state` です

読み取ったライフサイクルを描くのは `state` だけです。ほかの図は宣言された事実を描きます。

## レビュー表

```bash
rdra-ish csv <INPUTS...> --kind <KIND> [--format csv|markdown] [-o <OUT>]
rdra-ish list <INPUTS...> --kind <KIND> [--format table|json|csv|markdown]
```

| `csv` のkind | 内容 |
|---|---|
| `actor` / `entity` | アクター一覧、エンティティの列（既定 `entity`） |
| `matrix` | UC × エンティティのCRUD |
| `api` / `api-matrix` | API契約の一覧、API × エンティティのCRUD |
| `screen-constraints` | 画面 × UC / APIの権限・媒体の経路 |
| `permission-callables` | 権限ごとに呼べるUCとAPI |
| `actor-permission-audit` | アクター × 権限の不足（`missing`）と過剰（`excess`） |
| `business-inputs` | アクター × 入力項目 × UC |

`list` は要素の一覧を出します。`--kind rule` はすべての規則と条件、`--kind transition` は状態図の元になる遷移表、`--kind buc-roles` はアクターと外部システム × BUCの担当表です。`goal` `requirement` `adr` `condition` `surface` などのkindもあります。

## 状態導出とエクスポート

`states` は、BUCをまたいで各エンティティの到達できる状態パターンを導出します。到達できない値、作成経路の欠落、規則の違反を報告し、`--format` は `table` `csv` `json` です。仕組みはupstreamの [state-derivation.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/state-derivation.md) にあります。

`export --kind` は `openapi` `asyncapi` `dbml` `sql` `json-schema` `mermaid-er` `tla` を書きます。エクスポートはレビューの起点となるたたき台です。v3.0.0で `export --kind typescript-states` と `states --format typescript` は削除され、`codegen --lang ts` に置き換わりました。

各コマンドのフラグと終了コードは [CLI リファレンス](/projects/rdra-ish/cli-reference/)、`verify` は [形式検証](/projects/rdra-ish/formal-verification/)、`codegen` と `check --code` は [コード生成](/projects/rdra-ish/codegen/) を参照してください。

## 次に読む

- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
- [upstreamの言語リファレンス](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/language-reference.md)
