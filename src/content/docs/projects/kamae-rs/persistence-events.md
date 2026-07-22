---
title: "永続化、集約、イベント"
sidebar:
  order: 10
---

状態変更とドメインイベントを別操作で保存すると、リトライや障害のたびに不整合が残る。Kamaeでは集約境界・楽観的ロック・アウトボックスをセットで設計し、1コマンドの作業単位をユースケースが所有する。

状態型と遷移は [状態遷移](/projects/kamae-rs/state-transitions/) と [ドメインモデリング](/projects/kamae-rs/domain-modeling/) が前提。非同期消費側は [ストリームと継続クエリ](/projects/kamae-rs/stream-continuous-queries/)、配線は [アプリケーション配線](/projects/kamae-rs/application-wiring/) を参照する。

集約の切り方・トランザクション境界・ロック方針は [集約とトランザクション境界](/projects/kamae-rs/aggregate-transactions/) が正規である。このページはリポジトリポート、イベント永続化、アウトボックス、冪等性に絞る。

## 責務でリポジトリを分離する

repository traitはORMの都合ではなくドメインのニーズを表現する。read/writeインターフェースは小さく保つ。

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

Rust 1.75+ でcallerがstatic dispatchを使い `dyn Trait` を要しない内部traitでは、native `async fn` を優先。MSRVが古い、フレームワークがtrait objectを要求する、`Box<dyn RequestStore + Send + Sync>` で意図的に保持する場合は `async_trait`。tradeoffは明示する。native traitはstatic pathでmacro展開とboxingを避ける。`async_trait` は、ボックス化されたfutureによりdynamic dispatchを扱いやすくする。

## state と event を原子的に永続化する

遷移がdomain eventを出すとき、state変更とoutbox行は**同一トランザクション**でsaveする。途中でプロセスが落ちた場合に「状態だけ進んだ」「イベントだけ二重に配信された」という不整合が残るため、呼び出し側がstateとeventを別メソッドで保存できるAPIは避ける。読み取り専用の投影や「とりあえずログに出す」用途で分けたくなっても、権威あるwrite pathは1本に保つ。

## event レコードは不変

eventは明示的なstructかenumでモデル化し、identifier、timestamp、aggregate id、event name/type、payloadを含める。eventはrepositoryの永続化コードではなく、ユースケースまたはドメイン層で生成する。adapterがeventを「補完」すると監査とリプレイの信頼性が失われ、テストでも本番と異なる経路が生まれる。

event payloadでは型付きtimestamp、money、単位を使う。裸の `String`、`i64`、`f64` より `OccurredAt`、`Money`、`DistanceMeters`、`CurrencyCode` など。eventレコードは長寿命の契約なので、型境界で単位と精度を最初から明確にしておく。

## 必要なら永続 event を Stream で公開

read model、統合、オペレータが変更フィードを購読するとき、ユースケース内ad-hoc pollではなく `futures::Stream` portで永続eventまたはoutbox行を公開。[ストリームと継続クエリ](/projects/kamae-rs/stream-continuous-queries/) でbackpressure、checkpoint、projection idempotency。

## `sqlx` によるトランザクション管理

ユースケースが操作に名前を付け、adapterが `BEGIN` / `COMMIT` / `ROLLBACK` を所有する。

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

ルール：

- 無関係な `.await` 作業（外部HTTP、長い計算）越しにトランザクションを開いたままにしない
- commit前の任意エラーでrollback。stateと同じトランザクション外にoutboxを部分insertしない
- `sqlx` エラーはadapterで `RepositoryError` にマップ。ドメインコードではない

## outbox テーブルスキーマ

最小transactional outboxはcommit後の確実publishに必要な情報を保持：

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

outbox行は集約stateと同一トランザクションでinsert。バックグラウンドworkerが未publish行を読みbusへpublishし `published_at` を更新。publishはリトライされうるため、processorを冪等に保つ。

## event の Serde 表現

保存・公開eventにはtagged表現の明示enumを優先：

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

`#[serde(tag = "event_type")]`（internally tagged）は別wrapperなしでJSONに安定discriminator。version付きevent進化：

- 新variantを追加。古い `event_type` 文字列を別payload形状で再利用しない
- リーフはserde往復可能なvalue objectまたはDTO
- outboxの `payload` はJSONB、consumerは `TaxiRequestEvent` にデシリアライズ

外部公開契約では内部enumと異なるintegration DTOを検討。

## `version` による楽観的ロック

集約ルートに単調 `version`（または等価チェック付き `updated_at`）を付ける。loadが現行versionを返し、saveが検証する。

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

`ConcurrentModification` を型付きユースケースエラーとして公開し、HTTPが409、queue consumerがfresh loadでリトライできるようにする。[永続化、集約、イベント](/projects/kamae-rs/persistence-events/#楽観的並行性がデフォルト) 参照。

## リトライ向け idempotency key

リトライされうるコマンド（HTTP client、queue consumer、outbox processor）は `IdempotencyKey` または `CommandId` を持つ。同一トランザクション内でstate変更またはdedupeテーブルと一緒に永続化。

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

1. Clientが `Idempotency-Key` headerまたはmessage属性を送る
2. ユースケースがkeyを `save_*` に渡す
3. Adapterがトランザクション内でdedupeをチェックしてから遷移適用
4. 重複keyでは再適用せずcommitしsuccess（または元outcome）を返す
5. `ConcurrentModification` ではreloadしリトライまたはconflictを返す

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

同一論理コマンドの各リトライで同じidempotency key。新しいビジネスアクションだけ新key。

## 行マッピングと境界防御

persistence adapterもHTTPやキューと同様に、DTO → ドメイン変換のルールに従う（[境界防御](/projects/kamae-rs/boundary-defense/#データベース行sqlxfromrow) 参照）。たとえば `en_route` 行に `driver_id` がNULLのまま読み込まれた場合、無効な `EnRouteRequest` を組み立てて遷移に渡すのではなく、adapterで `RepositoryError::CorruptRow` として返す。破損行を黙って通すと、後続のユースケースが「ありえない状態」で動き続け、原因の特定が難しくなる。

## よくある crate 組み合わせ

| スタック | 永続化パターン |
| --- | --- |
| `sqlx` + `thiserror` | `FromRow` row struct、型付き `RepositoryError`、adapter 内トランザクション |
| `sqlx` + `serde_json` | `TaxiRequestEvent` enum からシリアライズする outbox `payload JSONB` |
| `sqlx` + domain events | 単一トランザクション: 集約 `UPDATE` + outbox `INSERT` |
| `tokio` + outbox worker | 未 publish 行を poll、publish、`published_at` 更新。consumer は冪等 |


レビューでは、stateとoutboxの非原子的な別メソッド書き込み、SQLマッピング内でのevent構築、条件付き `version` なしのincrement、idempotency / versionなしのリトライ再適用、event payloadの裸 `f64` や型なし `String` を指摘する。

## レビューで見るところ

ユースケースがアトミックな作業単位を調整し、状態保存とイベント公開を同一トランザクションやアウトボックスで行っているか。冪等キーや重複排除なしに遷移・通知を二重適用しうるコマンドやコンシューマはないか（[テストデータ](/projects/kamae-rs/test-data/)）。高競合のload / modify / saveにバージョンやCASがなく、ゼロ行更新を `ConcurrentModification` へマップしていないかも見る。集約ルートを迂回した子の変更、リポジトリ内でのイベント発明、アプリ検査だけの不変条件、巨大CRUDトレイト、`.await` またぎの広い悲観ロック、未バージョンのイベント、暗黙の集約横断調整はないか。

