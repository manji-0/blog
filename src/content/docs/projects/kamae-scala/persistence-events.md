---
title: "永続化、集約、イベント"
sidebar:
  order: 10
---

状態変更とドメインイベントを別々に保存すると、リトライや障害のたびに不整合が残ります。Kamaeでは集約境界・楽観的ロック・アウトボックスをまとめて設計し、1コマンドの作業単位をユースケースが所有します。

状態型と遷移は [状態遷移](/projects/kamae-scala/state-transitions/) と [ドメインモデリング](/projects/kamae-scala/domain-modeling/)、境界変換は [境界防御](/projects/kamae-scala/boundary-defense/)、ストリーム消費は [ストリームと継続クエリ](/projects/kamae-scala/stream-continuous-queries/)、配線は [アプリケーション配線](/projects/kamae-scala/application-wiring/) を参照する。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./orm-adapters.md -->
<!-- constrained-by ./stream-continuous-queries.md -->

## 責務でリポジトリを分離する

repository traitはORMの都合ではなくドメインのニーズを表現する。read/writeインターフェースは小さく保つ。

```scala
trait TaxiRequestResolver[F[_]]:
  def findWaiting(id: RequestId): F[Option[WaitingRequest]]

trait TaxiRequestStore[F[_]]:
  def saveAssigned(
      expectedVersion: AggregateVersion,
      state: EnRouteRequest,
      events: List[TaxiRequestEvent],
      idempotencyKey: Option[IdempotencyKey]
  ): F[Either[RepositoryError, Unit]]
```

ポートにはCatsの`IO`、ZIOのタスク型、またはプロジェクトで採用しているエフェクト型を使います。`ConnectionIO`、`DBIO`、Quillのコンテキスト、JDBCハンドルはアダプター内に閉じ込めます。[エフェクトシステム](/projects/kamae-scala/effect-systems/)と[ORMアダプター](/projects/kamae-scala/orm-adapters/)を参照してください。

## 状態とイベントを原子的に永続化する

遷移がドメインイベントを出すとき、状態変更とoutbox行は**同一トランザクション**で保存します。呼び出し側が状態とイベントを別メソッドで保存できるAPIは避けてください。

集約ルートの楽観的version、悲観的ロック、ユースケースのトランザクション境界は [状態遷移](/projects/kamae-scala/state-transitions/) と整合させる。

## eventレコードは不変

eventは明示的なsealed traitかcase classでモデル化する。identifier、timestamp、aggregate id、event type、payloadを含める。eventはrepositoryの永続化コードではなく、ユースケースかドメイン層で生成する。

event payloadでは型付きtimestampやmoneyを使う。裸の`String`や`Double`より`OccurredAt`や`Money`などの値オブジェクトを優先する。eventレコードは長寿命の契約なので、型境界で単位と精度を明確にする。

## 必要なら永続eventをStreamで公開

read modelや統合が変更フィードを購読するとき、ユースケース内ad-hoc pollではなくfs2 / ZIO Stream portで永続eventを公開する。[ストリームと継続クエリ](/projects/kamae-scala/stream-continuous-queries/)でbackpressureとcheckpointを参照。

## Doobieによるトランザクション管理

ユースケースが操作に名前を付け、adapterが`BEGIN` / `COMMIT` / `ROLLBACK`を所有する（`transact`経由）。

```scala
final class DoobieTaxiRequestStore(xa: Transactor[IO]) extends TaxiRequestStore[IO]:
  def saveAssigned(
      expectedVersion: AggregateVersion,
      state: EnRouteRequest,
      events: List[TaxiRequestEvent],
      idempotencyKey: Option[IdempotencyKey]
  ): IO[Either[RepositoryError, Unit]] =
    val program: ConnectionIO[Either[RepositoryError, Unit]] =
      for
        duplicate <- idempotencyKey.traverse(seen).map(_.contains(true))
        result <-
          if duplicate then
            Applicative[ConnectionIO].pure(Right(()))
          else
            updateAssigned(state, expectedVersion).flatMap: updated =>
              if updated == 0 then
                Applicative[ConnectionIO].pure(
                  Left(RepositoryError.ConcurrentModification(state.requestId))
                )
              else
                events.traverse_(insertOutbox) *>
                  idempotencyKey.traverse_(recordIdempotency).as(Right(()))
      yield result

    program.transact(xa)
```

ルール：

- 無関係なeffectful作業（外部HTTP、長い計算）越しにトランザクションを開いたままにしない。`ConnectionIO`を先に合成し、一度だけ`transact`する。
- commit前の任意エラーでrollback。stateと同じトランザクション外にoutboxを部分insertしない。
- doobie / JDBCエラーはadapterで`RepositoryError`にマップする。ドメインコードではない。

