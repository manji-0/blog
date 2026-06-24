---
title: "永続化、集約、イベント"
sidebar:
  order: 10
---

状態変更とドメインイベントを別操作で保存すると、リトライや障害のたびに不整合が残る。Kamae では集約境界・楽観的ロック・アウトボックスをセットで設計し、1 コマンドの作業単位をユースケースが所有する。

状態型と遷移は [状態遷移](/docs/kamae-rs/state-transitions/) と [ドメインモデリング](/docs/kamae-rs/domain-modeling/) が前提。非同期消費側は [ストリームと継続クエリ](/docs/kamae-rs/stream-continuous-queries/)、配線は [アプリケーション配線](/docs/kamae-rs/application-wiring/) を参照する。

## 集約とトランザクション境界

1 つの集約ルートが、まとめて変わる必要のある不変条件を所有する。ユースケースはその集約をロードし、純粋遷移を実行し、ストレージモデルが許す範囲で 1 トランザクション境界内に結果を永続化する。

集約横断ルールは ID、スナップショット、ドメインイベント、または後続ユースケースを使う。2 つの集約ルートをメモリ上で変更し、呼び出し側が両方 save してくれることを期待しない。

## 集約ルートを表現する

集約ごとに主要表現を 1 つ選ぶ:

- **State struct ファミリー** — 型付き遷移（`WaitingRequest`、`EnRouteRequest` など）
- **集約 enum** — ロード/セーブと dispatch（`TaxiRequest`）
- **Root struct** — 1 エンティティがライフサイクルを明確に所有し、子 value object に独立した変更経路がない

ルートだけが集約不変条件を変更できる。集約内の子エンティティは root メソッドまたは consuming state 遷移経由で更新し、外部から直接変更しない。

## ユースケースをトランザクション境界とする

ユースケースは次の順序を所有する:

```text
begin/load -> authorize -> transition (pure) -> save state + events -> commit
```

ドメインコードはトランザクションを begin/commit しない。port は adapter が原子的に実装する操作を公開する。

```rust
pub async fn execute(&self, cmd: AssignDriverCommand) -> Result<(), AssignDriverError> {
    let waiting = self.load_waiting(&cmd.request_id).await?;
    self.authorize(&cmd.actor, &waiting)?;

    let transition = waiting
        .assign_driver(cmd.driver)
        .map_err(AssignDriverError::Domain)?;

    self.store
        .save_assigned(&transition.state, &transition.events)
        .await?;

    Ok(())
}
```

state と outbox/event 行の一貫性が必要なら、`save_*` port メソッドは 1 DB トランザクションで両方を書く。

## 楽観的並行性がデフォルト

競合する集約には、集約ルートに単調増加 `version` または `updated_at` チェックを付ける。load port は現行 version を返し、save port は古い書き込みを拒否する。

```rust
pub struct Versioned<T> {
    pub value: T,
    pub version: AggregateVersion,
}

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("concurrent modification for request {request_id}")]
    ConcurrentModification { request_id: RequestId },
}
```

典型的フロー:

1. `Versioned<WaitingRequest>` をロード
2. `value` 上で純粋遷移
3. `expected_version = version` で save
4. 0 行更新または version 不一致を `ConcurrentModification` にマップ

競合は型付きユースケースエラーとして公開し、呼び出し側がリトライまたは 409 を返せるようにする。

## 悲観的ロックは限定的に

`SELECT ... FOR UPDATE`、行ロックなどは、在庫予約、座席ホールド、台帳記帳のように短く境界の明確なクリティカルセクション向け。楽観的リトライが unsafe または高コストな場合。

ルール:

- ロックは adapter トランザクション内で取得。ドメインコードではない。
- ロック区間は小さく。ランタイムと pool 戦略が明示的に設計されていない限り、`.await` 越しにロックを保持しない。
- SQL ロック詳細を上に漏らすより、`reserve_inventory_for_update` のようなドメイン固有 port を優先。

## 神集約なしで集約横断を調整する

1 コマンドが複数ルートに触れるとき:

| 状況 | 推奨アプローチ |
| --- | --- |
| 1 ルートが決定を所有し、他は事実だけ必要 | ID でスナップショットまたは read model をクエリ |
| 両ルート変更が必要で、一方失敗時に他方をロールバック | 単一ユースケース、明示順序、saga/outbox、または datastore が許す 1 トランザクション境界 |
|  eventual consistency で足りる | ドメインイベント + 下流 consumer |

集約横断オーケストレーションを repository adapter 内に隠さない。ユースケースがビジネスステップを名指しする。

## Idempotency は境界付近に属する

リトライされうるコマンド（HTTP クライアント、queue consumer、outbox processor）は `CommandId` または idempotency key を持つ。state 変更と一緒、または dedupe テーブルに永続化し、重複配送が遷移を二重適用しないようにする。

idempotency は handler の後付けではなく、トランザクションストーリーの一部として扱う。

レビューでは、ユースケースがトランザクション境界を所有しないこと、集約ルートを迂回した子エンティティの変更、バージョンチェックの欠如、過剰な悲観的ロック、メモリ上の二重集約変更、冪等性のないリトライを指摘する。


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

遷移が domain event を出すとき、state 変更と outbox 行は**同一トランザクション**で save する。途中でプロセスが落ちた場合に「状態だけ進んだ」「イベントだけ二重に配信された」という不整合が残るため、呼び出し側が state と event を別メソッドで保存できる API は避ける。読み取り専用の投影や「とりあえずログに出す」用途で分けたくなっても、権威ある write path は 1 本に保つ。

