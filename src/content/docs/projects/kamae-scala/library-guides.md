---
title: "ライブラリガイド"
sidebar:
  order: 5
  label: "ライブラリガイド（参照）"
---

Cats、Circe、doobieなどはKamaeのドメイン規約を**補助**するライブラリである。トピック別リファレンス（エラーハンドリング、境界防御など）と矛盾する場合は、そちらを優先する。

ここでは「よくある組み合わせ」とデフォルトの置き場所をまとめる。個別の設計判断は [エラーハンドリング](/projects/kamae-scala/error-handling/)、[境界防御](/projects/kamae-scala/boundary-defense/)、[ドメインモデリング](/projects/kamae-scala/domain-modeling/)、[PII 保護](/projects/kamae-scala/pii-protection/) を参照する。

| 用途 | ガイド付きライブラリ | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| エフェクト | `cats-core`、`cats-effect`、`zio` | `monix`、`scalaz` |
| JSON | `circe` | Play JSON、`jsoniter-scala` |
| HTTP | `http4s`、`sttp` | Pekko HTTP、Play |
| 設定 | `pureconfig` | `caliban` config、Typesafe Config 直読み |
| SQL / ORM | `doobie`、`slick` | Quill、skunk |
| ストリーム | `fs2` | Akka Streams、Pekko Streams |
| 検証 / newtype | `refined` | `newtype`、手書き opaque type |
| PII / シークレット | opaque credential wrapper（本ガイド [secrets](#secrets)） | `vault` 連携、環境変数直読み |
| テスト | `scalacheck`、`munit` | `ScalaTest`、`specs2` |

## cats

`cats` または `cats-effect` があるとき：

- ユースケースtraitに `Monad`、`Functor`、`ApplicativeError` 制約を適切に使う
- 十分な理由がなければドメイン遷移を `F[_]` から解放する
- アダプター境界で `attempt` / `handleErrorWith` によりエラーをマップする
- I/Oには `IO` / `F` の遅延を優先し、`flatMap` 内で `blocking` なしにブロックしない

エラーチャネルでは、純粋ドメインコードの `Either` と、アプリケーションコードの `F[Either[E, A]]` または `ApplicativeError[F, E, *]` は、一貫して使えばどちらも許容される。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `cats-effect` + ポート | リポジトリ trait は `F[_]`、実装は `IO` | [アプリケーション配線](/projects/kamae-scala/application-wiring/) |
| `ApplicativeError` + ユースケース | ビジネス失敗を型付きエラーで表現 | [エラーハンドリング](/projects/kamae-scala/error-handling/) |
| `Either` + ドメイン | 遷移は純粋 `Either`、ユースケースが `fromEither` | [状態遷移](/projects/kamae-scala/state-transitions/) |

## zio

ZIOがあるとき：

- ユースケースを `ZIO[Env, UseCaseError, A]` でモデルする
- ドメイン遷移は純粋に保ち、`ZIO.fromEither` で呼ぶ
- レイヤーはcomposition rootのみで提供する
- ビジネス失敗には `Throwable` ではなく型付きエラーをエラーチャネルに使う

ドメインパッケージは、プロジェクトがエフェクト型をアプリケーションコードと明示的に同居させない限り `zio` に依存しない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `ZLayer` + ポート | アダプター実装のみレイヤー化 | [アプリケーション配線](/projects/kamae-scala/application-wiring/) |
| `ZIO` + `Either` 遷移 | `fromEither` でドメインを呼ぶ | [状態遷移](/projects/kamae-scala/state-transitions/) |

## circe

CirceはJSON境界向けであり、ドメイン不変条件の権威にはしない。

### DTO に Codec を付ける

```scala
import io.circe.Decoder

final case class RequestDto(requestId: String, passengerId: String, status: String)

object RequestDto:
  given Decoder[RequestDto] = Decoder.derived
```

`Decoder.derived` はビジネスルールを検証しない。ネストしたフィールドのcodecも、implicit scopeに `Decoder` がない限り自動導出されない。

### ドメイン型にはバリデータを使う

DTOにデコードし、明示的な `Either` マッピングで変換する。検証がdecoderに埋め込まれテストされている場合を除き、不変条件を持つ型に `Decoder[WaitingRequest]` を避ける。

```scala
def decodeWaiting(dto: RequestDto): Either[BoundaryError, WaitingRequest] =
  for
    requestId <- RequestId(dto.requestId).left.map(BoundaryError.InvalidId.apply)
    passengerId <- PassengerId(dto.passengerId).left.map(BoundaryError.InvalidId.apply)
    _ <- Either.cond(dto.status == "waiting", (), BoundaryError.UnexpectedStatus(dto.status))
  yield WaitingRequest(requestId, passengerId, requiresAccessibleVehicle = false)
```

### 設定付き導出

snake_caseキー、デフォルト、判別子が必要なときは `Configuration` を提供し、configured derivationを使う：

```scala
import io.circe.derivation.Configuration

given Configuration = Configuration.default.withSnakeCaseMemberNames

object RequestDto:
  given Decoder[RequestDto] = Decoder.derivedConfigured
```

### 和型と enum

sealed familyには `Codec.AsObject.derived` が既知のsubtypeを自動導出する。単純なenum:

```scala
enum Status derives Decoder, Encoder:
  case Waiting, EnRoute
```

外部制御のstatus文字列には明示的decoderを優先し、任意の文字列をドメインenumに受け入れない。

### Play JSON

Play JSONを使うプロジェクトでも境界ルールは同じ： DTOに `Reads` / `Writes`、その後にドメイン型への検証付き変換。`Json.format` 導出を不変条件の強制とみなさない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `circe` + DTO | `Decoder` → `Either` マッピング | [境界防御](/projects/kamae-scala/boundary-defense/) |
| `circe` + http4s | `EntityDecoder` で DTO、ハンドラでドメイン変換 | [境界防御](/projects/kamae-scala/boundary-defense/) |
| `circe` + イベント | 外向きイベント DTO のみ codec | [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) |

## doobie

doobieはSQLアダプター向けであり、ドメインモデリング向けではない。

### 行は境界型

`Read` / `Write` インスタンスはinfrastructureの行case classに置く。リポジトリポートから返す前に、明示的な `Either` マッパーで行をドメイン型にマップする。

### トランザクションはアダプターに属する

ドメイン遷移内ではなく、アダプターまたはユースケース境界で `transact(xa)` を使う。1コマンドの状態変更とoutbox挿入は同一トランザクションを共有する。

### ConnectionIO を漏らさない

リポジトリtraitはポートレベルで `F[_]`（通常 `IO`）を使う。`ConnectionIO` はアダプター実装内に留める。

詳細は [ORM アダプター](/projects/kamae-scala/orm-adapters/) を参照する。

## slick

プロジェクトがすでにSlickを標準とするとき、SQLアダプターに使う。

### テーブル定義は infrastructure に留める

`Table` サブクラス、`DBIO`、profile importをドメインモジュールから出す。リポジトリポートは `F[_]` とドメイン型のみを使う。

### 返す前にマップする

`RequestRow`（相当）をアダプター内で、[ORM アダプター](/projects/kamae-scala/orm-adapters/) と同じ検証マッパーでドメイン状態に変換する。

### セッションとトランザクション

`db.run(...transactionally)` をアダプターが所有する。`Database` や `DBIO` をユースケースに渡さない。

ドメインマッピング中のlazy loadや外部キー関係のナビゲーションを避け、必要な状態の列を明示的にクエリする。

## fs2

FS2は読み取り側のストリームポート、outboxディスパッチ、プロジェクション向けに使う。

### ストリームをドメインから出す

ドメイン遷移は `Either` とイベントリストを返す。アダプターが永続化ログやoutboxテーブル上の `Stream[F, A]` を公開する。

### ストリーム要素には型付きエラーを優先する

`Stream[F, Either[StreamError, DomainEvent]]` はマッパーとデコード失敗を明示的に保つ。メトリクスとデッドレターポリシーなしに `handleErrorWith(_ => Stream.empty)` で失敗を飲み込まない。

### キャンセル

`interruptWhen` またはファイバキャンセルでストリームをコンパイルし、コンシューマ切断時にDBポーリングを止める。

詳細は [ストリームと継続クエリ](/projects/kamae-scala/stream-continuous-queries/) を参照する。

## refined

`eu.timepit.refined` は境界または単一フィールド不変条件向けの検証付きプリミティブnewtypeに使う。検証メッセージをドメイン固有にする必要があるドメインモジュールでは、明示的 `Either` ファクトリ付きopaque typeを優先する。

### 使うとき

- 形式ルール付きのconfigキー、クエリパラメータ、DTOフィールド（非空、UUID、正のInt）
- 段階的導入： 完全なドメインモデリング前にレガシー `String` / `Int` 列をラップする

### 使わないとき

- 複数フィールドまたは状態依存ルール — ドメイン型と遷移を使う
- ORMマッピングがrefined述語を曖昧にする永続化集約ルート

### パターン

```scala
import eu.timepit.refined.api.*
import eu.timepit.refined.collection.NonEmpty
import eu.timepit.refined.refineEither

type NonEmptyString = String Refined NonEmpty

def parseRequestId(raw: String): Either[BoundaryError, NonEmptyString] =
  refineEither[NonEmpty](raw).left.map(_ => BoundaryError.EmptyId("request_id"))
```

refined DTOフィールドを、アダプター境界で明示的エラー ADT付きopaqueドメインIDにマップする。[境界防御](/projects/kamae-scala/boundary-defense/)、[ドメインマクロ](/projects/kamae-scala/domain-macros/) も参照する。

## secrets

完全なパターンは [PII 保護](/projects/kamae-scala/pii-protection/) を優先する。本節は資格情報とAPIキー向けのScala固有デフォルトを扱う。

ドメインまたはユースケース層に生の `String` でシークレットを置かない。`toString` を制限したopaque type、あるいは生値を決してログしない専用wrapperを優先する。

```scala
final class ApiToken private (private val value: String):
  override def toString: String = "ApiToken(***)"

object ApiToken:
  def parse(raw: String): Either[BoundaryError, ApiToken] =
    if raw.trim.isEmpty then Left(BoundaryError.EmptyField("api_token"))
    else Right(new ApiToken(raw.trim))

  extension (token: ApiToken) def expose: String = token.value
```

シークレット値の露出はHTTP / auth / payment境界の狭いアダプター関数（`expose`、`value`）に限定する。露出した値をerror ADTに含めない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| opaque secret + アダプター | auth モジュールのみ `expose` | [PII 保護](/projects/kamae-scala/pii-protection/) |
| ログ | token フィールドをログしない。構造化 `***` プレースホルダ | [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) |
| PII vs secrets | 個人データは redacted 型、資格情報は secret wrapper | [PII 保護](/projects/kamae-scala/pii-protection/) |

検出のみ： `pureconfig` のsecret loader — 境界で検証し、ドメインコード実行前にopaque型へマップする。

## scalacheck

プロジェクトがすでに依存している場合、またはプロパティテストが入力全体の法則を最も明確にカバーできる場合に使う。

`Test` スコープに置く。無効なドメイン状態を直接構築するより、publicコンストラクタを呼ぶgeneratorを優先する。

```scala
import org.scalacheck.Prop.forAll
import org.scalacheck.Gen

property("valid ids construct") {
  forAll(nonEmptyStringGen) { raw =>
    RequestId(raw.trim).isRight
  }
}
```

generator設計、状態プロパティ、CI予算、regressionファイルは [プロパティベーステスト](/projects/kamae-scala/property-based-tests/) を参照する。

## pureconfig

PureConfigは設定ファイルを読む。ドメインコマンドを読まない。

### 設定 case class は境界型

デフォルトを明示的に文書化したcase classに設定をロードし、ドメイン型へ検証する。

### シークレット

起動時ログされる平文configフィールドにシークレットを置かない。環境別secretプロバイダとredacting wrapperを使う。

[境界防御](/projects/kamae-scala/boundary-defense/) も参照する。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `pureconfig` + 起動 | config case class → ドメイン検証 | [境界防御](/projects/kamae-scala/boundary-defense/) |
| `pureconfig` + secrets | 読み込み後すぐ opaque 型へ | [PII 保護](/projects/kamae-scala/pii-protection/) |

## http4s

HTTP adapter（ルート、クライアント、ミドルウェア）向け。ドメインモデリングには使わない。

### ルートは薄く保つ

ルートはワイヤ形状の抽出、ドメインコマンドへの変換、ユースケース呼び出し、エラーの応答マップに留める。遷移、認可方針、SQLを `HttpRoutes` に置かない。

```scala
def assignDriverRoutes(useCase: AssignDriver[IO]): HttpRoutes[IO] =
  HttpRoutes.of:
    case req @ POST -> Root / "requests" / id / "assign" =>
      for
        actor <- authenticate(req)
        body  <- req.as[AssignDriverBody]
        cmd   <- IO.fromEither(AssignDriverCommand.from(actor, id, body))
        out   <- useCase.execute(actor, cmd)
        resp  <- out.fold(toErrorResponse, _ => NoContent())
      yield resp
```

### Entity codec は DTO に置く

`http4s-circe` 等の `EntityDecoder` / `EntityEncoder` はリクエスト/レスポンスDTOのみ。JSON → DTO → 検証付きマッパー → ドメインコマンド。集約ルートや不変条件付きドメイン型にはcodecをderiveしない。[circe](#circe) も参照。

### コマンド前に認可

パスやボディからドメインコマンドを組み立てる前に、認証と認可（テナント/アクター）を行う。セッションがテナント範囲を持つとき、パスの `tenantId` は信頼しない。[境界防御](/projects/kamae-scala/boundary-defense/) を参照。

### エラーマップは端で集約

| ユースケースエラー | 典型HTTP |
| --- | --- |
| validation / decode | 400 |
| authz / テナント不一致 | 403（方針により404） |
| not found | 404 |
| 並行変更 | 409 |
| 冪等リプレイ | 200 / 204（元結果） |
| 予期せぬインフラ | 500（生例外文字列なし） |

### クライアントも adapter

`Client[F]` wrapperはインフラに置く。タイムアウト、リトライ、サーキットブレーカはクライアント層。失敗は型付き `ClientError` / ユースケースエラーへ。冪等GETまたはキー付き書き込みだけリトライする。[サービス境界](/projects/kamae-scala/service-boundaries/) を参照。

### ミドルウェア配置

ログ、メトリクス、相関ID、トレースはcomposition rootでHTTPアプリを包む。アクセスログにTier A/B PIIを出さない。[ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) と [PII 保護](/projects/kamae-scala/pii-protection/) を参照。

テストはfakeユースケース付きの `http4s-munit`（またはEmber/Blaze test client）を優先し、fake portで足りるなら実DBを避ける。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `http4s` + circe | DTO codec、ハンドラでドメイン変換 | [境界防御](/projects/kamae-scala/boundary-defense/) |
| `http4s` + ユースケース | 薄いルート、端でエラーマップ | [サービス境界](/projects/kamae-scala/service-boundaries/) |

## sttp

送信HTTPクライアント向け。ドメイン遷移や純粋ユースケースロジックの中では使わない。

### クライアントはポートの裏に置く

ユースケースへは小さなポート（`BillingGateway`、`GeocodingClient`）を公開する。`SttpBackend`、URIテンプレ、JSON codecはadapterに残す。

```scala
trait BillingGateway[F[_]]:
  def charge(cmd: ChargeCommand): F[Either[BillingError, ChargeReceipt]]

final class SttpBillingGateway[F[_]: Sync](
    backend: SttpBackend[F, Any],
    baseUri: Uri
) extends BillingGateway[F]:
  def charge(cmd: ChargeCommand): F[Either[BillingError, ChargeReceipt]] =
    // DTOからリクエスト構築 → 送信 → 応答DTOデコード → ドメインへ
    ...
```

`Response[String]` やCirce `Json` をドメインモジュールへ渡さない。

### 応答は DTO としてデコード

成功ボディを応答DTOにデコードし、検証付きマッパーで変換する。4xx/5xxは型付きadapterエラー。空ボディへの `.get` やエラーステータスでの成功JSON前提はしない。inboundと同じCirce DTO規則を優先する。

### タイムアウトとリトライは backend 側

read/connectタイムアウトとリトライ方針はbackendかリクエストオプションで設定する。冪等GET、もしくは冪等キー付き書き込みだけリトライする。timeout / 接続失敗は `BillingError.Timeout` / `Unavailable` など型付きエラーへ。[サービス境界](/projects/kamae-scala/service-boundaries/) を参照。

### シークレットとヘッダ

APIキーとbearerはopaque secret wrapperに置く。リクエスト構築時にadapterで注入し、AuthorizationをログやエラーADTに出さない。[secrets](#secrets) と [PII 保護](/projects/kamae-scala/pii-protection/) を参照。

### 相関コンテキスト

ingressの `correlation_id` / traceヘッダをoutboundへ伝播する。設定はadapter端。ドメインコードでは行わない。[ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) を参照。

ユースケーステストではポートをfakeする。adapterテストはライブ端点よりstub backendや記録フィクスチャを優先する。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `sttp` + ポート | gateway trait、adapter実装 | [アプリケーション配線](/projects/kamae-scala/application-wiring/) |
| `sttp` + レジリエンス | backendでtimeout/retry | [サービス境界](/projects/kamae-scala/service-boundaries/) |
