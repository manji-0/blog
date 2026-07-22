---
title: "アプリケーション配線"
sidebar:
  order: 10
---

ユースケースクラスがオーケストレーション（読み込み → 認可 → 遷移 → 永続化）を所有し、ルートやハンドラは薄い入口に留める。具象のJDBCクライアントやHTTPクライアントをドメインに漏らすと、テストが実インフラに依存し、変更の影響範囲も読み取れなくなる。

リポジトリtraitの形は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/)、失敗の層分けは [エラーハンドリング](/projects/kamae-scala/error-handling/)、effectの選び方は [エフェクトシステム](/projects/kamae-scala/effect-systems/) と整合させる。

<!-- constrained-by ./error-handling.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./effect-systems.md -->

## 基本方針

ドメイン遷移は純粋かつ小さく保つ。副作用を持たせない。読み込みから保存までの順序はportに依存するユースケースクラスが所有する。adapterの配線はcomposition rootだけが行う。

サービスロケータ、グローバルsingleton、重いDIコンテナより、明示的なコンストラクタ依存を優先する。

## ポートとアダプタ

- **Port**: アプリケーションまたはドメインパッケージ内の小さなtrait。ユースケースが必要とすることを述べる（`TaxiRequestResolver`、`TaxiRequestStore`、`PaymentGateway`）。
- **Adapter**: そのportのインフラ実装（`DoobieTaxiRequestStore`、`StripePaymentGateway`）。

portはORMテーブルやクライアントSDK表面ではなく、ユースケースのニーズに合わせる。

```scala
trait TaxiRequestResolver[F[_]]:
  def findWaiting(id: RequestId): F[Option[WaitingRequest]]

trait TaxiRequestStore[F[_]]:
  def saveAssigned(
      expectedVersion: AggregateVersion,
      state: EnRouteRequest,
      events: List[TaxiRequestEvent]
  ): F[Either[RepositoryError, Unit]]
```

port traitを通してdoobie`SQLException`、http4sステータス、SDK型を漏らさない。

## 依存を持つクラスとしてユースケースをモデル化する

各ユースケースにクラスを与え、portをコンストラクタ経由で注入する。Catsではtagless-final`F[_]`がデフォルト。プロジェクトがすでにZIOを標準化しているならZIOレイヤーでもよい。

```scala
import cats.Monad
import cats.syntax.all.*

final class AssignDriver[F[_]: Monad](
    resolver: TaxiRequestResolver[F],
    store: TaxiRequestStore[F]
):
  def execute(
      requestId: RequestId,
      driver: DriverAssignment
  ): F[Either[AssignDriverError, Unit]] =
    resolver.findWaiting(requestId).flatMap:
      case None =>
        Monad[F].pure(Left(AssignDriverError.RequestNotFound(requestId)))
      case Some(waiting) =>
        waiting.assignDriver(driver) match
          case Left(err) =>
            Monad[F].pure(Left(AssignDriverError.Domain(err)))
          case Right(transition) =>
            store
              .saveAssigned(transition.expectedVersion, transition.state, transition.events)
              .map(_.leftMap(AssignDriverError.Repository.apply))
```

ユースケースが一貫したトランザクションまたはワークフローを所有するときは、裸の関数引数の羅列よりこの形を優先する。ZIO variantは [エフェクトシステム](/projects/kamae-scala/effect-systems/) を参照。

## 配線スタイルを意図的に選ぶ

| スタイル | 使うとき | 避けるとき |
| --- | --- | --- |
| tagless-final`F[_]` port | Cats Effectサービスとテストのデフォルト | アプリ全体がすでにZIO専用のとき以外にCatsを無理に使う |
| ZIOレイヤー / `ZIO[Env, E, A]` | プロジェクトがZIOを標準化している | 見た目のparityのためだけにlayerを導入する |
| 明示コンストラクタ引数 | ライブラリ、バイナリ、多くのサービス | 名前付きユースケースなしにワークフローが肥大化したとき |
| Reader / environment渡し | コードベース全体が一貫して使っている | FP美学のためだけに導入する |
| MacWire / Distageなど | プロジェクトがすでに1つに標準化している | 前例なしに重いDIを新設する |

プロジェクトがすでに標準化していない限り、DIフレームワークを導入しない。`Main` / `Bootstrap`での手動配線で足りることが多い。

## コンポジションルートで配線する

adapterとユースケースは`Main`、`bootstrap`オブジェクト、ZIO layer組み立て、もしくはテストfixtureで構築する。ハンドラは完成したユースケースかapplication stateを受け取り、インフラを自分で組み立てない。

```scala
// Main.scala or Bootstrap.scala
val xa = Transactor.fromDriverManager[IO](...)
val resolver = DoobieTaxiRequestResolver(xa)
val store = DoobieTaxiRequestStore(xa)
val assignDriver = AssignDriver(resolver, store)

val httpApp = TaxiRequestRoutes(assignDriver).orNotFound
```

テストではportをfakeまたはin-memory adapterに差し替える。fake portで足りるならドメインとユースケーステストから実DBを外す。[開発環境](/projects/kamae-scala/dev-environment/)のfake portパターンを参照。

## ドメインコードから副作用を追い出す

ドメイン遷移は`Either[DomainError, Transition[_, _]]`（または同等）を返す。ユースケースがload、authorize、transition、persist、publishの順序を所有する。リポジトリとクライアントはportの背後に留める。

ハンドラがSQLやHTTPを直接呼び始めたら、portを抽出しワークフローをユースケースクラスへ移す。

## エッジでのエラーマッピング

HTTP / gRPC / CLI adapterが`UseCaseError`をレスポンスコードとクライアント向けメッセージにマップする。リポジトリ例外の文字列をデフォルトで漏らさない。[エラーハンドリング](/projects/kamae-scala/error-handling/)を参照。

## レビューで見るところ

- ハンドラやドメインが具象DB / HTTPクライアントに依存していないか。
- ユースケースがport経由でオーケストレーションを所有しているか。
- composition root以外でadapterを`new`していないか。
- port traitにインフラ型が漏れていないか。

