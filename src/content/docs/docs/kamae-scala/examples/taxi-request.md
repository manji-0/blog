---
title: "タクシー配車の例"
sidebar:
  order: 20
  label: "タクシー配車例"
---

本例はKamae Scalaのエンドツーエンド実装である。待機中のリクエストにドライバーを割り当て、状態遷移とドメインイベントを返す典型的なパターンを示す。[ドメインモデリング](/docs/kamae-scala/domain-modeling/) と [状態遷移](/docs/kamae-scala/state-transitions/) の原則を、ひと続きのコードで追える。

opaque typeでIDをモジュール外から抽象化し、`WaitingRequest` にのみ `assignDriver` をextensionとして付けることで、コンパイル時に誤った状態への操作を防ぐ。

## ドメイン型

```scala
package kamae.examples

/** Domain types for the taxi-request example.
  *
  * Opaque IDs live inside this object so the underlying representation stays abstract outside the
  * module, per Scala 3 opaque-type guidance.
  */
object TaxiRequestDomain:
  opaque type RequestId = String

  object RequestId:
    def apply(value: String): Either[IdError, RequestId] =
      val trimmed = value.trim
      if trimmed.isEmpty then Left(IdError.Empty("request_id"))
      else Right(trimmed)

    extension (id: RequestId) def value: String = id

  opaque type PassengerId = String

  object PassengerId:
    def apply(value: String): Either[IdError, PassengerId] =
      val trimmed = value.trim
      if trimmed.isEmpty then Left(IdError.Empty("passenger_id"))
      else Right(trimmed)

    extension (id: PassengerId) def value: String = id

  opaque type DriverId = String

  object DriverId:
    def apply(value: String): Either[IdError, DriverId] =
      val trimmed = value.trim
      if trimmed.isEmpty then Left(IdError.Empty("driver_id"))
      else Right(trimmed)

    extension (id: DriverId) def value: String = id

  enum IdError:
    case Empty(field: String)

  final case class WaitingRequest private (
      requestId: RequestId,
      passengerId: PassengerId,
      requiresAccessibleVehicle: Boolean
  )

  object WaitingRequest:
    def apply(
        requestId: RequestId,
        passengerId: PassengerId,
        requiresAccessibleVehicle: Boolean
    ): WaitingRequest =
      new WaitingRequest(requestId, passengerId, requiresAccessibleVehicle)

    extension (request: WaitingRequest)
      def assignDriver(
          driver: DriverAssignment
      ): Either[DomainError, Transition[EnRouteRequest, TaxiRequestEvent]] =
        if request.requiresAccessibleVehicle && !driver.acceptsAccessibilityRequests then
          Left(DomainError.DriverCannotServeAccessibilityRequest)
        else
          val state = EnRouteRequest(
            request.requestId,
            request.passengerId,
            driver.driverId
          )
          Right(
            Transition(
              state,
              List(
                TaxiRequestEvent.DriverAssigned(
                  state.requestId,
                  state.driverId
                )
              )
            )
          )

  final case class EnRouteRequest(
      requestId: RequestId,
      passengerId: PassengerId,
      driverId: DriverId
  )

  final case class DriverAssignment(
      driverId: DriverId,
      acceptsAccessibilityRequests: Boolean
  )

  enum TaxiRequest:
    case Waiting(value: WaitingRequest)
    case EnRoute(value: EnRouteRequest)

  enum TaxiRequestEvent:
    case DriverAssigned(requestId: RequestId, driverId: DriverId)

  enum DomainError:
    case DriverCannotServeAccessibilityRequest

  final case class Transition[TState, TEvent](state: TState, events: List[TEvent])

export TaxiRequestDomain.{
  RequestId,
  PassengerId,
  DriverId,
  IdError,
  WaitingRequest,
  EnRouteRequest,
  DriverAssignment,
  TaxiRequest,
  TaxiRequestEvent,
  DomainError,
  Transition
}
```

## テスト

フィクスチャはpublicコンストラクタ経由で構築する。munitの `compileErrors` で、誤った状態型への操作がコンパイル時に拒否されることを検証する。

