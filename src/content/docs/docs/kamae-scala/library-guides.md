---
title: "ライブラリガイド"
sidebar:
  order: 5
  label: "ライブラリガイド（参照）"
---

Cats、Circe、doobie などは Kamae のドメイン規約を**補助**するライブラリである。トピック別リファレンス（エラーハンドリング、境界防御など）と矛盾する場合は、そちらを優先する。

ここでは「よくある組み合わせ」とデフォルトの置き場所をまとめる。個別の設計判断は [エラーハンドリング](/docs/kamae-scala/error-handling/)、[境界防御](/docs/kamae-scala/boundary-defense/)、[ドメインモデリング](/docs/kamae-scala/domain-modeling/)、[PII 保護](/docs/kamae-scala/pii-protection/) を参照する。

| 用途 | ガイド付きライブラリ | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| エフェクト | `cats-core`、`cats-effect`、`zio` | `monix`、`scalaz` |
| JSON | `circe` | Play JSON、`jsoniter-scala` |
| 設定 | `pureconfig` | `caliban` config、Typesafe Config 直読み |
| SQL / ORM | `doobie`、`slick` | Quill、skunk |
| ストリーム | `fs2` | Akka Streams、Pekko Streams |
| 検証 / newtype | `refined` | `newtype`、手書き opaque type |
| PII / シークレット | opaque credential wrapper（本ガイド [secrets](#secrets)） | `vault` 連携、環境変数直読み |
| テスト | `scalacheck`、`munit` | `ScalaTest`、`specs2` |

## cats

`cats` または `cats-effect` があるとき:

- ユースケース trait に `Monad`、`Functor`、`ApplicativeError` 制約を適切に使う
- 十分な理由がなければドメイン遷移を `F[_]` から解放する
- アダプター境界で `attempt` / `handleErrorWith` によりエラーをマップする
- I/O には `IO` / `F` の遅延を優先し、`flatMap` 内で `blocking` なしにブロックしない

エラーチャネルでは、純粋ドメインコードの `Either` と、アプリケーションコードの `F[Either[E, A]]` または `ApplicativeError[F, E, *]` は、一貫して使えばどちらも許容される。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `cats-effect` + ポート | リポジトリ trait は `F[_]`、実装は `IO` | [アプリケーション配線](/docs/kamae-scala/application-wiring/) |
| `ApplicativeError` + ユースケース | ビジネス失敗を型付きエラーで表現 | [エラーハンドリング](/docs/kamae-scala/error-handling/) |
| `Either` + ドメイン | 遷移は純粋 `Either`、ユースケースが `fromEither` | [状態遷移](/docs/kamae-scala/state-transitions/) |

## zio

ZIO があるとき:

- ユースケースを `ZIO[Env, UseCaseError, A]` でモデルする
- ドメイン遷移は純粋に保ち、`ZIO.fromEither` で呼ぶ
- レイヤーは composition root のみで提供する
- ビジネス失敗には `Throwable` ではなく型付きエラーをエラーチャネルに使う

ドメインパッケージは、プロジェクトがエフェクト型をアプリケーションコードと明示的に同居させない限り `zio` に依存しない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `ZLayer` + ポート | アダプター実装のみレイヤー化 | [アプリケーション配線](/docs/kamae-scala/application-wiring/) |
| `ZIO` + `Either` 遷移 | `fromEither` でドメインを呼ぶ | [状態遷移](/docs/kamae-scala/state-transitions/) |

## circe

Circe は JSON 境界向けであり、ドメイン不変条件の権威にはしない。

### DTO に Codec を付ける

```scala
import io.circe.Decoder

final case class RequestDto(requestId: String, passengerId: String, status: String)

object RequestDto:
  given Decoder[RequestDto] = Decoder.derived
```

`Decoder.derived` はビジネスルールを検証しない。ネストしたフィールドの codec も、implicit scope に `Decoder` がない限り自動導出されない。

### ドメイン型にはバリデータを使う

DTO にデコードし、明示的な `Either` マッピングで変換する。検証が decoder に埋め込まれテストされている場合を除き、不変条件を持つ型に `Decoder[WaitingRequest]` を避ける。

```scala
def decodeWaiting(dto: RequestDto): Either[BoundaryError, WaitingRequest] =
  for
    requestId <- RequestId(dto.requestId).left.map(BoundaryError.InvalidId.apply)
    passengerId <- PassengerId(dto.passengerId).left.map(BoundaryError.InvalidId.apply)
    _ <- Either.cond(dto.status == "waiting", (), BoundaryError.UnexpectedStatus(dto.status))
  yield WaitingRequest(requestId, passengerId, requiresAccessibleVehicle = false)
```

### 設定付き導出

snake_case キー、デフォルト、判別子が必要なときは `Configuration` を提供し、configured derivation を使う:

```scala
import io.circe.derivation.Configuration

given Configuration = Configuration.default.withSnakeCaseMemberNames

object RequestDto:
  given Decoder[RequestDto] = Decoder.derivedConfigured
```

### 和型と enum

sealed family には `Codec.AsObject.derived` が既知の subtype を自動導出する。単純な enum:

```scala
enum Status derives Decoder, Encoder:
  case Waiting, EnRoute
```

外部制御の status 文字列には明示的 decoder を優先し、任意の文字列をドメイン enum に受け入れない。

### Play JSON

Play JSON を使うプロジェクトでも境界ルールは同じ: DTO に `Reads` / `Writes`、その後にドメイン型への検証付き変換。`Json.format` 導出を不変条件の強制とみなさない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `circe` + DTO | `Decoder` → `Either` マッピング | [境界防御](/docs/kamae-scala/boundary-defense/) |
| `circe` + http4s | `EntityDecoder` で DTO、ハンドラでドメイン変換 | [境界防御](/docs/kamae-scala/boundary-defense/) |
| `circe` + イベント | 外向きイベント DTO のみ codec | [永続化、集約、イベント](/docs/kamae-scala/persistence-events/) |

## doobie

doobie は SQL アダプター向けであり、ドメインモデリング向けではない。

### 行は境界型

`Read` / `Write` インスタンスは infrastructure の行 case class に置く。リポジトリポートから返す前に、明示的な `Either` マッパーで行をドメイン型にマップする。

### トランザクションはアダプターに属する

ドメイン遷移内ではなく、アダプターまたはユースケース境界で `transact(xa)` を使う。1 コマンドの状態変更と outbox 挿入は同一トランザクションを共有する。

### ConnectionIO を漏らさない

リポジトリ trait はポートレベルで `F[_]`（通常 `IO`）を使う。`ConnectionIO` はアダプター実装内に留める。

詳細は [ORM アダプター](/docs/kamae-scala/orm-adapters/) を参照する。

## slick

プロジェクトがすでに Slick を標準とするとき、SQL アダプターに使う。

### テーブル定義は infrastructure に留める

`Table` サブクラス、`DBIO`、profile import をドメインモジュールから出す。リポジトリポートは `F[_]` とドメイン型のみを使う。

### 返す前にマップする

`RequestRow`（相当）をアダプター内で、[ORM アダプター](/docs/kamae-scala/orm-adapters/) と同じ検証マッパーでドメイン状態に変換する。

### セッションとトランザクション

`db.run(...transactionally)` をアダプターが所有する。`Database` や `DBIO` をユースケースに渡さない。

ドメインマッピング中の lazy load や外部キー関係のナビゲーションを避け、必要な状態の列を明示的にクエリする。

## fs2

FS2 は読み取り側のストリームポート、outbox ディスパッチ、プロジェクション向けに使う。

### ストリームをドメインから出す

ドメイン遷移は `Either` とイベントリストを返す。アダプターが永続化ログや outbox テーブル上の `Stream[F, A]` を公開する。

### ストリーム要素には型付きエラーを優先する

`Stream[F, Either[StreamError, DomainEvent]]` はマッパーとデコード失敗を明示的に保つ。メトリクスとデッドレターポリシーなしに `handleErrorWith(_ => Stream.empty)` で失敗を飲み込まない。

### キャンセル

`interruptWhen` またはファイバキャンセルでストリームをコンパイルし、コンシューマ切断時に DB ポーリングを止める。

詳細は [ストリームと継続クエリ](/docs/kamae-scala/stream-continuous-queries/) を参照する。

## refined

`eu.timepit.refined` は境界または単一フィールド不変条件向けの検証付きプリミティブ newtype に使う。検証メッセージをドメイン固有にする必要があるドメインモジュールでは、明示的 `Either` ファクトリ付き opaque type を優先する。

### 使うとき

- 形式ルール付きの config キー、クエリパラメータ、DTO フィールド（非空、UUID、正の Int）
- 段階的導入: 完全なドメインモデリング前にレガシー `String` / `Int` 列をラップする

### 使わないとき

- 複数フィールドまたは状態依存ルール — ドメイン型と遷移を使う
- ORM マッピングが refined 述語を曖昧にする永続化集約ルート

### パターン

```scala
import eu.timepit.refined.api.*
import eu.timepit.refined.collection.NonEmpty
import eu.timepit.refined.refineEither

type NonEmptyString = String Refined NonEmpty

def parseRequestId(raw: String): Either[BoundaryError, NonEmptyString] =
  refineEither[NonEmpty](raw).left.map(_ => BoundaryError.EmptyId("request_id"))
```

refined DTO フィールドを、アダプター境界で明示的エラー ADT 付き opaque ドメイン ID にマップする。[境界防御](/docs/kamae-scala/boundary-defense/)、[ドメインマクロ](/docs/kamae-scala/domain-macros/) も参照する。

## secrets

完全なパターンは [PII 保護](/docs/kamae-scala/pii-protection/) を優先する。本節は資格情報と API キー向けの Scala 固有デフォルトを扱う。

ドメインまたはユースケース層に生の `String` でシークレットを置かない。`toString` を制限した opaque type、あるいは生値を決してログしない専用 wrapper を優先する。

```scala
final class ApiToken private (private val value: String):
  override def toString: String = "ApiToken(***)"

object ApiToken:
  def parse(raw: String): Either[BoundaryError, ApiToken] =
    if raw.trim.isEmpty then Left(BoundaryError.EmptyField("api_token"))
    else Right(new ApiToken(raw.trim))

  extension (token: ApiToken) def expose: String = token.value
```

シークレット値の露出は HTTP / auth / payment 境界の狭いアダプター関数（`expose`、`value`）に限定する。露出した値を error ADT に含めない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| opaque secret + アダプター | auth モジュールのみ `expose` | [PII 保護](/docs/kamae-scala/pii-protection/) |
| ログ | token フィールドをログしない。構造化 `***` プレースホルダ | [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/) |
| PII vs secrets | 個人データは redacted 型、資格情報は secret wrapper | [PII 保護](/docs/kamae-scala/pii-protection/) |

検出のみ: `pureconfig` の secret loader — 境界で検証し、ドメインコード実行前に opaque 型へマップする。

## scalacheck

プロジェクトがすでに依存している場合、またはプロパティテストが入力全体の法則を最も明確にカバーできる場合に使う。

`Test` スコープに置く。無効なドメイン状態を直接構築するより、public コンストラクタを呼ぶ generator を優先する。

```scala
import org.scalacheck.Prop.forAll
import org.scalacheck.Gen

property("valid ids construct") {
  forAll(nonEmptyStringGen) { raw =>
    RequestId(raw.trim).isRight
  }
}
```

generator 設計、状態プロパティ、CI 予算、regression ファイルは [プロパティベーステスト](/docs/kamae-scala/property-based-tests/) を参照する。

## pureconfig

PureConfig は設定ファイルを読む。ドメインコマンドを読まない。

### 設定 case class は境界型

デフォルトを明示的に文書化した case class に設定をロードし、ドメイン型へ検証する。

### シークレット

起動時ログされる平文 config フィールドにシークレットを置かない。環境別 secret プロバイダと redacting wrapper を使う。

[境界防御](/docs/kamae-scala/boundary-defense/) も参照する。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `pureconfig` + 起動 | config case class → ドメイン検証 | [境界防御](/docs/kamae-scala/boundary-defense/) |
| `pureconfig` + secrets | 読み込み後すぐ opaque 型へ | [PII 保護](/docs/kamae-scala/pii-protection/) |
