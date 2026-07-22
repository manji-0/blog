---
title: "エフェクトシステム"
sidebar:
  order: 10
---

ドメイン遷移は**同期かつ純粋**のままに保つ。Effect型はユースケース、リポジトリport、adapterに属する。Cats Effect、FS2、ZIOの配線を選ぶ・レビューするときに読む。

関連： [エラーハンドリング](/projects/kamae-scala/error-handling/)、[アプリケーション配線](/projects/kamae-scala/application-wiring/)、[状態遷移](/projects/kamae-scala/state-transitions/)。

## プライマリスタックを 1 つ選ぶ

| スタック | ユースケース形状 | エラーチャネル |
| --- | --- | --- |
| Cats Effect + FS2 | `F[Either[UseCaseError, A]]` または `ApplicativeError` 付き `F[A]` | 明示 `Either` または型クラス経由の型付きエラー |
| ZIO | `ZIO[Env, UseCaseError, A]` | `ZIO` の型付きエラーチャネル |
| `Future`（レガシー） | `Future[Either[UseCaseError, A]]` | 明示 `Either`。ビジネス失敗に素の `Future[A]` を避ける |

サービス境界ごとに1スタックを選ぶ。同一use-case層で `IO`、`ZIO`、`Future` を混ぜるにはコンポジションルートでの明示変換が必要になる。

## Cats Effect パターン

ドメインコードから `F[_]` を追い出す：

```scala
import cats.Monad

final class AssignDriver[F[_]: Monad](
    requests: TaxiRequestRepository[F],
    drivers: DriverRepository[F]
):
  def execute(command: AssignDriverCommand): F[Either[AssignDriverError, Unit]]
```

完全なCats Effect例は [状態遷移](/projects/kamae-scala/state-transitions/#ユースケースを薄く保つ) を参照。

インフラ失敗は `.flatMap` サイトでマップする：

```scala
requests.findWaiting(id).attempt.flatMap:
  case Left(cause) => Monad[F].pure(Left(AssignDriverError.Repository(cause)))
  case Right(value) => ...
```

プロジェクトがすでに標準化している場合のみ `MonadError` / `ApplicativeError` を使う。明示的ビジネスエラーには `F[Either[E, A]]` がKamaeの既定形状である。

[ライブラリガイド（cats）](/projects/kamae-scala/library-guides/#cats) を参照。

## ZIO パターン

```scala
final class AssignDriver(
    requests: TaxiRequestRepository,
    drivers: DriverRepository
):
  def execute(command: AssignDriverCommand): ZIO[Any, AssignDriverError, Unit] =
    for
      waiting <- requests.findWaiting(command.requestId).someOrFail(AssignDriverError.RequestNotFound(command.requestId))
      profile <- drivers.findAvailable(command.driverId).someOrFail(AssignDriverError.DriverNotAvailable(command.driverId))
      transition <- ZIO.fromEither(waiting.assignDriver(profile.toAssignment).left.map(AssignDriverError.Domain.apply))
      _ <- requests.saveAssigned(transition.state, transition.events)
    yield ()
```

ビジネス失敗には `ZIO` の型付きエラーチャネルを使う。プロジェクトがエッジで明示的に許可しない限り、公開use-caseエラーに `Throwable` を使わない。

[ライブラリガイド（zio）](/projects/kamae-scala/library-guides/#zio) を参照。

## レイヤリングルール

| レイヤ | Effect? | 備考 |
| --- | --- | --- |
| Domain transition | いいえ | `Either[DomainError, T]` のみ |
| Use case | はい | port をオーケストレート |
| Repository port | はい | row ではなくドメイン型を返す |
| HTTP / RPC adapter | はい | use-case エラーをレスポンスにマップ |

ユースケースやドメインコード内で `F` をブロックしない（`Await.result`、`.unsafeRunSync()`）。

## テスト

- ドメインテスト： 純粋、effectランタイム不要。
- ユースケーステスト： `Identity` / `StateT` fake、またはZIOレイヤーのstub interpreter。
- 統合テスト： adapter境界だけで実ランタイム（`IOSuite`、`ZIOSpecDefault`）。

[ライブラリガイド（cats）](/projects/kamae-scala/library-guides/#cats) と [ライブラリガイド（zio）](/projects/kamae-scala/library-guides/#zio) を参照。