Slickでは`DBIO.sequence` / `transactionally`で同じ形をadapter内に保つ。[ライブラリガイド（slick）](/projects/kamae-scala/library-guides/#slick)を参照。

## outboxテーブルスキーマ

最小transactional outboxはcommit後の確実publishに必要な情報を保持する：

```sql
CREATE TABLE outbox_events (
    event_id         UUID PRIMARY KEY,
    aggregate_type   TEXT NOT NULL,
    aggregate_id     TEXT NOT NULL,
    event_type       TEXT NOT NULL,
    payload          JSONB NOT NULL,
    occurred_at      TIMESTAMPTZ NOT NULL,
    published_at     TIMESTAMPTZ,
    publish_attempts INT NOT NULL DEFAULT 0
);

CREATE INDEX outbox_events_unpublished_idx
    ON outbox_events (occurred_at)
    WHERE published_at IS NULL;
```

outbox行は集約stateと同一トランザクションでinsertする。バックグラウンドworkerが未publish行を読みbusへpublishし`published_at`を更新する。publishはリトライされうるため、processorを冪等に保つ。

## eventのCirce表現

保存・公開eventにはtagged表現の明示sealed traitを優先する：

```scala
sealed trait TaxiRequestEvent derives Encoder.AsObject, Decoder
object TaxiRequestEvent:
  final case class DriverAssigned(
      requestId: RequestId,
      driverId: DriverId,
      occurredAt: OccurredAt
  ) extends TaxiRequestEvent

  final case class TripStarted(
      requestId: RequestId,
      occurredAt: OccurredAt
  ) extends TaxiRequestEvent

  final case class RequestCancelled(
      requestId: RequestId,
      reason: CancellationReason,
      occurredAt: OccurredAt
  ) extends TaxiRequestEvent
```

JSONに安定discriminator（`event_type` / `type`）を設定する。version付きevent進化：

- 新variantを追加する。古い`event_type`文字列を別payload形状で再利用しない。
- リーフはvalue objectまたはDTOとし、Circeで往復可能にする。
- outboxの`payload`はJSONBとし、consumerは必要に応じてDTO → ドメイン変換で`TaxiRequestEvent`にデコードする。

外部公開契約では内部ADTと異なるintegration DTOを検討する。[サービス境界](/projects/kamae-scala/service-boundaries/)と[ライブラリガイド（circe）](/projects/kamae-scala/library-guides/#circe)を参照。

## `version`による楽観的ロック

集約ルートに単調`version`（または等価チェック付き`updated_at`）を付ける。loadが現行versionを返し、saveが検証する。

```sql
-- column on aggregate table
version BIGINT NOT NULL DEFAULT 1
```

```scala
def updateAssigned(
    state: EnRouteRequest,
    expectedVersion: AggregateVersion
): ConnectionIO[Int] =
  sql"""
    UPDATE taxi_requests
    SET status = 'en_route',
        driver_id = ${state.driverId.value},
        version = version + 1,
        updated_at = now()
    WHERE request_id = ${state.requestId.value}
      AND version = ${expectedVersion.value}
  """.update.run
```

`ConcurrentModification`を型付きユースケースエラーとして公開し、HTTPが409、queue consumerがfresh loadでリトライできるようにする。

## リトライ向けidempotency key

リトライされうるコマンド（HTTP client、queue consumer、outbox processor）は`IdempotencyKey`か`CommandId`を持つ。同一トランザクション内でstate変更、もしくはdedupeテーブルと一緒に永続化する。

```scala
opaque type IdempotencyKey = String
object IdempotencyKey:
  def apply(raw: String): Either[IdempotencyKeyError, IdempotencyKey] = ...
```

```sql
CREATE TABLE command_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    request_id      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

リトライフロー：

1. Clientが`Idempotency-Key` headerまたはmessage属性を送る
2. ユースケースがkeyを`save_*`に渡す
3. Adapterがトランザクション内でdedupeをチェックしてから遷移適用
4. 重複keyでは再適用せずcommitしsuccess（または元outcome）を返す
5. `ConcurrentModification`ではreloadしリトライまたはconflictを返す

```scala
def executeWithRetry(
    cmd: AssignDriverCommand
): F[Either[AssignDriverError, Unit]] =
  def loop(attempt: Int): F[Either[AssignDriverError, Unit]] =
    executeOnce(cmd).flatMap:
      case Left(AssignDriverError.ConcurrentModification) if attempt < 2 =>
        loop(attempt + 1)
      case other => Monad[F].pure(other)

  loop(0)
```

同一論理コマンドの各リトライで同じidempotency keyを使う。新しいビジネスアクションだけ新keyを生成する。

## データベースに不変条件をミラーする

一意性制約やcheck制約を実用的な範囲で使う。ドメインがすでに拒否した内容をDBが再検証する必要はないが、破損行の黙った挿入は防ぐ。

## 行マッピングと境界防御

persistence adapterもHTTPやキューと同様に、DTO/row → ドメイン変換のルールに従う（[境界防御](/projects/kamae-scala/boundary-defense/)参照）。破損行やレガシー行はadapterで`RepositoryError.CorruptRow`として失敗し、無効なドメイン状態を組み立てない。

## よくあるライブラリの組み合わせ

| スタック | 永続化パターン |
| --- | --- |
| doobie + Circe | row case class、型付き`RepositoryError`、`transact`はadapter内 |
| doobie + Circe JSONB | `TaxiRequestEvent` ADTからエンコードするoutbox`payload JSONB` |
| doobie + domain events | 単一トランザクション: 集約`UPDATE` + outbox`INSERT` |
| Slick + domain events | `DBIO` + `.transactionally`で同じ原子性 |
| fs2 + outbox worker | 未publish行をpoll、publish、`published_at`更新。consumerは冪等 |

## レビューで見るところ

stateとoutboxの非原子的な別メソッド書き込みはないか。SQLマッピング内でeventを構築していないか。条件付き`version`なしのincrementはないか。idempotency / versionなしのリトライ再適用はないか。event payloadに裸`Double`や型なし`String`はないか。repository portが`ConnectionIO` / `DBIO`をユースケースへ漏らしていないか。
