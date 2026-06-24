---
title: "永続化とイベント"
sidebar:
  order: 10
---

> **いつ読むか:** リポジトリ、トランザクション、アウトボックスレコード、冪等コマンド、楽観的ロック、イベントペイロードの設計。
> **関連:** [`aggregates.md`](/docs/kamae/python/references/aggregates/)、[`orm-adapters.md`](/docs/kamae/python/references/orm-adapters/)、[`infrastructure-resilience.md`](/docs/kamae/python/references/infrastructure-resilience/)、[`boundary-defense.md`](/docs/kamae/python/references/boundary-defense/)。

アグリゲートルート、1 コマンド一貫性境界、トランザクションの所有者については [`aggregates.md`](/docs/kamae/python/references/aggregates/) を読む。

## リポジトリプロトコルは小さく保つ

楽観的ロック、冪等性、イベント永続化向けの**正規** `RequestResolver` と `RequestStore` 定義:

リポジトリプロトコルは ORM の都合ではなくユースケースのニーズを表現すべきである。広い CRUD 操作への依存を呼び出し側から防ぐとき、読み取りと書き込みインターフェースを分割する。

```python
class RequestResolver(Protocol):
    async def find_waiting(self, request_id: UUID) -> Waiting | None: ...


class RequestStore(Protocol):
    async def save_en_route(
        self,
        state: EnRoute,
        events: tuple[DriverAssigned, ...],
        *,
        expected_version: int,
        idempotency_key: str,
    ) -> None: ...
```

アダプターは内部で SQLAlchemy、SQLModel、asyncpg、psycopg、Django ORM などを使える。そのツールのモデル形状をデフォルトでドメイン API にしてはならない。ORM エンティティと Pydantic ドメイン状態間のマッパー実装は [`orm-adapters.md`](/docs/kamae/python/references/orm-adapters/) を読む。

## 楽観的ロック

<!-- constrained-by ./aggregates.md#optimistic-vs-pessimistic-concurrency -->

**チェックリスト対応（12.1、12.4）:** 状態とともにバージョンを読み込み、純粋遷移を適用し、`expected_version` で保存する。データベース `UPDATE` は条件付きであるべきだ。

### 状態とバージョン列

永続化アグリゲート行に単調増加の `version` を含める（またはデータベースが並行性下で一意性を保証する場合のみ `updated_at` トークンから導出。稀）。

```python
class Waiting(DomainModel):
    kind: Literal["waiting"] = "waiting"
    request_id: UUID
    tenant_id: UUID
    passenger_id: UUID
    created_at: datetime
    version: int  # starts at 1 on create; increment on each successful save
```

### バージョンチェック付きリポジトリ保存

```python
class VersionConflict(Exception):
    def __init__(self, aggregate_id: UUID, expected: int, actual: int | None) -> None:
        self.aggregate_id = aggregate_id
        self.expected = expected
        self.actual = actual


async def save_en_route(
    conn: asyncpg.Connection,
    state: EnRoute,
    events: tuple[DriverAssigned, ...],
    *,
    expected_version: int,
    idempotency_key: str,
) -> None:
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            UPDATE taxi_requests
            SET kind = $2,
                driver_id = $3,
                assigned_at = $4,
                version = version + 1
            WHERE request_id = $1
              AND version = $5
              AND tenant_id = $6
            RETURNING version
            """,
            state.request_id,
            state.kind,
            state.driver_id,
            state.assigned_at,
            expected_version,
            state.tenant_id,
        )
        if row is None:
            current = await conn.fetchval(
                "SELECT version FROM taxi_requests WHERE request_id = $1",
                state.request_id,
            )
            raise VersionConflict(state.request_id, expected_version, current)

        for event in events:
            await insert_outbox_event(conn, event, idempotency_key=idempotency_key)
```

`VersionConflict` をユースケースで `Err` にマップする。クライアントは新しい読み取りでリトライできる。リポジトリ内で盲目的にリトライしない。

### ユースケースフロー

```python
waiting = await resolver.find_waiting(request_id)
if waiting is None:
    return Err(RequestNotFound(...))

en_route, events = assign_driver(waiting, driver_id, now=utc_now())

try:
    await store.save_en_route(
        en_route,
        events,
        expected_version=waiting.version,
        idempotency_key=idempotency_key,
    )
except VersionConflict:
    return Err(ConcurrentModification(request_id=request_id))

return Ok(en_route)
```

