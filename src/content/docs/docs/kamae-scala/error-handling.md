---
title: "エラーハンドリング"
sidebar:
  order: 10
---

ドメインコードで `throw` や unsafe `.get` に頼ると、想定内のビジネス失敗とバグの区別がつかなくなる。Kamae ではドメイン固有のエラー ADT と `Either` で失敗を明示し、インフラエラーはアダプター境界で変換する。

ユースケースの流れは [状態遷移](/docs/kamae-scala/state-transitions/) とセット。エフェクト型の選び方はスキルリポジトリの `references/effect-systems.md` を参照する。

## ドメイン固有のエラー ADT を使う

ドメインおよびユースケースコードでは `Either[DomainError, T]` と、具体的なエラー enum または sealed trait を使う。

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

許容される例外:

- テストとフィクスチャ
- 網羅的ドメイン推論と `compiletime.error` または sealed 集合上の `MatchError` で守られた真に到達不能な分岐
- クラッシュが意図された挙動であるプロセス起動時の設定失敗

## インフラエラーを意図的に変換する

インフラとアプリケーションロジックの境界で、repository および adapter エラーをユースケースエラーにマップする。

```scala
requests.findWaiting(requestId).attempt.map:
  case Left(cause) => Left(AssignDriverError.Repository(cause))
  case Right(value) => Right(value)
```

低レベルドライバの error 型を、明示的なプロジェクト慣習でない限り、ドメインユースケースの公開エラー契約にしない。

## エフェクトを伴うユースケース

Scala サーバーコードでは、慣用的な形はエフェクトシステムに依存する。

| スタック | 典型的な形 |
| --- | --- |
| Cats Effect / FS2 | `F[Either[UseCaseError, T]]` または `ApplicativeError` による型付きエラー |
| ZIO | `ZIO[Any, UseCaseError, T]` |
| Future（レガシー） | `Future[Either[UseCaseError, T]]` と境界での明示的マッピング |

層を分離する:

| 層 | 典型的な形状 | エラー型 |
| --- | --- | --- |
| ドメイン遷移 | 同期メソッド | `DomainError` |
| ユースケース | エフェクトを伴う | `UseCaseError` とマップ済みバリアント |
| ポート / アダプタ | エフェクトを伴う trait メソッド | `RepositoryError`、`ClientError`、… |

可能ならドメイン遷移は同期かつ純粋に保つ。async は I/O を伴うユースケースとアダプタに属する。

## cause フィールドでエラーを連鎖させる

インフラ失敗を包むときは、デバッグ用に元の cause を名前付きフィールドに保持し、外部クライアント向けメッセージには露出しない。

```scala
enum AssignDriverError:
  case Repository(cause: Throwable)
```

外部クライアントへ返す前に cause を redact または除去する。

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

上記の同期ポートは制御フローを読みやすく保つ。エフェクトを伴うコードでは各ステップを `F[_]` に持ち上げ、返却前にリポジトリ失敗をマップする。[状態遷移](/docs/kamae-scala/state-transitions/#ユースケースを薄く保つ) の Cats 例を参照する。

ユースケースの配線はスキルリポジトリの `references/application-wiring.md` を参照する。

## レビュー観点

### エラーメッセージは PII とシークレットを避けているか — High

スキルリポジトリの `references/pii-protection.md` も照合する。メール、電話、トークン、生の SQL / HTTP ボディを埋め込むエラーテキストを指摘する。

### ドメインとユースケースコードで throw は避けているか — High

テスト、フィクスチャ、起動コード、真に到達不能な分岐以外での `throw`、`???`、unsafe `.get`、`.head` を指摘する。

### ロックは await 点をまたいで保持されていないか — High

プロジェクトが明示的に設計していない限り、ユースケースやアダプタで排他リソースを `F` の bind / `await` をまたいで保持する箇所を指摘する。

### エフェクトを伴うユースケースは正しく層分けされているか — Medium

I/O を伴うドメイン遷移、マッピングなしにエフェクト境界を通過するインフラエラー型を指摘する。

### インフラエラーは意図的に変換されているか — Medium

DB ドライバエラー、HTTP クライアントエラー、設定エラーを公開ドメイン / ユースケース API へそのまま漏らす箇所を指摘する。

### ドメインエラーは具体的な ADT か — Medium

ドメインコンストラクタやユースケースから不透明な catch-all エラー、`Throwable`、`String` を返す箇所を指摘する。

### エラーバリアントは呼び出し元にとって意味があるか — Low

呼び出し元が網羅的に分岐する必要があるのに曖昧なバリアントを指摘する。
