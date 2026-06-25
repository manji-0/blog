---
title: "ORM アダプタ"
sidebar:
  order: 10
---

doobie 行、Slick エンティティ、Quill レコードをドメイン型にマップするときに読む。Kamae Scala は ORM / DB 行型を**インフラ**に閉じ、ユースケースと遷移にはドメイン state だけを見せる。

関連: [境界防御](/docs/kamae-scala/boundary-defense/)、[永続化、集約、イベント](/docs/kamae-scala/persistence-events/)、[段階的導入](/docs/kamae-scala/adoption/)。

## レイヤリング

```text
Use case  →  TaxiRequestRepository[F]  →  DoobieTaxiRequestRepository
                                              ↓
                                         row case class / Slick entity
                                              ↓
                                         mapper functions
                                              ↓
                                         WaitingRequest | EnRouteRequest | ...
```

Slick `TableQuery` 行、session 束縛エンティティ、Quill レコードをドメイン遷移に渡さない。nullable 列、lazy 関連、ストレージ形状を運び、不変条件を弱める。

## Doobie パターン

row case class をドメイン state から分離する。SQL と `Read` / `Write` instance はインフラに置く。

```scala
final case class RequestRow(
    id: String,
    kind: String,
    passengerId: String,
    driverId: Option[String],
    version: Long
)
```

### Row DTO + ドメインマッパー

adapter 境界で検証マッパーを通してパースする:

```scala
def domainFromRow(row: RequestRow): Either[BoundaryError, TaxiRequest] =
  for
    requestId <- RequestId(row.id).left.map(BoundaryError.InvalidId.apply)
    passengerId <- PassengerId(row.passengerId).left.map(BoundaryError.InvalidId.apply)
    state <- row.kind match
      case "waiting" =>
        Right(TaxiRequest.Waiting(WaitingRequest(requestId, passengerId, requiresAccessibleVehicle = false)))
      case "en_route" =>
        for
          driverId <- row.driverId.toRight(BoundaryError.MissingField("driver_id")).flatMap(DriverId(_).left.map(BoundaryError.InvalidId.apply))
        yield TaxiRequest.EnRoute(EnRouteRequest(requestId, passengerId, driverId))
      case other =>
        Left(BoundaryError.UnexpectedStatus(other))
  yield state
```

広い nullable 行を読み込んでユースケースで state を推測するより、狭いリポジトリメソッド（`findWaiting`、`saveAssigned`）を優先する。

### ドメイン → SQL の永続化

```scala
def saveAssigned(
    state: EnRouteRequest,
    events: List[TaxiRequestEvent],
    expectedVersion: Long
): ConnectionIO[Either[AssignDriverError, Unit]] =
  for
    updated <- sql"""
      update requests
      set kind = 'en_route', driver_id = ${state.driverId.value}, version = ${expectedVersion + 1}
      where id = ${state.requestId.value} and version = $expectedVersion
    """.update.run
    _ <- if updated == 0 then FC.raiseError(VersionConflict(state.requestId))
         else FC.unit
    _ <- insertOutboxEvents(events)
  yield Right(())
```

楽観的ロックと outbox insert は adapter トランザクション内に置く。ユースケースは `expectedVersion` を明示的に渡す。

[ライブラリガイド（doobie）](/docs/kamae-scala/library-guides/doobie/) を参照。

## Slick パターン

Slick `Table` 定義と `DBIO` action はインフラモジュールに置く。

```scala
class Requests(tag: Tag) extends Table[RequestRow](tag, "requests"):
  def id = column[String]("id", O.PrimaryKey)
  def kind = column[String]("kind")
  def passengerId = column[String]("passenger_id")
  def driverId = column[Option[String]]("driver_id")
  def version = column[Long]("version")
  def * = (id, kind, passengerId, driverId, version).mapTo[RequestRow]
```

ユースケースに返す前に repository adapter で `RequestRow` をドメインにマップする。ドメイン port から `DBIO` や `Query` 型を公開しない。

[ライブラリガイド（slick）](/docs/kamae-scala/library-guides/slick/) を参照。

## リポジトリ port の形

port は ORM 行ではなくドメイン state を返す。[永続化、集約、イベント](/docs/kamae-scala/persistence-events/) を参照。

## 移行の共存

Strangler 移行中:

1. row DTO と `domainFromRow` を追加する。
2. レガシーサービスメソッドをマッパーと純粋遷移を呼ぶラッパーにする。
3. クエリを doobie / Slick adapter モジュールに移す。
4. ユースケースがフローを所有したらレガシーラッパーを削除する。

[段階的導入](/docs/kamae-scala/adoption/) を読む。

## テスト

- **マッパーテスト:** すべての `kind`、null の組み合わせ、破損行。
- **adapter 統合テスト:** 実トランザクション、`FOR UPDATE`、version conflict、同一トランザクション内の outbox 行。
- **ユースケーステスト:** fake port。JDBC / ORM なし。

破損入力処理を狙うテスト以外、未検証の row リテラルからドメイン state を組み立てない。
