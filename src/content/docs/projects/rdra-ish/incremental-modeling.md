---
title: "段階的モデリング"
description: "rdra-ish の Stage 0–7 モデリングフローと rdra-ish next（main 169cdf3）"
sidebar:
  order: 3
---

このページは、要件モデルを業務の意図から技術設計へ段階的に精緻化する手順です。ファイル配置、Stageの一覧、各Stageで足すものと問うこと、`rdra-ish next` が現在のStageを判定する仕組みを説明します。実践例は [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) を参照してください。upstreamの正本は [docs/incremental-modeling.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/incremental-modeling.md) です。

対象：main `169cdf3`（v3.0.0以降の未リリース版）。

## 原則

いまの問いに答えられる最小のモデルから始めます。今のStageが安定し、詳細を足す意味が出てから次へ進みます。

- 前半のStageは業務の言葉で書きます。価値ストリーム、アクター、アクターが操作する画面、その仕事が触るデータです。
- 後半のStageでAPI境界、権限と媒体の制約、永続化の構造、ライフサイクル、ルールを足します。
- 順序はRDRAの層を外側から内側へたどります。画面はユースケースと並んでシステム境界にあり、システムが保持する情報はその内側にあります。

探索中のモデルは未完成のままでかまいません。

| 信号 | 扱い |
|---|---|
| warning | レビューの手がかり。常にブロッカーとは限らない |
| `check` のerror | ブロッカー。モデルを信頼できない |
| `--buc` フィルタ | システム全体を仕上げずに1スライスだけ検証できる |
| Mermaid出力 | テキストなので初期レビューでdiffを取りやすい |

## ディレクトリ配置

共有の語彙とBUCごとの流れを分けます。既定の配置は小さく保ちます。

```text
src/
  shared/
    actors.rdra      # module shared.actors
    biz.rdra         # module shared.biz
    entities.rdra    # module shared.entities
  buc/
    buc_<name>.rdra  # module buc.<name>
```

ファイルがレビューしにくくなるまで、この配置を保ちます。分割するのは所有関係が明確になるときだけです。

### 配置ルール

| 要素 | 既定の置き場所 | 分割する目安 |
|---|---|---|
| `actor`, `extsystem` | `shared/actors.rdra` | 外部システムが多ければ `shared/external.rdra` |
| `business`、安定した `requirement`、再利用する `timer` / `medium` / `permission` | `shared/biz.rdra` などの共有語彙ファイル | 文脈と権限の語彙が大きくなったら専用ファイル |
| `entity`, `relate`、共有のライフサイクルイベント | `shared/entities.rdra` | エンティティが自然なまとまりに分かれたとき |
| `buc`, `usecase`, `screen`、BUCローカルの `api` とイベント | `buc/buc_<name>.rdra` | 1ファイル1BUC。1つのBUCを早期に分割しない |
| CRUD, `displays`, `invokes`、アクセス制約、`raises`, `sets` | そのユースケースを説明するBUCファイル | BUC固有の述語はsharedに置かない |
| BUCをまたぐ `event`, `transitions` | 所有エンティティに近い共有ファイル | 複数のBUCファイルが同じイベントを発生・起動する |
| エンティティ制約（`forbidden`, `invariant`, `required`, `exclusive`） | 制約するエンティティに近い共有ファイル | 制約が増えたら `shared/rules.rdra` |

### 分割と命名

モデルが育ったら、共有ファイルを責務で分けます。

```text
src/
  shared/
    actors.rdra
    biz.rdra
    entities/
      order.rdra        # module shared.entities.order
      payment.rdra      # module shared.entities.payment
    lifecycle/
      order.rdra        # module shared.lifecycle.order
    rules.rdra          # module shared.rules
  buc/
    buc_order.rdra      # module buc.order
    buc_payment.rdra    # module buc.payment
```

探索中の `import` は広く取ります。分割後は、BUCが読みやすい範囲で最小の安定モジュールに絞ります。

```rdra
import shared.actors
import shared.biz
import shared.entities.order
import shared.lifecycle.order
```

- ファイルパスはモジュールパスと一致させます（`shared/entities/order.rdra` は `module shared.entities.order`）。
- BUCのファイル名は `buc_<name>.rdra`、モジュールは `buc.<name>` です。
- BUCとエンティティのIDには、UIや実装の名前より安定した業務名を使います。
- 同じ共有概念を2つのファイルで宣言せず、必要な場所でimportします。
- `relate` が生成する外部キー列を手で足しません。

