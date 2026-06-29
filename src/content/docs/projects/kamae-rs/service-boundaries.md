---
title: "サービス境界"
sidebar:
  order: 10
---

サービス間のProtobufやイベントは、プロセス内の `TryFrom` よりスキーマ進化と冪等性の問題が前面に出る。破壊的変更や未知バージョンでパニックするコンシューマは、本番で連鎖障害になる。

境界パースの基本は [境界防御](/projects/kamae-rs/boundary-defense/)、イベントの保存と重複排除は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/)、ストリーム側の処理は [ストリームと継続クエリ](/projects/kamae-rs/stream-continuous-queries/) を参照する。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./persistence-events.md -->

## リモートサービスも外部境界として扱う

マイクロサービス境界はDTO境界である。モノリス内のHTTP handlerやqueue consumerと同様、ワイヤメッセージを `TryFrom` でドメインコマンドまたはintegration eventに変換する。

```text
Protobuf/JSON message -> integration DTO -> TryFrom -> domain command or event
```

他サービスの生成protobuf型をドメインcrateにimportしない。生成client/serverはinfrastructureまたは専用 `*-api` crateに置き、adapter境界でドメイン型にマップする。

## gRPC と Protobuf スキーマ進化

producerとconsumerは独立デプロイを前提とする。永続化またはキューされるprotobufメッセージには明示的互換ポリシーが必要。

| 変更 | 互換性 | 推奨アプローチ |
| --- | --- | --- |
| optional フィールド追加 | 後方互換 | default 付き新フィールド。consumer は未知フィールドを無視 |
| `oneof` variant 追加 | 注意付き前方互換 | メッセージ version を上げる。旧 consumer は未知 variant をスキップ |
| フィールド rename | ワイヤ上 breaking | フィールド番号を rename しない。新フィールド追加と旧 deprecate |
| フィールド型変更 | breaking | 新メッセージ型または envelope の新 `version` |
| フィールド削除 | deprecate 後 breaking | 番号を reserve。移行中は dual-read |

サービス境界を越えるeventにはversion付きenvelopeでpayloadを包む：

```rust
pub struct IntegrationEventEnvelope {
    pub event_type: EventTypeName,
    pub schema_version: u32,
    pub payload: prost::bytes::Bytes,
}
```

consumerは：

1. `event_type` と `schema_version` でルーティング
2. version固有DTOにデシリアライズ
3. DTO -> ドメインintegration eventを `TryFrom` で変換
4. panicせず未知versionをdead-letterまたはmetricでカウント

## メッセージキューと非同期統合

queue consumerはat-least-once配送を継承する。handlerは冪等でなければならず、broker契約が保証しない限りパーティション間の順序を仮定しない。

```rust
pub async fn handle_delivery(
    message: QueueMessageDto,
) -> Result<(), HandlerError> {
    let command = AssignDriverCommand::try_from(message.payload)?;
    if self.processed.exists(&command.idempotency_key).await? {
        return Ok(());
    }
    self.use_case.execute(command).await?;
    self.processed.record(command.idempotency_key).await?;
    Ok(())
}
```

可能ならidempotency keyを副作用と同じstoreに永続化。outbox公開は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) に合わせる。

## レジリエンスは adapter 層

サーキットブレーカー、タイムアウト、リトライ、レート制限はインフラadapterに属する — ドメイン遷移やユースケースのビジネスルールではない。

| Control | Where | Domain impact |
| --- | --- | --- |
| Timeout | gRPC/HTTP client builder | 型付き `ClientError::Timeout` にマップ |
| Retry with backoff | 外部 API を呼ぶ adapter | 冪等 read または明示 keyed write のみリトライ |
| Circuit breaker | tower / client middleware | ユースケースへ `ClientError::Unavailable` |
| Rate limit | gateway または outbound client | `ClientError::RateLimited` にマップ。ドメインで spin しない |

```rust
let response = self
    .billing_client
    .charge(request)
    .await
    .map_err(|e| match e {
        BillingClientError::Timeout => AssignDriverError::BillingTimeout,
        BillingClientError::Unavailable => AssignDriverError::BillingUnavailable,
        other => AssignDriverError::Billing(other),
    })?;
```

ユースケースが失敗をリトライ可能とするか補償とするか決める。adapterがポリシーを実行する。

## サービス横断の相関

outbound呼び出しとqueueメッセージに `correlation_id`、`trace_id`、テナントコンテキストを伝播する。ingress adapterの `tracing` spanに設定し、metadata headerまたはmessage属性に注入する。

分散traceをドメイン監査ログと混同しない。耐久性が必要ならoutbox経由でビジネスeventを永続化（[ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) 参照）。

## 契約テスト

2サービスがprotobufまたはJSONスキーマを共有するとき：

- 生成Rust型をCIにcheck-inするか、専用jobで再生成
- リリース前にconsumer-driven契約テストまたは `.proto` のbreaking変更検出を実行
- 各サポート `schema_version` のfixtureメッセージをテストに保持

## 検出ヒント

`Cargo.toml` に `tonic`、`prost`、`lapin`、`rdkafka`、`aws-sdk-sqs` などがあるとき、このガイドを [境界防御](/projects/kamae-rs/boundary-defense/) とconsumer/projection向け [ストリームと継続クエリ](/projects/kamae-rs/stream-continuous-queries/) と一緒に読み込む。

レビューでは、`TryFrom` なしのワイヤデータ直渡し、ドメインへの `prost` 型import、破壊的スキーマ変更、非冪等コンシューマ、ドメイン内のリトライ / サーキットブレーカ、相関IDの欠落を指摘する。

## レビュー観点

### protobuf / JSON スキーマ進化は明示的か — High

破壊的なフィールド改名 / 削除、`schema_version` の欠落、未知のイベント型やバージョンでパニックするコンシューマを指摘する。

### キューハンドラは冪等か — High

[永続化、集約、イベント](/projects/kamae-rs/persistence-events/) も照合する。冪等キーや重複排除ストレージなしに副作用を適用するコンシューマを指摘する。

### ワイヤメッセージは DTO → ドメインで変換されているか — High

`TryFrom` 検証なしにprotobuf、JSON、キューペイロードをドメインロジックへ直接渡すハンドラを指摘する。

### リトライ、ブレーカ、レート制限はアダプタにあるか — Medium

ドメイン遷移やユースケースのビジネスルール内のリトライループ、サーキットブレーカ状態、レート制限を指摘する。

### 生成クライアント型はドメインクレートに漏れていないか — Medium

アダプタ境界でマッピングするのではなく、ドメインやユースケースモジュールが `tonic` / `prost` 生成型をimportしている場合は指摘する。

### 相関コンテキストは外向き呼び出しで伝播されているか — Low

入口リクエストが既に `correlation_id` やトレースコンテキストを運んでいるのに、サービス間呼び出しや公開メッセージからそれらを欠落させる場合は指摘する。
