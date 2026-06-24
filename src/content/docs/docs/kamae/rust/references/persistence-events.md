---
title: "Rust 永続化とドメインイベント"
sidebar:
  order: 10
---

## 責務でリポジトリを分離する

repository trait は ORM の都合ではなくドメインのニーズを表現する。read/write インターフェースは小さく保つ。

```rust
pub trait RequestResolver {
    async fn find_waiting(&self, id: &RequestId) -> Result<Option<WaitingRequest>, RepositoryError>;
}

pub trait RequestStore {
    async fn save_assigned(
        &self,
        state: &EnRouteRequest,
        events: &[DomainEvent],
    ) -> Result<(), RepositoryError>;
}
```

Rust 1.75+ で caller が static dispatch を使い `dyn Trait` を要しない内部 trait では、native `async fn` を優先。MSRV が古い、フレームワークが trait object を要求する、`Box<dyn RequestStore + Send + Sync>` で意図的に保持する場合は `async_trait`。tradeoff は明示: native trait は static path で macro 展開と boxing を避ける; `async_trait` は boxing された future で dynamic dispatch を ergonomical にする。

## state と event を原子的に永続化する

遷移が domain event を出すとき、state 変更と outbox 行を同一トランザクションで save する。呼び出し側が state と event を別操作で save できる API を避ける。

集約ルート、楽観的 versioning、悲観的ロック、ユースケースのトランザクション境界は [`aggregate-transactions.md`](/docs/kamae/rust/references/aggregate-transactions/) 参照。

## event レコードは不変

event を明示 struct または enum でモデル化。identifier、timestamp、aggregate id、event name/type、payload を含める。event は repository 永続化コードではなくユースケース/ドメイン層で生成する。

event payload では型付き timestamp、money、単位を使う。裸 `String`、`i64`、`f64` より `OccurredAt`、`Money`、`DistanceMeters`、`CurrencyCode` など。event レコードは長寿命契約。型境界で単位と精度を明確に。

## 必要なら永続 event を Stream で公開

read model、統合、オペレータが変更フィードを購読するとき、ユースケース内 ad-hoc poll ではなく `futures::Stream` port で永続 event または outbox 行を公開。[`stream-continuous-queries.md`](/docs/kamae/rust/references/stream-continuous-queries/) で backpressure、checkpoint、projection idempotency。

## `sqlx` によるトランザクション管理

ユースケースが操作に名前を付け、adapter が `BEGIN` / `COMMIT` / `ROLLBACK` を所有する。

```rust
pub struct SqlxRequestStore {
    pool: PgPool,
}

impl SqlxRequestStore {
    pub async fn save_assigned(
        &self,
        expected_version: AggregateVersion,
        state: &EnRouteRequest,
        events: &[DomainEvent],
        idempotency_key: Option<&IdempotencyKey>,
    ) -> Result<(), RepositoryError> {
        let mut tx = self.pool.begin().await?;

        if let Some(key) = idempotency_key {
            if self.idempotency_seen(&mut tx, key).await? {
                tx.commit().await?;
                return Ok(());
            }
        }

        let updated = sqlx::query!(
            r#"
            UPDATE taxi_requests
            SET status = 'en_route',
                driver_id = $2,
                version = version + 1,
                updated_at = now()
            WHERE request_id = $1
              AND version = $3
            "#,
            state.request_id().as_str(),
            state.driver_id().as_str(),
            expected_version.as_i64(),
        )
        .execute(&mut *tx)
        .await?;

        if updated.rows_affected() == 0 {
            tx.rollback().await?;
            return Err(RepositoryError::ConcurrentModification {
                request_id: state.request_id().clone(),
            });
        }

        for event in events {
            self.insert_outbox_row(&mut tx, event).await?;
        }

        if let Some(key) = idempotency_key {
            self.record_idempotency(&mut tx, key).await?;
        }

        tx.commit().await?;
        Ok(())
    }
}
```

ルール:

- 無関係な `.await` 作業（外部 HTTP、長い計算）越しにトランザクションを開いたままにしない
- commit 前の任意エラーで rollback。state と同じトランザクション外に outbox を部分 insert しない
- `sqlx` エラーは adapter で `RepositoryError` にマップ。ドメインコードではない

## outbox テーブルスキーマ

最小 transactional outbox は commit 後の確実 publish に必要な情報を保持:

```sql
CREATE TABLE outbox_events (
    event_id         UUID PRIMARY KEY,
    aggregate_type   TEXT NOT NULL,
    aggregate_id     TEXT NOT NULL,
    event_type       TEXT NOT NULL,
    payload          JSONB NOT NULL,
    occurred_at      TIMESTAMPTZ NOT NULL,
    published_at     TIMESTAMPTZ,
    publish_attempts INT NOT NULL DEFAULT 0
);

CREATE INDEX outbox_events_unpublished_idx
    ON outbox_events (occurred_at)
    WHERE published_at IS NULL;
```

outbox 行は集約 state と同一トランザクションで insert。バックグラウンド worker が未 publish 行を読み bus へ publish し `published_at` を更新。publish はリトライされうるため processor は冪等。

## event の Serde 表現

保存・公開 event には tagged 表現の明示 enum を優先:

```rust
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum TaxiRequestEvent {
    DriverAssigned {
        request_id: RequestId,
        driver_id: DriverId,
        occurred_at: OccurredAt,
    },
    TripStarted {
        request_id: RequestId,
        occurred_at: OccurredAt,
    },
    RequestCancelled {
        request_id: RequestId,
        reason: CancellationReason,
        occurred_at: OccurredAt,
    },
}
```