## Stage一覧

Stage番号はupstreamのstage specから生成されます。関心（concern）が同じ連続したStageは1つの番号にまとまり、Stage 7だけが7A〜7Cに分かれます。

| Stage | 抽象度 | 主な問い | 追加するもの | 確認コマンド |
|---|---|---|---|---|
| 0 | Scope sketch | どの業務領域をモデル化するか | `business`、粗い `buc`、`belongs`、候補の `actor`、任意で `requirement` と `motivates` | `check`, `list --kind buc --format table`, `diagram --kind rdra` |
| 1 | BUC skeleton | 各BUCから誰が価値を得るか | `performs`, `contains`、粗い `usecase`、順序が要るなら `flow` / `step` | `check`, `diagram --kind rdra` |
| 2 | Screens | 各ユースケースでアクターは何を見て何をするか | `screen`, `displays`, `navigates`、任意で `field` | `check`, `diagram --kind rdra`, `diagram --kind screen`, `list --kind screen --format table` |
| 3 | Data touchpoints | 各ユースケースはどのデータに触り、各画面は何を示すか | 粗い `entity`、CRUD述語（`creates`, `reads`, `updates`, `deletes`）、`shows`、任意で `maps_field` | `check`, `csv --kind matrix`, `diagram --kind er` |
| 4 | API and access boundary | どのユースケースがAPIを通り、どのシステムが所有し、どの権限と媒体が要るか | 任意で `api` / `invokes`、`dto`, `system`, `permission`, `medium`, `has_permission`, `requires_*` | `check`, `diagram --kind rdra`, `list --kind api --format table`, `csv --kind api-matrix`, `csv --kind screen-constraints`, `csv --kind actor-permission-audit` |
| 5 | Entity structure | データにどんな構造と所有関係が要るか | 列、`@pk`, `variation`, `relate`、カーディナリティ、任意で `owns` / `coordinates` | `check`, `diagram --kind er` |
| 6 | Lifecycle | どの状態とイベント起点のBUC入口がBUCを通じて到達可能か | `Enum`, `Bool`, `@null`, `event`, `transitions`, `raises`, `triggers`, `timer`, `sets`, `condition` | `check`, `states`, `diagram --kind state`, `diagram --kind event` |
| 7A | Local guardrails | どの単純な状態や事実が同時に成り立ってはいけないか | Enum / Bool / nullable軸に対する `forbidden`, `exclusive` | `check`, `states` |
| 7B | Local obligations | 到達可能な状態がどの事実を含意・要求するか | `invariant`、範囲を絞った `required` | `check`, `states` |
| 7C | Advanced rules | 比較やエンティティ横断の事実を抽象状態空間からレビューできるか | 比較の命題、複数エンティティの `forbidden` / `invariant` | `check`, `states` |

必須はStage 0〜6です。Stage 7A〜7Cは任意で、ライフサイクルがありルールのないBUCも完了扱いです。

## 現在のStageを調べる

`rdra-ish next` は各BUCをStage一覧に位置づけ、次のStageが求めるものを表示します。

```bash
rdra-ish next src/
rdra-ish next src/ --buc BucOrder
```

`--buc` は繰り返し指定できます。`--format json` でJSONを出力します。

### ゲートの判定

各Stageには、失敗した要素を名指しする条件の集まり（ゲート）があります。

| 判定 | 意味 |
|---|---|
| met（`[x]`） | 条件をすべて満たし、そのStageが持つ `check` のerrorもない |
| open（`[ ]`） | blockingの条件が失敗している。失敗はギャップとして表示される |
| blocked（`[!]`） | 条件は満たすが、BUCが触るエンティティに `check` のerrorがある（`Witness_`、`Deadlock_`、違反したルール） |

advisoryの条件が失敗してもレビューノートになるだけで、BUCを止めません。意図的にデータを持たないユースケースや、単独で立つエンティティは、ブロッカーではなく問いです。BUCのStageは、必須Stage 0〜6のうち先頭から連続してmetになった最後のStageです。

