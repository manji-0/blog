---
title: "境界防御"
sidebar:
  order: 10
---

CirceやDBドライバは「要求された形状」を満たすことは証明しても、ドメイン上の意味（有効ID、テナント境界、金額の単位など）は保証しない。外部データはDTOで受け、検証付き変換でドメイン型へ変換する二段構えとする。

状態とopaque typeの設計は [ドメインモデリング](/projects/kamae-scala/domain-modeling/)、エラーの返し方は [エラーハンドリング](/projects/kamae-scala/error-handling/)、ORM分離は [ORMアダプタ](/projects/kamae-scala/orm-adapters/)、サービス間契約は [サービス境界](/projects/kamae-scala/service-boundaries/) を参照する。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./orm-adapters.md -->
<!-- constrained-by ./service-boundaries.md -->

## デシリアライズは形状パースに留める

JSONや行データが「形として正しい」ことと「ビジネスとして許可される」ことは別問題である。二段変換を省略すると、後段のドメインコードが暗黙に外部形状を信頼してしまう。

```scala
final case class CreateRequestDto(passengerId: String)

object CreateRequestDto:
  def toCommand(dto: CreateRequestDto): Either[CreateRequestError, CreateRequestCommand] =
    PassengerId(dto.passengerId)
      .left.map(CreateRequestError.InvalidPassengerId.apply)
      .map(CreateRequestCommand(_))
```

## すべての外部境界で検証する

次の境界ではDTO → ドメイン変換を適用する：

- HTTPおよびRPCリクエスト
- DB行とクエリ結果
- キューメッセージとwebhook
- ファイル、環境変数、設定
- CLI引数

生の`String`、`Json`、DB行フィールドから、コンストラクタが不変条件を検証しない限り、ドメイン型を直接構築しない。

## API、DB、ドメイン型を分離する

デフォルトでは、ドメイン集約にCirce`Encoder`/`Decoder`、Play JSONフォーマット、doobie`Read`/`Write`を付けない。外部表現が異なる、または不変条件を迂回できる場合はDTO/row structを使う。

小さな内部ツールや、本当に不変条件のない値オブジェクトでは例外もあり得る。重要な場合は理由を明記する。

## レビュー観点との対応

