---
title: "エラーハンドリング"
sidebar:
  order: 10
---

ドメインコードで `throw` やunsafe `.get` に頼ると、想定内のビジネス失敗とバグの区別がつかなくなる。Kamaeではドメイン固有のエラー ADTと `Either` で失敗を明示し、インフラエラーはアダプター境界で変換する。

ユースケースの流れは [状態遷移](/projects/kamae-scala/state-transitions/) とセット。エフェクト型の選び方はスキルリポジトリの `references/effect-systems.md` を参照する。

## ドメイン固有のエラー ADT を使う

ドメインおよびユースケースコードでは `Either[DomainError, T]` と、具体的なエラー enumまたはsealed traitを使う。

```scala
enum AssignDriverError:
  case RequestNotFound(requestId: RequestId)
  case InvalidState
  case DriverNotAvailable(driverId: DriverId)
  case Domain(cause: DomainError)
```

ドメイン関数から素の `Throwable`、`Exception`、`String` を返さない。それらはエラーを報告またはログするアプリケーション境界付近では許容される。

## ドメインコードで throw を避ける

ドメインおよびユースケースコードでは `throw`、`???`、unsafe `.get`、`.head`、`.last` を避ける。型付きエラーまたはテスト専用ヘルパーを使う。

許容される例外：

- テストとフィクスチャ
- 網羅的ドメイン推論と `compiletime.error` またはsealed集合上の `MatchError` で守られた真に到達不能な分岐
- クラッシュが意図された挙動であるプロセス起動時の設定失敗

## インフラエラーを意図的に変換する

インフラとアプリケーションロジックの境界で、repositoryおよびadapterエラーをユースケースエラーにマップする。

```scala
requests.findWaiting(requestId).attempt.map:
  case Left(cause) => Left(AssignDriverError.Repository(cause))
  case Right(value) => Right(value)
```

低レベルドライバのerror型を、明示的なプロジェクト慣習でない限り、ドメインユースケースの公開エラー契約にしない。

## エフェクトを伴うユースケース

Scalaサーバーコードでは、慣用的な形はエフェクトシステムに依存する。

| スタック | 典型的な形 |
| --- | --- |
| Cats Effect / FS2 | `F[Either[UseCaseError, T]]` または `ApplicativeError` による型付きエラー |
| ZIO | `ZIO[Any, UseCaseError, T]` |
| Future（レガシー） | `Future[Either[UseCaseError, T]]` と境界での明示的マッピング |

層を分離する：

| 層 | 典型的な形状 | エラー型 |
| --- | --- | --- |
| ドメイン遷移 | 同期メソッド | `DomainError` |
| ユースケース | エフェクトを伴う | `UseCaseError` とマップ済みバリアント |
| ポート / アダプタ | エフェクトを伴う trait メソッド | `RepositoryError`、`ClientError`、… |

可能ならドメイン遷移は同期かつ純粋に保つ。asyncはI/Oを伴うユースケースとアダプタに属する。

## cause フィールドでエラーを連鎖させる

インフラ失敗を包むときは、デバッグ用に元のcauseを名前付きフィールドに保持し、外部クライアント向けメッセージには露出しない。

```scala
enum AssignDriverError:
  case Repository(cause: Throwable)
```

外部クライアントへ返す前にcauseをredactまたは除去する。

## 推奨パターン: `Either` による早期リターン

```scala
enum AssignDriverError:
  case RequestNotFound(requestId: RequestId)
  case DriverNotAvailable(driverId: DriverId)
  case Domain(cause: DomainError)
  case PersistenceFailed

final case class DriverProfile(
    driverId: DriverId,
    acceptsAccessibilityRequests: Boolean
):
  def toAssignment: DriverAssignment =
    DriverAssignment(driverId, acceptsAccessibilityRequests)

trait TaxiRequestRepositorySync:
  def findWaiting(id: RequestId): Option[WaitingRequest]
  def saveAssigned(state: EnRouteRequest, events: List[TaxiRequestEvent]): Either[AssignDriverError, Unit]

def execute(command: AssignDriverCommand): Either[AssignDriverError, Unit] =
  for
    waiting <- requests
      .findWaiting(command.requestId)
      .toRight(AssignDriverError.RequestNotFound(command.requestId))
    profile <- drivers
      .findAvailable(command.driverId)
      .toRight(AssignDriverError.DriverNotAvailable(command.driverId))
    transition <- waiting
      .assignDriver(profile.toAssignment)
      .left
      .map(AssignDriverError.Domain.apply)
    _ <- requests.saveAssigned(transition.state, transition.events)
  yield ()
```

上記の同期ポートは制御フローを読みやすく保つ。エフェクトを伴うコードでは各ステップを `F[_]` に持ち上げ、返却前にリポジトリ失敗をマップする。[状態遷移](/projects/kamae-scala/state-transitions/#ユースケースを薄く保つ) のCats例を参照する。

ユースケースの配線はスキルリポジトリの `references/application-wiring.md` を参照する。

## レビューで見るところ

エラーテキストにメール・電話・トークン・生ボディが入っていないか。ドメインやユースケースで `throw` / `???` / unsafe `.get` が常態化していないか。排他リソースを `F` のbind / `await` またいで持っていないか。I/O付きドメイン遷移やインフラエラーの素通しがないか。DB / HTTP失敗を公開APIへそのまま出していないか。ドメインエラーが `Throwable` / `String` / catch-allになっていないか。呼び出し元が分岐すべきなのに曖昧なバリアントになっていないか。