在庫や残高ホールド向けの悲観的ロック（`SELECT … FOR UPDATE`）はアダプターに属する。[`aggregates.md`](/docs/kamae/python/references/aggregates/#optimistic-vs-pessimistic-concurrency) を読む。

## トランザクションコンテキストマネージャー

リポジトリアダプターがトランザクションを所有する。例外下でもコミット/ロールバックが正しいよう、ドライバー固有のコンテキストマネージャーを使う。

### asyncpg

```python
import asyncpg


class AsyncpgUnitOfWork:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._conn: asyncpg.Connection | None = None
        self._tx: asyncpg.transaction.Transaction | None = None

    async def __aenter__(self) -> asyncpg.Connection:
        self._conn = await self._pool.acquire()
        self._tx = self._conn.transaction()
        await self._tx.start()
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        assert self._conn is not None and self._tx is not None
        try:
            if exc_type is None:
                await self._tx.commit()
            else:
                await self._tx.rollback()
        finally:
            await self._pool.release(self._conn)


async def save_with_outbox(pool: asyncpg.Pool, state: EnRoute, events: tuple[DriverAssigned, ...], *, expected_version: int) -> None:
    async with AsyncpgUnitOfWork(pool) as conn:
        await save_en_route(conn, state, events, expected_version=expected_version, idempotency_key=...)
```

### psycopg 3

```python
from psycopg import AsyncConnection
from psycopg.rows import dict_row


async def save_with_outbox_psycopg(conn: AsyncConnection, state: EnRoute, events: tuple[DriverAssigned, ...], *, expected_version: int) -> None:
    async with conn.transaction():
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                UPDATE taxi_requests
                SET kind = %(kind)s, driver_id = %(driver_id)s, version = version + 1
                WHERE request_id = %(request_id)s AND version = %(expected_version)s
                RETURNING version
                """,
                {**state.model_dump(mode="python"), "expected_version": expected_version},
            )
            if cur.rowcount != 1:
                raise VersionConflict(...)
        for event in events:
            await insert_outbox_event_psycopg(conn, event)
```

1 つの `async with conn.transaction()` ブロックが状態更新とアウトボックス挿入を包む。その間にコミットしない。

## 状態とイベントを原子性で永続化する

遷移がドメインイベントを発行するとき、アグリゲート状態とアウトボックス/イベント行を同一トランザクションで書く。呼び出し側が状態とイベントを別々に保存できる API は避ける。

```python
async with transaction:
    await update_request_state(state, expected_version=expected_version)
    await insert_outbox_events(events)
```

アウトボックスワーカーはコミット後にイベントを公開できる。トランザクション内、または状態コミット前の直接公開は、重複または欠落通知のリスクがある。

## アウトボックスリレーと at-least-once 配信

<!-- constrained-by ./infrastructure-resilience.md -->

メッセージブローカーは通常 **at-least-once** 配信を提供する。冪等コンシューマーと公開側の重複排除を前提に設計する。

### アウトボックステーブル形状

```python
class OutboxRow(BaseModel):
    id: UUID
    aggregate_id: UUID
    event_name: str
    event_version: int
    payload: dict[str, object]
    idempotency_key: str
    created_at: datetime
    published_at: datetime | None = None
```

### ワーカーパターン

```text
loop:
  SELECT ... FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT N FOR UPDATE SKIP LOCKED
  publish each row to broker
  UPDATE outbox SET published_at = now() WHERE id = ...
```

保証:

1. **状態とアウトボックス行は一緒にコミット** — コンシューマーは未コミット状態のイベントを見ない。
2. **コミット後に公開** — ワーカーはコミット済み行のみ読む。
3. **at-least-once 公開** — 公開後、`published_at` 更新前にクラッシュすると重複配信。コンシューマーは `event_id` で重複排除。
4. **`event_id` 一意** — アウトボックスまたはコンシューマー受信箱テーブルに `UNIQUE(event_id)` を挿入。
5. **冪等ハンドラー** — 副作用の前に `INSERT INTO processed_events (event_id) ON CONFLICT DO NOTHING`。

```python
async def relay_outbox_batch(conn: asyncpg.Connection, publisher: EventPublisher) -> int:
    rows = await conn.fetch(
        """
        SELECT id, payload, event_id
        FROM outbox
        WHERE published_at IS NULL
        ORDER BY created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
        """
    )
    count = 0
    for row in rows:
        await publisher.publish(row["payload"])
        await conn.execute(
            "UPDATE outbox SET published_at = now() WHERE id = $1",
            row["id"],
        )
        count += 1
    return count
```

公開失敗はバックオフでリトライ（`infrastructure-resilience.md`）。保持方針が要求するまでアウトボックス行を削除しない。

## データベースに重要な不変条件をミラーする

データベースが強制できる不変条件にはデータベース制約を使う: 一意性、テナント所有外部キー、非負残高、有効ライフサイクル状態、冪等性キー、イベント一意性。

良いエラーとドメインの明確さのためアプリケーションチェックは依然として必要だが、並行性下では不十分である。

```sql
ALTER TABLE taxi_requests
    ADD CONSTRAINT taxi_requests_version_positive CHECK (version > 0);

CREATE UNIQUE INDEX outbox_event_id_unique ON outbox (event_id);

CREATE TABLE command_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    response_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## リトライを冪等にする

コマンド、イベントハンドラー、Webhook、アウトボックスリレー、外部呼び出しは、リトライ時に金額、在庫、ライフサイクル遷移、通知を二重適用してはならない。

冪等性キー、重複排除レコード、一意制約、イベント ID、またはインフラで利用可能な exactly-once 処理保証を使う。リポジトリまたはハンドラープロトコルは冪等性キーが入る場所を示すべきだ。

```python
async def save_en_route(..., idempotency_key: str) -> None:
    async with conn.transaction():
        existing = await conn.fetchrow(
            "SELECT response_hash FROM command_idempotency WHERE idempotency_key = $1",
            idempotency_key,
        )
        if existing is not None:
            return  # prior attempt succeeded; return cached response if needed

        await _do_save(...)
        await conn.execute(
            "INSERT INTO command_idempotency (idempotency_key, aggregate_id) VALUES ($1, $2)",
            idempotency_key,
            state.request_id,
        )
```

## 永続化イベントにバージョンを付ける

イベントは長寿命の契約である。イベント名/型、バージョン、イベント ID、発生タイムスタンプ、アグリゲート ID、明示的単位と精度のペイロードを含める。

```python
class DriverAssigned(DomainModel):
    event_name: Literal["driver_assigned"] = "driver_assigned"
    event_version: Literal[1] = 1
    event_id: UUID
    event_at: datetime
    aggregate_id: UUID
    driver_id: UUID
    passenger_id: UUID
```

非同期に保存または消費されるとき、ペイロードを変更する前に後方互換の逆シリアライズ計画を定義する。

## イベントスキーマ進化

**チェックリスト対応（12.6）:** 保存されるイベントには `event_name` + `event_version` と文書化されたマイグレーション経路が必要である。

### バージョニングルール

| 変更 | 戦略 | コンシューマー側 |
| --- | --- | --- |
| オプショナルフィールド追加 | `event_version` を上げる。新フィールドにデフォルトまたは `None` | `extra="ignore"` のバージョン付き DTO でパースする古いコンシューマーは未知フィールドを無視 |
| 必須フィールド追加 | 新 `event_version` のみ。古い行を遡及しない | コンシューマーは `event_version` で分岐またはアップキャスター |
| フィールド改名 | 新バージョン。読み取り時に v1 → v2 アップキャスター | リプレイジョブはドメインハンドラー前にアップキャスター |
| フィールド削除 | 発行停止。古いバージョンは逆シリアライズ継続 | イベントカタログに tombstone 文書 |
| 意味変更（単位、列挙） | 新 `event_name` またはバージョン。意味を上書きしない | 明示的破壊的変更注記 |

### 消費時のアップキャスター

```python
DriverAssignedAdapter = TypeAdapter(DriverAssigned)


def parse_driver_assigned(raw: dict[str, object]) -> DriverAssigned:
    version = raw.get("event_version", 1)
    if version == 1:
        return DriverAssignedAdapter.validate_python(raw)
    if version == 2:
        dto = DriverAssignedV2Adapter.validate_python(raw)
        return DriverAssigned(
            event_id=dto.event_id,
            event_at=dto.event_at,
            aggregate_id=dto.aggregate_id,
            driver_id=dto.driver_id,
            passenger_id=dto.passenger_id,
        )
    raise UnsupportedEventVersion(event_name="driver_assigned", version=version)
```

### デュアルライト / デュアルリード期間

ライブトラフィックを移行するとき:

1. **v1 と v2 の両方**を受け入れるコンシューマーをデプロイ。
2. v2（または移行中は両方）を発行するプロデューサーをデプロイ。
3. 必要ならオフラインジョブで履歴アウトボックス/アーカイブ行をバックフィル。
4. v1 トラフィックがゼロであるメトリクスを確認した後のみ v1 サポートを削除。

新フィールドに PII を含めるときは [`pii-protection.md`](/docs/kamae/python/references/pii-protection/) に合わせる。保持とマスキングレビューが必要である。

## レビュー観点

### 12.1 状態とドメインイベントはアトミックに永続化されるか — High

トランザクションやアウトボックスパターンなしに、集約状態の保存とイベントの発行/挿入を別操作で行うユースケースを指摘する。

### 12.2 リポジトリプロトコルはドメインのニーズを表現しているか — Medium

ユースケースが実際に必要とする小さなインターフェースではなく、ORM CRUD を写した大きなリポジトリプロトコルを指摘する。

### 12.3 イベントは永続化アダプター外で生成されるか — Medium

ユースケース/ドメイン層が供給したイベントを永続化するのではなく、リポジトリ内でビジネスイベントを発明する箇所を指摘する。

### 12.4 DB 制約は重要な不変条件を反映しているか — Medium

一意性、テナント所有権、非負残高、有効ライフサイクル状態、外部キー存在など、DB が強制できるのにアプリケーションチェックだけに頼る永続化を指摘する。

### 12.5 リトライと重複配信は冪等か — High

冪等キーや重複排除レコードなしに、金額、在庫、ライフサイクル遷移、通知を二重適用しうるコマンド、イベントハンドラ、アウトボックスプロセッサ、外部呼び出しを指摘する。

### 12.6 永続化イベントはバージョン管理されているか — Medium

イベントを非同期に保存・消費するのに、明示的イベント型/バージョン、スキーマ進化戦略、後方互換デシリアライズのないイベントペイロードを指摘する。