`#[serde(tag = "event_type")]`（internally tagged）は別 wrapper なしで JSON に安定 discriminator。version 付き event 進化:

- 新 variant を追加。古い `event_type` 文字列を別 payload 形状で再利用しない
- リーフは serde 往復可能な value object または DTO
- outbox の `payload` は JSONB、consumer は `TaxiRequestEvent` にデシリアライズ

外部公開契約では内部 enum と異なる integration DTO を検討。

## `version` による楽観的ロック

集約ルートに単調 `version`（または等価チェック付き `updated_at`）を付ける。load が現行 version を返し、save が検証する。

```sql
-- column on aggregate table
version BIGINT NOT NULL DEFAULT 1
```

```rust
let result = sqlx::query!(
    r#"
    UPDATE taxi_requests
    SET status = $2,
        version = version + 1
    WHERE request_id = $1
      AND version = $3
    "#,
    request_id,
    status,
    expected_version,
)
.execute(&mut *tx)
.await?;

if result.rows_affected() == 0 {
    return Err(RepositoryError::ConcurrentModification { request_id });
}
```

`ConcurrentModification` を型付きユースケースエラーとして公開し、HTTP が 409、queue consumer が fresh load でリトライできるようにする。[`aggregate-transactions.md`](/docs/kamae/rust/references/aggregate-transactions/#optimistic-concurrency-is-the-default) 参照。

## リトライ向け idempotency key

リトライされうるコマンド（HTTP client、queue consumer、outbox processor）は `IdempotencyKey` または `CommandId` を持つ。同一トランザクション内で state 変更または dedupe テーブルと一緒に永続化。

```rust
pub struct IdempotencyKey(String);
```

```sql
CREATE TABLE command_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    request_id      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

リトライフロー:

1. Client が `Idempotency-Key` header または message 属性を送る
2. ユースケースが key を `save_*` に渡す
3. Adapter がトランザクション内で dedupe をチェックしてから遷移適用
4. 重複 key では再適用せず commit し success（または元 outcome）を返す
5. `ConcurrentModification` では reload しリトライまたは conflict を返す

```rust
pub async fn execute_with_retry(
    &self,
    cmd: AssignDriverCommand,
) -> Result<(), AssignDriverError> {
    for attempt in 0..3 {
        match self.execute_once(&cmd).await {
            Err(AssignDriverError::ConcurrentModification) if attempt < 2 => continue,
            other => return other,
        }
    }
    unreachable!("loop returns on last attempt")
}
```

同一論理コマンドの各リトライで同じ idempotency key。新しいビジネスアクションだけ新 key。

## 行マッピングと境界防御

persistence adapter も DTO -> ドメイン変換に従う。[`boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/#database-rows-sqlxfromrow) 参照。破損またはレガシー行は adapter で `RepositoryError::CorruptRow` とし、無効 domain state を出さない。

## よくある crate 組み合わせ

| Stack | Persistence pattern |
| --- | --- |
| `sqlx` + `thiserror` | `FromRow` row struct、型付き `RepositoryError`、adapter 内トランザクション |
| `sqlx` + `serde_json` | `TaxiRequestEvent` enum からシリアライズする outbox `payload JSONB` |
| `sqlx` + domain events | 単一トランザクション: 集約 `UPDATE` + outbox `INSERT` |
| `tokio` + outbox worker | 未 publish 行を poll、publish、`published_at` 更新。consumer は冪等 |

## レビューシグナル

次をフラグ:

- state と outbox が共有トランザクションなしに別 public repository メソッドで書かれる
- event が transition outcome ではなく SQL マッピング内で構築される
- `version` が `WHERE version = $expected` なしで increment される
- リトライが idempotency または version チェックなしで遷移を再適用
- event payload が money に裸 `f64`、enum に型なし `String`

## レビュー観点

### 12.1 状態とドメインイベントは原子的に永続化されているか — High

トランザクションやアウトボックスパターンなしに、集約状態の保存とイベントの公開 / 挿入を別操作で行うユースケースをフラグする。

### 12.2 リポジトリトレイトはドメインのニーズを表現しているか — Medium

ユースケースが実際に必要とする小さなインターフェースではなく、ORM CRUD を写した大きなリポジトリトレイトをフラグする。

### 12.3 イベントは永続化アダプタ外で生成されているか — Medium

ユースケース / ドメイン層から供給されたイベントを永続化するのではなく、リポジトリ内部でビジネスイベントを発明する箇所をフラグする。

### 12.4 DB 制約は重要な不変条件を反映しているか — Medium

一意性、テナント所有権、非負残高、有効なライフサイクル状態、外部キー存在を DB が強制できるのに、アプリケーション検査だけに頼る永続化をフラグする。

### 12.5 リトライと重複配信は冪等か — High

冪等キーや重複排除レコードなしに、金額、在庫、ライフサイクル遷移、通知を二重適用しうるコマンド、イベントハンドラ、アウトボックスプロセッサ、外部呼び出しをフラグする。

### 12.6 永続化イベントはバージョン付けされているか — Medium

イベントを非同期に保存または消費するのに、明示的なイベント型 / バージョン、スキーマ進化戦略、後方互換デシリアライズがないイベントペイロードをフラグする。