| トピック | 節 |
| --- | --- |
| すべての境界でDTO → ドメイン | [すべての外部境界で検証する](#すべての外部境界で検証する) |
| codecは形状パースであり検証ではない | [デシリアライズは形状パースに留める](#デシリアライズは形状パースに留める) |
| 過剰deriveしたドメインエンティティを避ける | [API、DB、ドメイン型を分離する](#apidbドメイン型を分離する) |
| DTOのdefaultと未知フィールド | [DTOのdefaultと未知フィールド](#dtoのdefaultと未知フィールド) |
| 認可とテナント境界 | [認可とテナントチェック](#認可とテナントチェック) |
| 検証付きリーフのデシリアライズ | [値オブジェクト向けCirce](#値オブジェクト向けcirce) |

## 認可とテナントチェック

パス、クエリ、ボディ、メッセージでテナントや主体を名指すフィールドは、認証コンテキストと照合するまで信頼しない。ドメイン状態を読み込む前に、ユースケースまたは専用policyポートで検証する。

```scala
final case class AuthenticatedActor(tenantId: TenantId, actorId: ActorId)

final class AssignDriver[F[_]: Monad](
    resolver: TaxiRequestResolver[F],
    store: TaxiRequestStore[F]
):
  def execute(
      actor: AuthenticatedActor,
      cmd: AssignDriverCommand
  ): F[Either[AssignDriverError, Unit]] =
    if cmd.tenantId != actor.tenantId then
      Monad[F].pure(Left(AssignDriverError.TenantMismatch))
    else
      resolver.findWaiting(cmd.requestId).flatMap:
        case None =>
          Monad[F].pure(Left(AssignDriverError.NotFound))
        case Some(waiting) if waiting.tenantId != actor.tenantId =>
          Monad[F].pure(Left(AssignDriverError.Forbidden))
        case Some(waiting) =>
          // transition and persist ...
          Monad[F].pure(Right(()))
```

ルール：

- セッションやトークンがすでにテナントスコープを持つとき、リクエストボディの`tenantId`を信頼しない。
- HTTP層だけでなく、ロード後に集約の所有権を比較する。
- 認可失敗は型付きドメインまたはユースケースエラーにマップする。プロダクト方針で要求されない限り、テナント間でリソースの存在有無を漏らさない。

## DTOのdefaultと未知フィールド

インバウンドDTOのdefault引数と`Option`の黙った`None`変換は、クライアントがフィールドを省略したりプロキシが除去したりすると、ビジネス意味を黙って変えうる。

```scala
// 危険: 省略されたcancelFeeWaivedがfalseになり「未指定」ではない
final case class CancelRequestDto(cancelFeeWaived: Boolean = false)
```

推奨：

- 省略に意味がある場合は`Option[T]`または明示enum（`Unspecified | Yes | No`）
- クライアントが送るべきフィールドはdefaultなしで必須とする
- 部分更新と完全置換が異なる場合はcreate/update DTOを分ける

### 未知フィールドを拒否するタイミング

次の場合、インバウンドDTOに厳密デコード（未知キーで失敗する`Decoder`、Play JSONの明示フィールドのみ）を設定する：

- APIがバージョン管理され、typoを即失敗させたい（`passengerId`と`passenger_id`）
- 綴り違いフィールドが無視され、誤った意味で成功してしまう
- 生産者と消費者の双方をコントロールできる、または互換ポリシーが厳密パースを許容する

厳密拒否を省略する場合：

- 公開APIが将来互換のクライアント拡張を受け入れる必要がある
- webhookや第三者ペイロードに、保存または黙認する未知フィールドがある

アウトバウンドDTOでは安定フィールド名と明示optionalに注力する。

## 値オブジェクト向けCirce

不変条件を持つ単一フィールドのリーフ型では、通常コードと同じコンストラクタにデシリアライズを委譲する。[ライブラリガイド（circe）](/projects/kamae-scala/library-guides/#circe)と[ライブラリガイド（refined）](/projects/kamae-scala/library-guides/#refined)も参照。

```scala
opaque type EmailAddress = String
object EmailAddress:
  def apply(raw: String): Either[EmailAddressError, EmailAddress] = ...

  given Decoder[EmailAddress] =
    Decoder.decodeString.emap(raw => apply(raw).left.map(_.getMessage))

  given Encoder[EmailAddress] =
    Encoder.encodeString.contramap(identity)
```

IDやメールなどのリーフ型にconstructor-backed codecを使う。コマンドや集約にはDTO → `Either`を優先する。DTOを避けるために集約へcodecだけを付けない。フィールド横断ルールは明示mapperに属する。

## HTTPハンドラ（http4s / Pekko HTTP）

ハンドラは薄く保つ。ワイヤ形状をextractし、ドメインコマンドに変換し、ユースケースを呼ぶ。

```scala
// http4s sketch
def assignDriverRoutes(useCase: AssignDriver[IO]): HttpRoutes[IO] =
  HttpRoutes.of:
    case req @ POST -> Root / "requests" / requestId / "assign" =>
      for
        actor <- authenticate(req)
        body  <- req.as[AssignDriverBody]
        cmd   <- IO.fromEither(
                   AssignDriverCommand.from(actor.tenantId, requestId, body)
                 )
        result <- useCase.execute(actor, cmd)
        resp   <- result.fold(mapError, _ => NoContent())
      yield resp
```

Extractorはトランスポート形状（JSON、パスセグメント）を証明する。検証付きコンストラクタはドメイン意味を証明する。ユースケースエラーは1つのadapterモジュールでHTTPステータスにマップする。

## データベース行（Doobie / Slick）

行をrow structにマップし、ドメイン型に変換する。ドメインエンティティにdoobie`Read`/`Write`やSlick列マッピングを付けない。

```scala
final case class WaitingRequestRow(
    requestId: String,
    passengerId: String,
    tenantId: String,
    version: Long
)

object WaitingRequestRow:
  def toDomain(row: WaitingRequestRow): Either[RepositoryError, Versioned[WaitingRequest]] =
    for
      requestId <- RequestId(row.requestId).left.map(RepositoryError.CorruptRow.apply)
      passengerId <- PassengerId(row.passengerId).left.map(RepositoryError.CorruptRow.apply)
      tenantId <- TenantId(row.tenantId).left.map(RepositoryError.CorruptRow.apply)
      version <- AggregateVersion(row.version).left.map(RepositoryError.CorruptRow.apply)
      waiting <- WaitingRequest(requestId, passengerId, tenantId)
                   .left.map(RepositoryError.CorruptRow.apply)
    yield Versioned(waiting, version)
```

リポジトリadapterは行をデコードし`toDomain`を呼ぶ。無効な保存データはドメインコードで例外を投げず`RepositoryError.CorruptRow`になる。[ORMアダプタ](/projects/kamae-scala/orm-adapters/)を参照。

## 設定と環境変数

env/設定をsettings DTO（PureConfig、Circe、Typesafe Config）にパースし、検証済み範囲と単位を持つドメイン設定型に変換する。

```scala
final case class BookingSettingsDto(
    maxPassengers: Int,
    currencyCode: String,
    assignmentTimeoutSecs: Long
)

object BookingSettingsDto:
  def toDomain(dto: BookingSettingsDto): Either[ConfigError, BookingSettings] =
    for
      maxPassengers <- PassengerCount(dto.maxPassengers)
      currency <- CurrencyCode(dto.currencyCode)
      timeout <- DurationSeconds(dto.assignmentTimeoutSecs)
    yield BookingSettings(maxPassengers, currency, timeout)
```

環境変数は暗黙default（`0`、空文字列）を持つ文字列である。他の外部境界と同様に扱う。[ライブラリガイド（pureconfig）](/projects/kamae-scala/library-guides/#pureconfig)を参照。

## gRPC / Protobufメッセージ

生成されたScalaPB / protobuf型はワイヤDTOである。ユースケースの前にドメインコマンドへ変換する。

```scala
object AssignDriverCommand:
  def fromProto(req: proto.AssignDriverRequest): Either[AssignDriverError, AssignDriverCommand] =
    for
      tenantId <- TenantId(req.tenantId)
      requestId <- RequestId(req.requestId)
      driverId <- DriverId(req.driverId)
      key <- req.idempotencyKey match
        case "" => Right(None)
        case raw => IdempotencyKey(raw).map(Some(_))
    yield AssignDriverCommand(tenantId, requestId, driverId, key)
```

生成protobuf型をドメインパッケージに持ち込まない。`.proto`にフィールドが追加されてもDTO層はコンパイルし、mapperを明示的に更新する。[サービス境界](/projects/kamae-scala/service-boundaries/)を参照。

## よくあるライブラリの組み合わせ

| スタック | 境界パターン |
| --- | --- |
| Circe + domain errors | DTO`Decoder`、mapperが型付きerror ADTを返す |
| refined / opaque + Circe | リーフcodecがコンストラクタに委譲 |
| doobie / Slick | row case class + ドメインへmapper |
| PureConfig | env/ファイルからsettings DTO、ドメイン設定へ変換 |
| ScalaPB / gRPC | 生成メッセージ → mapper → ユースケース |
| http4s-circe | DTOのみ`EntityDecoder`、route内でmap |
| sttp + Circe | クライアントadapterでresponse DTOをデコード |

## レビューで見るところ

ハンドラが`String`IDをユースケースへ直接渡していないか。ドメインstructにCirce codecやdoobie`Read`/`Write`が付いていないか。インバウンドDTOの手数料・同意・所有権に関わるdefaultはないか。認証コンテキストと照合しないテナントIDやactor IDはないか。`Json`やprotobufメッセージ型がドメイン遷移に到達していないか。