| Stage | ゲートを満たす条件 | レビューノート |
|---|---|---|
| 0 | BUCが `belongs` で業務に属する | |
| 1 | アクターがBUCかそのユースケースを `performs` する、またはイベントかタイマーがユースケースを `triggers` する。かつBUCがユースケースを持つ（`contains`、またはflowのstepと `covers` 経由）か、イベントかタイマーがBUC自体を `triggers` する | |
| 2 | BUCがユースケースを持ち、どのユースケースも画面を `displays` するか、イベントかタイマーで起動される | |
| 3 | BUCがユースケースを持ち、どれかのユースケースが直接または `invokes` するAPI経由でエンティティをCRUDする | データに触るユースケースが1つでもあれば、触らないユースケースと `shows` のない画面は意図的にデータなしとみなす |
| 4 | ユースケースが `invokes` するAPIがすべて `system` に属する | `permission` か `medium` を宣言したモデルでは、自身にもAPIにも `requires_permission` / `requires_medium` がないユースケースは、意図的に全アクター・全端末に開いているとみなす |
| 5 | 触るエンティティすべてに、主キーでも外部キーでもない列がある | 2つ以上のエンティティに触るBUCで、ほかと `relate` しないエンティティは意図的に単独とみなす |
| 6 | どれかのユースケースが `transitions` か `sets` でEnumかBoolの列を動かす | 存在の有無・Int・比較だけを動かす `sets` は、ライフサイクルのEnumかBoolに従う |
| 7A | 比較を含まない `forbidden` か `exclusive` が、このBUCの動かす列を読む | |
| 7B | 比較を含まない `invariant` か `required` が、このBUCの動かす列を読む | |
| 7C | 比較を含むか複数エンティティを名指すルールが、このBUCの動かす列を読む | |

ゲートは証拠であって判定ではありません。要素がそろっても、次へ進むかはレビューで決めます。

### 出力の読み方

テキスト出力は、BUCが複数あれば先に要約表を出し、続いてBUCごとのブロックを出します。

```text
BucStoreRestock "Maintain Store Restock": stage 1 BUC skeleton
  [x] 0  Scope sketch             belongs to StoreOperations
  [x] 1  BUC skeleton             2 use cases, 1 `performs` / `triggers` starting them
  [ ] 2  Screens                  0/2 use cases display a screen or run on a trigger
  ...

Next: stage 2 Screens
  What does the actor see and do in each use case?
  Gaps:
    - usecase ChangeNextRestockDate: add `displays(ChangeNextRestockDate, Screen)` for the screen the actor works on, or `triggers(Event, ChangeNextRestockDate)` when no actor starts it
    ...
  Ask:
    - Which screen does the actor work on in each use case?
    ...
  Then review with:
    rdra-ish check src
    rdra-ish diagram src --kind rdra --format mermaid --buc BucStoreRestock
    ...
  See docs/incremental-modeling.md#stage-2-screens
```

`Next:` のブロックには、未達の最初の必須Stageについて、主な問い、`Gaps:`（最大8件、JSONは全件）、`Notes:`、`Findings:`、`Ask:`、確認コマンドが並びます。必須Stageがすべてmetになると `stage 6 Lifecycle, required stages complete` と表示され、未達のルールStageごとに `Optional:` のブロックが続きます。

JSONはStageを `"2"` や `"7A"` で返し、`slug`（`data-touchpoints` など）を安定したIDとして持ちます。終了コードは、どのStageと判定でも `0` です。ロードエラーやモデルエラーがあれば `1` を返すので、先に `check` を実行します。`next` は `check` と同じくライフサイクルを探索するので、同じくらい時間がかかります。`lint` の `stage-readiness` も同じゲートで各BUCのStageを報告します。

BUCごとに進み具合が違ってかまいません。1つのBUCを1段階進めるたびに `next` を実行します。

