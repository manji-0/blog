---
title: "状態遷移"
sidebar:
  order: 10
---

閉じた状態集合はenumと遷移メソッドで表し、非法遷移は型と `match` の網羅で落とす。遷移の内側で永続化やログを行うと、純粋性が失われ、テストや並行性の検討が難しくなる。

状態のデータ構造は [ドメインモデリング](/docs/kamae-scala/domain-modeling/)、保存とイベントは [永続化、集約、イベント](/docs/kamae-scala/persistence-events/) に委ねる。

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

ソース状態を引数として受け取り、新しい状態を返す（共有集約をmutateするのではなく）設計には、次の利点がある。

1. **旧 state を再利用できない。** `waiting.assignDriver(driver)` の後、呼び出し元は返却された状態で作業する。隠れたmutationなしで二重割当を防ぎやすい。
2. **遷移は state 置換として読める。** 返却case classが新しい真実である。
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

リポジトリの期待は [永続化、集約、イベント](/docs/kamae-scala/persistence-events/) を参照する。

## 正規の例

- 実装は [kamae-scala の `TaxiRequest.scala`](https://github.com/manji-0/kamae-scala/blob/main/examples/src/main/scala/kamae/examples/TaxiRequest.scala) を参照する。
- コンパイル時安全性： [kamae-scala の `CompileTimeSafetySuite.scala`](https://github.com/manji-0/kamae-scala/blob/main/examples/src/test/scala/kamae/examples/CompileTimeSafetySuite.scala) — munitの `compileErrors` で `EnRouteRequest` が `WaitingRequest` の要求箇所に渡せないことを検証する。

## レビュー観点

### ミューテータは不変条件を保つか — High

クロスフィールドルール、ライフサイクル制限、合計、タイムスタンプ、所有権、テナントスコープに違反しうるセッターや部分更新メソッドを指摘する。

### 並行遷移は保護されているか — High

楽観的ロック、バージョンチェック、一意制約、冪等キー、シリアライザブルトランザクションなしに競合しうるライフサイクルや残高変更を指摘する。

バージョン付き保存とトランザクション境界の期待について [永続化、集約、イベント](/docs/kamae-scala/persistence-events/) も照合する。

### 認可とテナントチェックは遷移前に実施されているか — High

アクター、テナント、アカウント、能力の許可を証明する前に状態を遷移させるユースケースを指摘する。

### ドメインの match は網羅的で将来に強いか — Medium

各バリアントを明示的に扱うべきドメイン列挙型の `match` で `_` を使い将来のバリアントを隠している箇所を指摘する。

### 遷移は副作用が明示的でない限り純粋か — Medium

遷移メソッド内で永続化、ログ、メッセージ発行まで担う状態遷移を指摘する。状態とイベントを返し、副作用の調整はユースケースに任せることを提案する。

### 遷移関数は型でソース状態を制約しているか — Medium

特定の状態型を受け取れるのに、広い集約列挙型を受け取ってから実行時に状態を検査する関数を指摘する。

API、リポジトリ、シリアライズ、ディスパッチ境界の集約列挙型で、直ちに型付き状態ハンドラへ委譲する場合は指摘しない。

### ソース状態の消費で古い状態の再利用を防いでいるか — Low

遷移後にソース状態を使えなくすべき遷移では、引数として受け取った状態を消費することを提案する。
