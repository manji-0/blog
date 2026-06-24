---
title: "サービス境界"
sidebar:
  order: 10
---

> **いつ読むか:** gRPC / Protobuf、サービス間イベント、スキーマ進化を設計するとき。
> **関連:** [`boundary-defense.md`](/docs/kamae-rs/boundary-defense/)、[`persistence-events.md`](/docs/kamae-rs/persistence-events/)、[`stream-continuous-queries.md`](/docs/kamae-rs/stream-continuous-queries/)。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./persistence-events.md -->

## リモートサービスも外部境界として扱う

マイクロサービス境界は DTO 境界である。モノリス内の HTTP handler や queue consumer と同様、ワイヤメッセージを `TryFrom` でドメインコマンドまたは integration event に変換する。

```text
Protobuf/JSON message -> integration DTO -> TryFrom -> domain command or event
```

他サービスの生成 protobuf 型をドメイン crate に import しない。生成 client/server は infrastructure または専用 `*-api` crate に置き、adapter 境界でドメイン型にマップする。

## gRPC と Protobuf スキーマ進化

producer と consumer は独立デプロイを前提とする。永続化またはキューされる protobuf メッセージには明示的互換ポリシーが必要。

| 変更 | 互換性 | 推奨アプローチ |
| --- | --- | --- |
| optional フィールド追加 | 後方互換 | default 付き新フィールド。consumer は未知フィールドを無視 |
| `oneof` variant 追加 | 注意付き前方互換 | メッセージ version を上げる。旧 consumer は未知 variant をスキップ |
| フィールド rename | ワイヤ上 breaking | フィールド番号を rename しない。新フィールド追加と旧 deprecate |
| フィールド型変更 | breaking | 新メッセージ型または envelope の新 `version` |
| フィールド削除 | deprecate 後 breaking | 番号を reserve。移行中は dual-read |

サービス境界を越える event には version 付き envelope で payload を包む:

```rust
pub struct IntegrationEventEnvelope {
    pub event_type: EventTypeName,
    pub schema_version: u32,
    pub payload: prost::bytes::Bytes,
}
```

consumer は:

1. `event_type` と `schema_version` でルーティング
2. version 固有 DTO にデシリアライズ
3. DTO -> ドメイン integration event を `TryFrom` で変換
4. panic せず未知 version を dead-letter または metric でカウント

## メッセージキューと非同期統合

queue consumer は at-least-once 配送を継承する。handler は冪等でなければならず、broker 契約が保証しない限りパーティション間の順序を仮定しない。

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

可能なら idempotency key を副作用と同じ store に永続化。outbox 公開は [`persistence-events.md`](/docs/kamae-rs/persistence-events/) に合わせる。

## レジリエンスは adapter 層

サーキットブレーカー、タイムアウト、リトライ、レート制限はインフラ adapter に属する — ドメイン遷移やユースケースのビジネスルールではない。

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

ユースケースが失敗をリトライ可能か補償か決める。adapter がポリシーを実行する。

## サービス横断の相関

outbound 呼び出しと queue メッセージに `correlation_id`、`trace_id`、テナントコンテキストを伝播する。ingress adapter の `tracing` span に設定し、metadata header または message 属性に注入する。

分散 trace をドメイン監査ログと混同しない。耐久性が必要なら outbox 経由でビジネス event を永続化（[`logging-metrics.md`](/docs/kamae-rs/logging-metrics/) 参照）。

## 契約テスト

2 サービスが protobuf または JSON スキーマを共有するとき:

- 生成 Rust 型を CI に check-in するか、専用 job で再生成
- リリース前に consumer-driven 契約テストまたは `.proto` の breaking 変更検出を実行
- 各サポート `schema_version` の fixture メッセージをテストに保持

## 検出ヒント

`Cargo.toml` に `tonic`、`prost`、`lapin`、`rdkafka`、`aws-sdk-sqs` などがあるとき、このガイドを [`boundary-defense.md`](/docs/kamae-rs/boundary-defense/) と consumer/projection 向け [`stream-continuous-queries.md`](/docs/kamae-rs/stream-continuous-queries/) と一緒に読み込む。

レビューでは、`TryFrom` なしのワイヤデータ直渡し、ドメインへの `prost` 型 import、破壊的スキーマ変更、非冪等コンシューマ、ドメイン内のリトライ / サーキットブレーカ、相関 ID の欠落を指摘する。

## レビュー観点

### protobuf / JSON スキーマ進化は明示的か — High

破壊的なフィールド改名 / 削除、`schema_version` の欠落、未知のイベント型やバージョンでパニックするコンシューマを指摘する。

### キューハンドラは冪等か — High

[`persistence-events.md`](/docs/kamae-rs/persistence-events/) も照合する。冪等キーや重複排除ストレージなしに副作用を適用するコンシューマを指摘する。

### ワイヤメッセージは DTO → ドメインで変換されているか — High

`TryFrom` 検証なしに protobuf、JSON、キューペイロードをドメインロジックへ直接渡すハンドラを指摘する。

### リトライ、ブレーカ、レート制限はアダプタにあるか — Medium

ドメイン遷移やユースケースのビジネスルール内のリトライループ、サーキットブレーカ状態、レート制限を指摘する。

### 生成クライアント型はドメインクレートに漏れていないか — Medium

アダプタ境界でマッピングするのではなく、ドメインやユースケースモジュールが `tonic` / `prost` 生成型を import している場合は指摘する。

### 相関コンテキストは外向き呼び出しで伝播されているか — Low

入口リクエストが既に `correlation_id` やトレースコンテキストを運んでいるのに、サービス間呼び出しや公開メッセージからそれらを欠落させる場合は指摘する。