```scala
package kamae.examples

import munit.FunSuite

class TaxiRequestSuite extends FunSuite:

  private def requestId(value: String): RequestId =
    RequestId(value) match
      case Right(id) => id
      case Left(err) => fail(s"fixture request id is invalid: $err")

  private def passengerId(value: String): PassengerId =
    PassengerId(value) match
      case Right(id) => id
      case Left(err) => fail(s"fixture passenger id is invalid: $err")

  private def driverId(value: String): DriverId =
    DriverId(value) match
      case Right(id) => id
      case Left(err) => fail(s"fixture driver id is invalid: $err")

  test("assignDriver preserves identity and emits event"):
    val reqId = requestId("req-1")
    val passId = passengerId("passenger-1")
    val drvId = driverId("driver-1")
    val request = WaitingRequest(reqId, passId, requiresAccessibleVehicle = false)
    val driver = DriverAssignment(drvId, acceptsAccessibilityRequests = false)

    request.assignDriver(driver) match
      case Right(transition) =>
        assertEquals(
          transition.state,
          EnRouteRequest(reqId, passId, drvId)
        )
        assertEquals(
          transition.events,
          List(TaxiRequestEvent.DriverAssigned(reqId, drvId))
        )
      case Left(err) => fail(s"expected success, got $err")

  test("assignDriver serves accessibility request when driver accepts"):
    val request = WaitingRequest(
      requestId("req-3"),
      passengerId("passenger-3"),
      requiresAccessibleVehicle = true
    )
    val driver = DriverAssignment(driverId("driver-3"), acceptsAccessibilityRequests = true)

    request.assignDriver(driver) match
      case Right(transition) =>
        assert(transition.state.isInstanceOf[EnRouteRequest])
        assertEquals(transition.events.length, 1)
      case Left(err) => fail(s"expected success, got $err")

  test("taxi request enum stores waiting state"):
    val waiting = WaitingRequest(
      requestId("req-4"),
      passengerId("passenger-4"),
      requiresAccessibleVehicle = false
    )
    val request = TaxiRequest.Waiting(waiting)

    assert(request.isInstanceOf[TaxiRequest.Waiting])

  test("rejects empty request id"):
    assertEquals(RequestId(" "), Left(IdError.Empty("request_id")))

  test("rejects empty passenger id"):
    assertEquals(PassengerId(""), Left(IdError.Empty("passenger_id")))

  test("rejects empty driver id"):
    assertEquals(DriverId("  "), Left(IdError.Empty("driver_id")))

  test("rejects driver that cannot satisfy precondition"):
    val request = WaitingRequest(
      requestId("req-2"),
      passengerId("passenger-2"),
      requiresAccessibleVehicle = true
    )
    val driver = DriverAssignment(driverId("driver-2"), acceptsAccessibilityRequests = false)

    request.assignDriver(driver) match
      case Left(error) =>
        assertEquals(error, DomainError.DriverCannotServeAccessibilityRequest)
      case Right(_) => fail("expected domain error")

class CompileTimeSafetySuite extends FunSuite:

  test("EnRouteRequest is not WaitingRequest"):
    val errors = compileErrors("""
      import kamae.examples.*
      def onlyWaiting(request: WaitingRequest): Unit = ()
      val enRoute = EnRouteRequest(
        RequestId("req-1").toOption.get,
        PassengerId("passenger-1").toOption.get,
        DriverId("driver-1").toOption.get
      )
      onlyWaiting(enRoute)
    """)
    assert(errors.nonEmpty, clue = "expected a compile error")
    assert(
      errors.contains("WaitingRequest") || errors.contains("EnRouteRequest"),
      clue = errors
    )

  test("assignDriver is not available on EnRouteRequest"):
    val errors = compileErrors("""
      import kamae.examples.*
      val enRoute = EnRouteRequest(
        RequestId("req-1").toOption.get,
        PassengerId("passenger-1").toOption.get,
        DriverId("driver-1").toOption.get
      )
      val driver = DriverAssignment(DriverId("driver-1").toOption.get, false)
      enRoute.assignDriver(driver)
    """)
    assert(errors.nonEmpty, clue = "expected a compile error")
    assert(errors.contains("assignDriver"), clue = errors)
```

リポジトリルートから `sbt "project taxiRequest" test` で実行できる。ローカル環境のセットアップは [開発環境](/docs/kamae-scala/dev-environment/) を参照する。