## event レコードは不変

event は明示的な struct または enum でモデル化し、identifier、timestamp、aggregate id、event name/type、payload を含める。event は repository の永続化コードではなく、ユースケースまたはドメイン層で生成する。adapter が event を「補完」すると監査とリプレイの信頼性が失われ、テストでも本番と異なる経路が生まれる。

event payload では型付き timestamp、money、単位を使う。裸の `String`、`i64`、`f64` より `OccurredAt`、`Money`、`DistanceMeters`、`CurrencyCode` など。event レコードは長寿命の契約なので、型境界で単位と精度を最初から明確にしておく。

## 必要なら永続 event を Stream で公開

read model、統合、オペレータが変更フィードを購読するとき、ユースケース内 ad-hoc poll ではなく `futures::Stream` port で永続 event または outbox 行を公開。[ストリームと継続クエリ](/docs/kamae-rs/stream-continuous-queries/) で backpressure、checkpoint、projection idempotency。

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

`ConcurrentModification` を型付きユースケースエラーとして公開し、HTTP が 409、queue consumer が fresh load でリトライできるようにする。[永続化、集約、イベント](/docs/kamae-rs/persistence-events/#optimistic-concurrency-is-the-default) 参照。

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

persistence adapter も HTTP やキューと同様に、DTO → ドメイン変換のルールに従う（[境界防御](/docs/kamae-rs/boundary-defense/#database-rows-sqlxfromrow) 参照）。たとえば `en_route` 行に `driver_id` が NULL のまま読み込まれた場合、無効な `EnRouteRequest` を組み立てて遷移に渡すのではなく、adapter で `RepositoryError::CorruptRow` として返す。破損行を黙って通すと、後続のユースケースが「ありえない状態」で動き続け、原因の特定が難しくなる。

## よくある crate 組み合わせ

| スタック | 永続化パターン |
| --- | --- |
| `sqlx` + `thiserror` | `FromRow` row struct、型付き `RepositoryError`、adapter 内トランザクション |
| `sqlx` + `serde_json` | `TaxiRequestEvent` enum からシリアライズする outbox `payload JSONB` |
| `sqlx` + domain events | 単一トランザクション: 集約 `UPDATE` + outbox `INSERT` |
| `tokio` + outbox worker | 未 publish 行を poll、publish、`published_at` 更新。consumer は冪等 |


レビューでは、state と outbox の非原子的な別メソッド書き込み、SQL マッピング内での event 構築、条件付き `version` なしの increment、idempotency / version なしのリトライ再適用、event payload の裸 `f64` や型なし `String` を指摘する。

## レビュー観点

### 1 ユースケースがトランザクション境界を所有しているか — High

単一ユースケースがアトミックな作業単位を調整せず、無関係な複数の呼び出し元から状態保存・イベント発行・メッセージ公開を担うワークフローを指摘する。

### リトライと重複コマンドは境界で冪等か — High

[テストデータ](/docs/kamae-rs/test-data/) も参照。冪等キーや重複排除レコードなしに同一遷移を二重適用しうるコマンドハンドラやコンシューマを指摘する。

### リトライと重複配信は冪等か — High

冪等キーや重複排除レコードなしに、金額、在庫、ライフサイクル遷移、通知を二重適用しうるコマンド、イベントハンドラ、アウトボックスプロセッサ、外部呼び出しを指摘する。

### 状態とドメインイベントは原子的に永続化されているか — High

トランザクションやアウトボックスパターンなしに、集約状態の保存とイベントの公開 / 挿入を別操作で行うユースケースを指摘する。

### 競合書き込みには楽観的並行性が扱われているか — High

残高、ライフサイクル状態、在庫、その他高競合集約の load / modify / save に、バージョンチェック、compare-and-swap、または同等の DB 制約がない場合は指摘する。

ゼロ行更新とバージョン不一致は、黙った成功ではなく `ConcurrentModification` のような型付きエラーへマップする。

### 集約不変条件はルート経由でのみ変更されるか — High

集約ルートの遷移メソッドや型付き状態構造体を迂回して、子エンティティやライフサイクル状態を変更するコードを指摘する。

### DB 制約は重要な不変条件を反映しているか — Medium

一意性、テナント所有権、非負残高、有効なライフサイクル状態、外部キー存在を DB が強制できるのに、アプリケーション検査だけに頼る永続化を指摘する。

### イベントは永続化アダプタ外で生成されているか — Medium

ユースケース / ドメイン層から供給されたイベントを永続化するのではなく、リポジトリ内部でビジネスイベントを発明する箇所を指摘する。

### リポジトリトレイトはドメインのニーズを表現しているか — Medium

ユースケースが実際に必要とする小さなインターフェースではなく、ORM CRUD を写した大きなリポジトリトレイトを指摘する。

### 悲観的ロックはスコープが限定され正当化されているか — Medium

楽観的並行性や DB 制約で足りるのに、特に `.await` をまたぐ広いまたは長時間のロックを指摘する。ロックスコープが不明瞭、またはドメイン不変条件がまだ競合しうる場合はエスカレートする。

### 永続化イベントはバージョン付けされているか — Medium

イベントを非同期に保存または消費するのに、明示的なイベント型 / バージョン、スキーマ進化戦略、後方互換デシリアライズがないイベントペイロードを指摘する。

### 集約横断の調整は明示的か — Medium

メモリ上で 2 つの集約ルートを変更し、呼び出し元の両方永続化に頼るユースケースやリポジトリを指摘する。イベント、saga、スナップショット、文書化された単一トランザクション戦略を提案する。

