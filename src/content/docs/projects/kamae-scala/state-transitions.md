---
title: "状態遷移"
sidebar:
  order: 10
---

## 範囲

純粋遷移・エラー返却・集約トランザクション・永続化とイベントの同期です。状態のデータ構造は[ドメインモデリング](/projects/kamae-scala/domain-modeling/)を参照してください。

## ソース型で遷移を制約する

1つの状態だけが遷移できるときは、その特定の状態型を受け取る。広いenum全体を受け取らない。

```scala
final case class WaitingRequest(
    requestId: RequestId,
    passengerId: PassengerId
)

final case class EnRouteRequest(
    requestId: RequestId,
    passengerId: PassengerId,
    driverId: DriverId
)

extension (request: WaitingRequest)
  def assignDriver(driverId: DriverId): EnRouteRequest =
    EnRouteRequest(request.requestId, request.passengerId, driverId)
```

非法ソースstateはコンパイル時に失敗する。

すべての前提が入力型に表れているときだけ、遷移を失敗しない（常に成功する）形にする。ソースstateや引数型から読み取れないデータに依存するルールがあるならドメインエラーを返す。

```scala
extension (request: WaitingRequest)
  def assignDriver(
      driver: DriverAssignment
  ): Either[DomainError, Transition[EnRouteRequest, TaxiRequestEvent]] =
    if request.requiresAccessibleVehicle && !driver.acceptsAccessibilityRequests then
      Left(DomainError.DriverCannotServeAccessibilityRequest)
    else
      val state = EnRouteRequest(request.requestId, request.passengerId, driver.driverId)
      Right(Transition(state, List(TaxiRequestEvent.DriverAssigned(state.requestId, state.driverId))))
```

`throw`、`.get`、「呼び出し側が先にチェック」コメントの裏に隠さない。コンパイラが前提を強制できないなら、失敗可能性をシグネチャに示す。

## ソース状態を消費することの意味

ソース状態を引数として受け取り、新しい状態を返す設計には、次の利点があります。

1. **旧 state を再利用できない。** `waiting.assignDriver(driver)` の後、呼び出し元は返却された状態で作業する。隠れたmutationなしで二重割当を防ぎやすい。
2. **遷移は state 置換として読める。** 返却case classが新しい真実です。
3. **永続化マッピングが容易。** ユースケースは所有 `EnRouteRequest` を `saveAssigned` に渡せる。
4. **event ペアリングが明確。** `Transition(state, events)` を消費入力から一度構築する。

`var` フィールドやin-place mutationを使うのは：

- パフォーマンス上のホットパスで計測済みの必要があり、
- 各ミューテータで不変条件を再検証し、
- チームがcompile-timeの状態置換が実用的でない理由を文書化しているとき

に限る。デフォルトは不変な遷移結果とする。

## ユースケースを薄く保つ

ユースケースはポートをオーケストレーションする。ドメイン状態が所有すべきビジネスルールを埋め込まない。

```scala
import cats.Monad
import cats.syntax.all.*

final case class DriverProfile(
    driverId: DriverId,
    acceptsAccessibilityRequests: Boolean
):
  def toAssignment: DriverAssignment =
    DriverAssignment(driverId, acceptsAccessibilityRequests)

trait DriverRepository[F[_]]:
  def findAvailable(driverId: DriverId): F[Option[DriverProfile]]

final class AssignDriver[F[_]: Monad](
    requests: TaxiRequestRepository[F],
    drivers: DriverRepository[F]
):
  def execute(command: AssignDriverCommand): F[Either[AssignDriverError, Unit]] =
    requests.findWaiting(command.requestId).flatMap:
      case None =>
        Monad[F].pure(Left(AssignDriverError.RequestNotFound(command.requestId)))
      case Some(waiting) =>
        drivers.findAvailable(command.driverId).flatMap:
          case None =>
            Monad[F].pure(Left(AssignDriverError.DriverNotAvailable(command.driverId)))
          case Some(profile) =>
            waiting.assignDriver(profile.toAssignment) match
              case Left(err) =>
                Monad[F].pure(Left(AssignDriverError.Domain(err)))
              case Right(transition) =>
                requests
                  .saveAssigned(transition.state, transition.events)
                  .as(Right(()))
```

この例は `cats-core` がクラスパスにあることを前提とする。アダプタの失敗はリポジトリ境界で `handleError` や `attempt` によりマップしてからユースケースが返す。

ドメイン遷移は可能なら同期かつ純粋に保つ。エフェクトを伴うコードはユースケースとアダプタに属する。

## 遷移結果を明示的にモデル化する

状態変更がドメインイベントを発行し、新しい状態とアトミックに永続化するときは、小さな `Transition[TState, TEvent]`（または同等物）を使う。

```scala
final case class Transition[TState, TEvent](state: TState, events: List[TEvent])
```

リポジトリの期待は [永続化とイベント](/projects/kamae-scala/state-transitions/) を参照する。

## 正規の例

- 実装は [kamae-scala の `TaxiRequest.scala`](https://github.com/manji-0/kamae-scala/blob/main/examples/src/main/scala/kamae/examples/TaxiRequest.scala) を参照する。
- コンパイル時安全性： [kamae-scala の `CompileTimeSafetySuite.scala`](https://github.com/manji-0/kamae-scala/blob/main/examples/src/test/scala/kamae/examples/CompileTimeSafetySuite.scala) — munitの `compileErrors` で `EnRouteRequest` が `WaitingRequest` の要求箇所に渡せないことを検証する。

## 次に読む

外部データは[境界防御](/projects/kamae-scala/boundary-defense/)、チェックは[品質ゲート](/projects/kamae-scala/quality-gates/)です。
