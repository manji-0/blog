---
title: "サービス境界"
sidebar:
  order: 10
---

サービス間のProtobufやイベントは、プロセス内の境界パースよりスキーマ進化と冪等性の問題が前面に出る。破壊的変更や未知バージョンで例外を投げるコンシューマは、本番で連鎖障害になる。

境界パースの基本は [境界防御](/projects/kamae-scala/boundary-defense/)、イベントの保存と重複排除は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/)、ストリーム側の処理は [ストリームと継続クエリ](/projects/kamae-scala/stream-continuous-queries/)、配線は [アプリケーション配線](/projects/kamae-scala/application-wiring/) を参照する。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./logging-metrics.md -->

## リモートサービスも外部境界として扱う

マイクロサービス境界はDTO境界である。モノリス内のHTTP handlerやqueue consumerと同様、ワイヤメッセージを検証mapperでドメインコマンドまたはintegration eventに変換する。

```text
Protobuf/JSON message -> integration DTO -> Either mapper -> domain command or event
```

他サービスの生成protobuf型をドメインパッケージにimportしない。生成client/serverはinfrastructureまたは専用`*-api`モジュールに置き、adapter境界でドメイン型にマップする。

## ドメインパッケージからトランスポート詳細を追い出す

HTTP route、gRPCサービス、メッセージconsumerはリクエストをコマンドに変換し、ユースケースを呼び、エラーをトランスポート応答にマップする。ビジネスルールを含めない。

## gRPCとProtobufスキーマ進化

producerとconsumerは独立デプロイを前提とする。永続化またはキューされるprotobufメッセージには明示的互換ポリシーが必要。

| 変更 | 互換性 | 推奨アプローチ |
| --- | --- | --- |
| optionalフィールド追加 | 後方互換 | default付き新フィールド。consumerは未知フィールドを無視 |
| `oneof` variant追加 | 注意付き前方互換 | メッセージversionを上げる。旧consumerは未知variantをスキップ |
| フィールドrename | ワイヤ上breaking | フィールド番号をrenameしない。新フィールド追加と旧deprecate |
| フィールド型変更 | breaking | 新メッセージ型またはenvelopeの新`version` |
| フィールド削除 | deprecate後breaking | 番号をreserve。移行中はdual-read |

サービス境界を越えるeventにはversion付きenvelopeでpayloadを包む：

```scala
final case class IntegrationEventEnvelope(
    eventType: EventTypeName,
    schemaVersion: Int,
    payload: Array[Byte]
)
```

consumerは：

1. `eventType`と`schemaVersion`でルーティング
2. version固有DTOにデシリアライズ
3. DTO → ドメインintegration eventを検証mapperで変換
4. 例外を投げず未知versionをdead-letterまたはmetricでカウント

## メッセージキューと非同期統合

queue consumerはat-least-once配送を継承する。handlerは冪等でなければならず、broker契約が保証しない限りパーティション間の順序を仮定しない。

```scala
def handleDelivery(message: QueueMessageDto): F[Either[HandlerError, Unit]] =
  for
    command <- Monad[F].pure(AssignDriverCommand.from(message.payload))
    result  <- command match
      case Left(err) => Monad[F].pure(Left(HandlerError.Decode(err)))
      case Right(cmd) =>
        processed.exists(cmd.idempotencyKey).flatMap:
          case true  => Monad[F].pure(Right(()))
          case false =>
            useCase.execute(cmd).flatMap:
              case Left(err) => Monad[F].pure(Left(HandlerError.UseCase(err)))
              case Right(_)  =>
                processed.record(cmd.idempotencyKey).as(Right(()))
  yield result
```

可能ならidempotency keyを副作用と同じstoreに永続化する。outbox公開は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) に合わせる。

## レジリエンスはadapter層

サーキットブレーカー、タイムアウト、リトライ、レート制限はインフラadapterに属する。ドメイン遷移やユースケースのビジネスルールではない。

| Control | Where | Domain impact |
| --- | --- | --- |
| Timeout | http4s / sttp / gRPC client builder | 型付き`ClientError.Timeout`にマップ |
| Retry with backoff | 外部APIを呼ぶadapter | 冪等readまたは明示keyed writeのみリトライ |
| Circuit breaker | client middleware / Resilience4j | `ClientError.Unavailable`をユースケースへ |
| Rate limit | gatewayまたはoutbound client | `ClientError.RateLimited`にマップ。ドメインでspinしない |

```scala
billingClient.charge(request).attempt.map:
  case Left(_: TimeoutException) => Left(AssignDriverError.BillingTimeout)
  case Left(_)                   => Left(AssignDriverError.BillingUnavailable)
  case Right(response)           => Right(response)
```

ユースケースが失敗をリトライ可能か、補償するかを決める。adapterがポリシーを実行する。

## サービス間の相関

`correlation_id`、`trace_id`、テナントコンテキストをoutbound呼び出しとqueueメッセージへ伝播する。ingress adapterでlogging/MDCまたはtrace4cats / OpenTelemetry spanに設定し、metadata headerまたはmessage属性へ注入する。

分散トレースをドメイン監査ログと混同しない。耐久性が必要ならoutbox経由でビジネスeventを永続化する（[ロギングとメトリクス](/projects/kamae-scala/logging-metrics/)参照）。

## 契約テスト

2サービスがprotobufまたはJSONスキーマを共有するとき：

- 生成Scala型をCIにチェックインするか、専用jobで再生成する
- リリース前に`.proto` / OpenAPIファイルへconsumer-driven契約テストまたはbreaking-change検出を走らせる
- 各`schemaVersion`向けfixtureメッセージをテストに保持する

## 検出ヒント

`build.sbt`に`http4s`、`sttp`、`fs2-kafka`、`pekko`、ScalaPB / gRPC clientなどがあるとき、このガイドを[境界防御](/projects/kamae-scala/boundary-defense/)と[ストリームと継続クエリ](/projects/kamae-scala/stream-continuous-queries/)と併せて読む。

## レビューで見るところ

- 生成protobuf型がドメインパッケージに入っていないか。
- queue handlerが冪等でないか。
- タイムアウトやリトライがドメイン遷移内にあるか。
- 未知`schemaVersion`でpanicしていないか。
- テナントコンテキストがoutbound呼び出しへ伝播しているか。