エージェントスキル `rdra-ish-write` も同じ手順を取ります。まず `rdra-ish next src/` でStageを調べ、そのStageの問いだけを聞きます。Claude Codeでは、upstreamの `rdra-ish` プラグインがスキル一式を入れます。`rdra-ish` 本体は入れないので、別にインストールします（[skills/README.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/skills/README.md#claude-code-plugin)）。

## Stageごとの進め方

各Stageで「ユーザーに聞くこと」と「次へ進む目安」をまとめます。確認コマンドは [Stage一覧](/projects/rdra-ish/incremental-modeling/#stage一覧) の表のとおりで、`diagram` には `--buc <BucId>` を付けて1スライスに絞ります。

### Stage 0 Scope sketch

業務領域と候補のBUCを名付けるだけにします。

```rdra
module buc.order

import shared.biz

buc BucOrder "Process Order"
belongs(BucOrder, Commerce)
```

- 聞くこと：どの業務領域・価値ストリームが対象か。候補のBUC名は何か。最初にどのBUCをモデル化するか。
- 次へ進む目安：BUC名と業務の所有がレビューできる程度に安定した。

### Stage 1 BUC skeleton

アクターとユースケースを足します。画面とエンティティはまだ要りません。

```rdra
actor Customer "Customer"

usecase PlaceOrder "Place Order"
usecase CancelOrder "Cancel Order"

performs(Customer, BucOrder)
contains(BucOrder, PlaceOrder)
contains(BucOrder, CancelOrder)
```

- 聞くこと：誰がこのBUCを始め、価値を受け取るか。BUCを構成するユーザーに見える操作は何か。人ではなくシステムイベントで起動するユースケースはあるか。
- 次へ進む目安：重要な操作がすべてユースケースになり、それぞれが意図したBUCに属する。

### Stage 2 Screens

どのデータに触るかを決める前に、アクターが操作する画面を足します。イベントやタイマーで始まるユースケースには画面は要りません。

```rdra
screen CartScreen "Cart"
screen CheckoutScreen "Checkout"

displays(PlaceOrder, CheckoutScreen)
displays(CancelOrder, CartScreen)
navigates(CartScreen, CheckoutScreen).via(PlaceOrder)
```

入力項目のように、画面の項目をモデル要素としてレビューしたいときは `field` を足します。エンティティ列への対応（`maps_field`）は次のStageに回します。

- 聞くこと：各ユースケースでアクターはどの画面を使うか。どの画面からどの画面へ、どのユースケースで遷移するか。アクターが入力・確認する項目と、システムが埋める項目はどれか。
- 次へ進む目安：アクター向けのユースケースがすべて画面を名指しし、画面遷移がBUC内のアクターの経路として読める。

### Stage 3 Data touchpoints

粗いエンティティとCRUD述語を足し、画面とそれが示すエンティティを `shows` で結びます。エンティティは `id` 列だけでかまいません。

```rdra
entity Order "Order" {
  id: Int @pk
}

creates(PlaceOrder, Order)
updates(CancelOrder, Order)
shows(CheckoutScreen, Order)
```

- 聞くこと：各ユースケースはどの業務オブジェクトを作成・参照・更新・削除するか。各画面はどのエンティティを示すか。どの名詞が論理データ構造で、どれが業務語彙にすぎないか。複数BUCで共有するエンティティはどれか。
- 次へ進む目安：列がまだ粗くても、CRUDマトリクスが筋の通った話になっている。

### Stage 4 API and access boundary

ユースケース・画面・データの経路が見えたら、API、それを所有するシステム、権限と媒体の制約を足します。どれも任意です。ユースケースは直接CRUDのままでかまいません。`permission` と `medium` のどちらもないモデルには、レビューするアクセス制約がありません。ゲートが求めるのは、呼ばれるAPIがシステムに属することだけです。

```rdra
api OrderApi "Order API"
system OrderSystem "Order System"
permission OrderWrite "Order Write"
medium CustomerDevice "Customer Device"

contains(OrderSystem, OrderApi)
invokes(PlaceOrder, OrderApi)
creates(OrderApi, Order)
requires_permission(PlaceOrder, OrderWrite)
requires_medium(PlaceOrder, CustomerDevice)
```

- 聞くこと：ユースケースはデータを直接書くか、API境界を通すか。APIは再利用する境界とBUCローカルのどちらで、どのシステムが所有するか。ユースケースやAPIにどの権限と物理・端末の媒体が要るか。
- 次へ進む目安：RDRAグラフとAPIマトリクスが意図した経路を示し、画面制約と権限監査のCSVが期待どおりの権限・媒体の経路と割り当てを示す。

API境界と権限の判断は [APIとアクセス境界の判断](/projects/rdra-ish/incremental-modeling/#apiとアクセス境界の判断) にまとめます。

### Stage 5 Entity structure

列、主キー、関連、カーディナリティでエンティティを詳しくします。

```rdra
entity OrderLine "Order Line" {
  id: Int @pk
  qty: Int
  unit_price: Decimal
}

relate(OrderLine, Order, N:1)
```

- 聞くこと：各エンティティを識別する列は何か。どの列が業務状態で、どれが通常のデータか。どの親子関係がレコードを所有・グループ化するか。関連するエンティティをまたぐ1つのトランザクションが要るユースケースはあるか。
- 次へ進む目安：外部キーの関係と `check` のトランザクション警告が、意図した永続化の境界と一致する。

### Stage 6 Lifecycle

構造が安定したら、ライフサイクルの軸とイベントを足します。

```rdra
entity Order "Order" {
  id: Int @pk
  status: Enum(pending, paid, cancelled) @default(pending)
  paid_at: DateTime @null
}

usecase CapturePayment "Capture Payment"
contains(BucOrder, CapturePayment)
updates(CapturePayment, Order)

transitions(CapturePayment, Order.status, pending -> paid)
transitions(CancelOrder, Order.status, pending -> cancelled)
sets(CapturePayment, Order.paid_at == present)
```

遷移はそれぞれ、状態を動かすユースケースを名指します。RDRAの状態シートの遷移UC列に当たります。`event` は、それを消費するもの（`triggers` する別のBUCやユースケース、または `outbox` の発行）があるときだけ宣言します。

- 聞くこと：どのEnum列と値がライフサイクルの状態か。どのユースケースが各状態変化を起こすか。別のBUCを始めるイベントはあるか、その入口のユースケースは分かっているか。ライフサイクルと一緒に変わるnullableやBoolの列はどれか。Enumの値は見たい状態か（図は値ごとに1状態を導出する）。
- 次へ進む目安：到達可能なパターンが期待するライフサイクルを説明し、想定外の終端状態や到達不能な状態をレビューした。

イベントで始まるBUCは、まず `triggers(Event, TargetBuc)` で書きます。入口の操作が明確になったら `contains(TargetBuc, EntryUseCase)` と、任意で `triggers(Event, EntryUseCase)` を足します。

### Stage 7A Local guardrails

ライフサイクルの振る舞いが十分にそろってから、低リスクの制約を足します。1つのエンティティ上の禁止の組み合わせと、相互排他の事実から始めます。

```rdra
forbidden(Order, status == paid, paid_at == null)

exclusive(Document, approved == true, rejected == true)
```

- 聞くこと：到達してはいけない組み合わせはどれか。相互排他であるべき事実はどれか。それらの事実はEnum・Bool・nullableの軸で表されているか。
- 次へ進む目安：診断が消えたか、既知のモデリングの穴として受け入れた。最初は小さく保ち、明らかに不可能な状態を捕まえるだけにします。

### Stage 7B Local obligations

ガードレールが安定してから、含意の形のルールを足します。条件付きの共起には `invariant` を使い、`required` は到達可能なすべてのパターンで成り立つ事実だけに使います。

```rdra
invariant(Order).when(status == paid).then(paid_at == present)

required(Account, active == true)
```

- 聞くこと：条件が成り立ったら共起すべき値はどれか。到達可能なすべての状態で真であるべき事実はどれか。`required` では広すぎて、ガード付きの `invariant` にすべきではないか。
- 次へ進む目安：義務の診断が意図したライフサイクルと一致する。`required` の違反が多すぎるときは、ルールを足す前に、まず `invariant` へ絞ります。

### Stage 7C Advanced rules

比較の命題とエンティティ横断の制約は最後に足します。比較には列を動かす `sets`（または比較を駆動する `drives`）が要ります。エンティティ横断のルールは、`.along` で結ばない限り、参加するエンティティのインスタンスのすべての組み合わせを対象にします。

```rdra
drives(SellItem, Inventory.stock < selling, true)
forbidden(Inventory, stock < selling)

forbidden(Order, Payment, Order.status == cancelled, Payment.status == captured)

invariant(Order, Payment).when(Order.status == paid).then(Payment.status == captured)
```

- 聞くこと：どの比較が重要で、どのユースケースがその数値や日付を動かすか。本当に複数のエンティティに言及するルールはどれか。横断ルールは全組み合わせに対するものか、宣言した関連の経路に沿うものだけか。
- 次へ進む目安：診断が消えたか、既知の穴として受け入れた。

`check` と `states` は既定でエンティティごとに1インスタンスで実行します。同じエンティティの2行でしか破れないルール（同じエンティティの行に対する `.none`、`@unique` の組 `Unique_<Entity>_<columns>`）は、そこでは失敗しません。`.along` のない複数エンティティのルールも1組の行しか見ません。こうしたルールを使う前に、`rdra-ish check src/ --instance-count 2` か `rdra-ish verify src/` を実行します。`verify` は既定で、ルールが任意の行数で成り立つことのz3による証明も試みます。z3が見つからなければ証明を飛ばし、`note: z3 not found ...` を表示します（[z3による証明](/projects/rdra-ish/theory/z3/)）。時相の `property` は `verify` だけが検査し、`check` は検査しなかった数を知らせます。詳しくは [形式検証](/projects/rdra-ish/formal-verification/) を参照してください。

## APIとアクセス境界の判断

`api` は、同じトランザクションや参照整合性の保証が要る読み書きをまとめる境界です。ユースケースごと、画面操作ごと、エンティティごとに1つ作るものではありません。

| 状況 | 書き方 |
|---|---|
| 1つのエンティティの中で閉じる操作 | ユースケースの直接CRUDのままにする |
| 複数レコードを一緒に検証・更新する、エンティティ間の参照を保つ、同じ整合性の契約を複数のユースケースで共有する | 別の `api` を導入し、ユースケースから `invokes` する |

たとえば、店舗の次回補充日の変更は店舗エンティティの中で閉じる更新です。

```rdra
usecase ChangeNextRestockDate "Change Next Restock Date"
updates(ChangeNextRestockDate, Store)
```

店舗の担当組織の変更は、店舗・組織の参照・割当履歴を1つの操作で整合させるので、別の境界になります。

```rdra
usecase ChangeStoreParentOrg "Change Store Parent Organization"
api StoreParentOrgApi "Store Parent Organization API"

invokes(ChangeStoreParentOrg, StoreParentOrgApi)
reads(StoreParentOrgApi, Organization)
updates(StoreParentOrgApi, Store)
creates(StoreParentOrgApi, StoreOrgAssignmentHistory)
```

同じ整合性を要するユースケースが複数あれば、CRUD述語を各ユースケースに複製せず、同じAPIを `invokes` させます。

アクセスの書き分けは次のとおりです。

| 書きたいこと | 書き方 |
|---|---|
| BUCが特定の操作媒体を通じてだけ業務に属する | `belongs(Buc, Business).by(Medium)` |
| ユースケースを起動するスケジュール | `timer` と `triggers(Timer, UseCase)`（belongsの文脈ではない） |
| アクターができること | `has_permission(Actor, Permission)` |
| 操作が要求すること | ユースケースかAPIに `requires_permission` / `requires_medium` |

画面の要件は直接書きません。`displays(UC, Screen)` と、UCおよび `invokes(UC, Api)` で届くAPIの制約から導出されます。`check` は次の3つを警告します。

- 要求される権限にアクターの経路がない。
- 経路上のアクターがその権限を持たない。
- どの経路も要求しない権限をアクターが持つ。

警告文ではなく割り当ての行列を見たいときは `rdra-ish csv src/ --kind actor-permission-audit` を使います。

## 次の問いを選ぶ

`rdra-ish next` はゲートからBUCごとに次の問いを出します。`next` を使わずに判断するときは、モデルの現状から次の表で選びます。

| モデルの現状 | 次に問うこと |
|---|---|
| BUCはあるがアクターがない | 起点のアクターと外部システム |
| アクターとユースケースはあるが画面がない | 各ユースケースでアクターが使う画面 |
| 画面はあるがCRUDがない | 各ユースケースが触り、各画面が示すデータ |
| 直接CRUDだが、ユースケースをまたぐトランザクションや参照整合性が要る | APIと `invokes` |
| エンティティに `id` しかない | 列、キー、関連 |
| Enum・Bool・nullableの列はあるが `sets` も `transitions` もない | ユースケースの効果とイベント |
| 状態はあるが到達できない値がある | 足りない `raises`, `transitions`, `sets` |
| 到達可能な状態が安定した | ガードレール（`forbidden`, `exclusive`） |
| ガードレールが安定した | 義務（`invariant`、範囲を絞った `required`） |
| 義務が安定した | 比較の命題やエンティティ横断の制約 |

## サンプル

upstreamの [`samples/incremental-order`](https://github.com/manji-0/rdra-ish-dsl/tree/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/samples/incremental-order) に、同じBUCを8段階（step-0〜step-7）で育てた成果物があります。各stepは独立した `src/` を持つので、diffで各Stageの追加量を確認できます。読み物としてのウォークスルーは [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) です。

## 次に読む

- [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/)
- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
