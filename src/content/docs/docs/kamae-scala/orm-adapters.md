---
title: "ORM アダプタ"
sidebar:
  order: 10
---

doobie行、Slickエンティティ、Quillレコードをドメイン型へマップするときに読む。Kamae ScalaはORM / DB行型を**インフラ**に閉じ、ユースケースと遷移にはドメインstateだけを見せる。

関連： [境界防御](/docs/kamae-scala/boundary-defense/)、[永続化、集約、イベント](/docs/kamae-scala/persistence-events/)、[段階的導入](/docs/kamae-scala/adoption/)。

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

Slick `TableQuery` 行、session束縛エンティティ、Quillレコードをドメイン遷移に渡さない。nullable列、lazy関連、ストレージ形状を運び、不変条件を弱める。

## Doobie パターン

row case classをドメインstateから分離する。SQLと `Read` / `Write` instanceはインフラに置く。

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

adapter境界で検証マッパーを通してパースする：

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

広いnullable行を読み込んでユースケースでstateを推測するより、狭いリポジトリメソッド（`findWaiting`、`saveAssigned`）を優先する。

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

楽観的ロックとoutbox insertはadapterトランザクション内に置く。ユースケースは `expectedVersion` を明示的に渡す。

[ライブラリガイド（doobie）](/docs/kamae-scala/library-guides/doobie/) を参照。

## Slick パターン

Slick `Table` 定義と `DBIO` actionはインフラモジュールに置く。

```scala
class Requests(tag: Tag) extends Table[RequestRow](tag, "requests"):
  def id = column[String]("id", O.PrimaryKey)
  def kind = column[String]("kind")
  def passengerId = column[String]("passenger_id")
  def driverId = column[Option[String]]("driver_id")
  def version = column[Long]("version")
  def * = (id, kind, passengerId, driverId, version).mapTo[RequestRow]
```

ユースケースへ返す前にrepository adapterで `RequestRow` をドメイン型へマップする。ドメインportから `DBIO` や `Query` 型を公開しない。

[ライブラリガイド（slick）](/docs/kamae-scala/library-guides/slick/) を参照。

## リポジトリ port の形

portはORM行ではなくドメインstateを返す。[永続化、集約、イベント](/docs/kamae-scala/persistence-events/) を参照。

## 移行の共存

Strangler移行中：

1. row DTOと `domainFromRow` を追加する。
2. レガシーサービスメソッドをマッパーと純粋遷移を呼ぶラッパーにする。
3. クエリをdoobie / Slick adapterモジュールに移す。
4. ユースケースがフローを所有したらレガシーラッパーを削除する。

[段階的導入](/docs/kamae-scala/adoption/) を読む。

## テスト

- **マッパーテスト:** すべての `kind`、nullの組み合わせ、破損行。
- **adapter 統合テスト:** 実トランザクション、`FOR UPDATE`、version conflict、同一トランザクション内のoutbox行。
- **ユースケーステスト:** fake port。JDBC / ORMなし。

破損入力処理を狙うテスト以外、未検証のrowリテラルからドメインstateを組み立てない。
