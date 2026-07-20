---
title: "永続化、集約、イベント"
sidebar:
  order: 10
---

状態変更とドメインイベントを別操作で保存すると、リトライや障害のたびに不整合が残る。Kamaeでは集約境界・楽観的ロック・アウトボックスをセットで設計し、1コマンドの作業単位をユースケースが所有する。

状態型と遷移は [状態遷移](/projects/kamae-scala/state-transitions/) と [ドメインモデリング](/projects/kamae-scala/domain-modeling/) が前提。配線はスキルリポジトリの `references/application-wiring.md` を参照する。

## 集約とトランザクション境界

1つの集約ルートが、まとめて変わる必要のある不変条件を所有する。ユースケースはその集約をロードし、純粋遷移するし、ストレージモデルが許す範囲で1トランザクション境界内に結果を永続化する。

```scala
def saveAssigned(state: EnRouteRequest, events: List[TaxiRequestEvent]): F[Unit]
```

アダプタは状態の書き込みとイベントの追記を原子的に行う。

集約横断ルールはID、スナップショット、ドメインイベント、または後続ユースケースを使う。2つの集約ルートをメモリ上で変更し、呼び出し側が両方saveしてくれることを期待しない。

## 1 集約、1 トランザクション

ユースケースが1つの集約ルートを変更するとき、新しい状態と発行されたイベントは単一トランザクションで永続化する。

```text
begin/load -> authorize -> transition (pure) -> save state + events -> commit
```

ドメインコードはトランザクションをbegin / commitしない。portはadapterが原子的に実装する操作を公開する。

stateとoutbox / event行の一貫性が必要なら、`save_*` portメソッドは1 DBトランザクションで両方を書く。呼び出し側がstateとeventを別メソッドで保存できるAPIは避ける。

## 楽観的並行性がデフォルト

競合する集約には、集約ルートに単調増加 `version` または `updated_at` チェックを付ける。load portは現行versionを返し、save portは古い書き込みを拒否する。

集約がversionフィールドを使うとき、遷移は期待versionを検証し、黙って上書きするのではなく型付きのリトライ可能エラーを返す。

典型的フロー:

1. 現行version付きで集約をロード
2. 値上で純粋遷移
3. `expected_version` でsave
4. 0行更新またはversion不一致を `ConcurrentModification` にマップ

競合は型付きユースケースエラーとして公開し、呼び出し側がリトライまたは409を返せるようにする。

悲観的ロック（`SELECT ... FOR UPDATE` など）は、在庫予約、座席ホールド、台帳記帳のように短く境界の明確なクリティカルセクション向け。ロックはadapterトランザクション内で取得し、ドメインコードではない。

## 集約横断の調整

1コマンドが複数ルートに触れるとき：

| 状況 | 推奨アプローチ |
| --- | --- |
| 1 ルートが決定を所有し、他は事実だけ必要 | ID でスナップショットまたは read model をクエリ |
| 両ルート変更が必要で、一方失敗時に他方をロールバック | 単一ユースケース、明示順序、saga / outbox、または datastore が許す 1 トランザクション境界 |
| 結果整合性（eventual consistency）で足りる | ドメインイベント + 下流 consumer |

集約横断オーケストレーションをrepository adapter内に隠さない。ユースケースがビジネスステップを名指しする。

## 責務でリポジトリを分離する

repository traitはORMの都合ではなくドメインのニーズを表現する。read / writeインターフェースは小さく保つ。

```scala
trait TaxiRequestRepository[F[_]]:
  def findWaiting(id: RequestId): F[Option[WaitingRequest]]
  def saveAssigned(state: EnRouteRequest, events: List[TaxiRequestEvent]): F[Unit]
```

doobie、slickなどのアダプタがこれらを実装する。ドメインコードはドライバ固有の型をimportしない。

## アダプタはイベントを発明しない

ビジネスイベントを作るのはドメイン遷移だけである。リポジトリは `Transition(state, events)` でドメインが返したものを永続化する。adapterがeventを「補完」すると監査とリプレイの信頼性が失われ、テストでも本番と異なる経路が生まれる。

eventレコードは明示的なcase classまたはenumでモデル化し、identifier、timestamp、aggregate id、event name / type、payloadを含める。event payloadでは型付きtimestamp、money、単位を使う。裸の `String`、`Long`、`Double` より `OccurredAt`、`Money`、`DistanceMeters`、`CurrencyCode` など。

## データベースに不変条件をミラーする

制約、check制約、ドメイン状態を反映するenum列を、実用的な範囲で使う。ドメインがすでに拒否した内容をDBが再検証する必要はないが、破損行の黙った挿入は防ぐ。

一意性、テナント所有権、非負残高、有効なライフサイクル状態、外部キー存在をDBが強制できるのに、アプリケーション検査だけに頼る永続化を避ける。

## 冪等なリトライ処理

リトライされうるコマンド（HTTPクライアント、queue consumer、outbox processor）は `CommandId` またはidempotency keyを持つ。state変更と一緒、またはdedupeテーブルに永続化し、重複配送が遷移を二重適用しないようにする。

outboxとevent consumerは、idempotency keyまたはドメインIDから導出した自然キーで重複を許容する設計にする。idempotencyはhandlerの後付けではなく、トランザクションストーリーの一部として扱う。

## イベントのバージョニング

イベントスキーマが進化するときは、payloadにversionを付け、境界で後方互換の読み取りをサポートする。

- 新variantまたは新 `event_version` を追加する。古い `event_type` 文字列を別payload形状で再利用しない
- リーフは往復可能なvalue objectまたはDTOとする
- 非同期に保存または消費されるイベントには、明示的な型 / バージョンとスキーマ進化戦略を文書化する

## 行マッピングと境界防御

persistence adapterもHTTPやキューと同様に、DTO → ドメイン変換のルールに従う（[境界防御](/projects/kamae-scala/boundary-defense/) 参照）。たとえば `en_route` 行に `driver_id` がNULLのまま読み込まれた場合、無効な `EnRouteRequest` を組み立てて遷移に渡すのではなく、adapterで `RepositoryError.CorruptRow` として返す。

## レビューで見るところ

単一ユースケースがトランザクション境界を持ち、状態保存とイベント公開が原子的か。冪等キーなしの二重適用や、楽観ロックなしの高競合load/modify/saveがないか。集約ルートを迂回した子変更や、アプリ検査だけに頼るDB制約不足がないかも見る。リポジトリがビジネスイベントを発明していないか、巨大CRUD traitや不当な悲観ロック、バージョンなしイベント、集約横断の暗黙調整がないか確認する。
