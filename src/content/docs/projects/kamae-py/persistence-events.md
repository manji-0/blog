---
title: "永続化、集約、イベント"
sidebar:
  order: 10
---

1コマンドで一貫させるべき状態変更とドメインイベントを別トランザクションで保存すると、障害やリトライのたびに「状態だけ進んだ」「イベントだけ二重に出た」が起きうる。Kamaeでは集約境界・楽観的ロック・アウトボックスをセットで設計する。

状態の型と純粋遷移は [状態遷移](/projects/kamae-py/state-transitions/) と [ドメインモデリング](/projects/kamae-py/domain-modeling/) が前提。ORMへの落とし込みは [ORM アダプター](/projects/kamae-py/orm-adapters/)、外部呼び出しのリトライは [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/) と整合させる。

## ここでの集約の定義

DDDの用語をそのまま全テーブルに当てはめるのではなく、**1 コマンドで一貫させたい不変条件**の単位として集約を切る。

Kamae Pythonにおける**集約**は、次の単位である：

- 1つの判別状態共用体（`TaxiRequest = Waiting | EnRoute | ...`）
- その共用体を変更する純粋遷移関数
- それらの遷移が発行するドメインイベント
- コマンドごとの1つの一貫性境界

**集約ルート**は状態共用体を所有するアイデンティティである。タクシーの例では、`request_id` が `TaxiRequest` 集約ルートを識別する。

すべてのデータベーステーブルを集約としてモデル化しない。1コマンドで一貫性を保つ必要があるビジネス不変条件ごとに1ルートを優先する。

## 境界の内側と外側

| 1 集約内 | 外側 / 別集約 |
| --- | --- |
| 同一ルートの状態バリアント | 独立したライフサイクルを持つ `Passenger`、`Driver`、`Payment`、`Invoice` |
| ルート状態が参照する値オブジェクト | ルックアップにのみ使われ、同一コマンドで変更されない外部キー |
| ルートの遷移が発行するイベント | 別ルートの状態変化を記述するイベント |

2つのルートがすべてのコマンドで一緒に変わる必要があるなら、境界を小さくモデル化しすぎている可能性がある。その場合はマージするか、結果整合性を受け入れる。

```python
# Inside TaxiRequest aggregate
type TaxiRequest = Annotated[
    Waiting | EnRoute | InTrip | Completed | Cancelled,
    Field(discriminator="kind"),
]

# Separate aggregate: do not mutate inside assign_driver_use_case
class DriverAvailability(DomainModel):
    driver_id: UUID
    is_available: bool
```

集約横断ルールは、アプリケーションレイヤーのオーケストレーション、サガ、またはリアクティブハンドラーに属する。単一ルートの純粋遷移の内側には置かない。

## 1 ユースケース、1 集約、1 一貫性境界

デフォルトルール：

```text
HTTP/queue command
  -> use case (application)
       -> load one aggregate state
       -> authorize
       -> pure transition
       -> build domain events
       -> repository.save(state, events)   # single TX
```

ユースケースは、プロジェクトに明示的で文書化された例外がない限り、1トランザクションで2つの集約ルートを更新してはならない。2つのルートを整合させる必要があるときは、次を優先する：

1. 第2集約向けの**ドメインイベント + ハンドラー**（結果整合性）
2. 補償ステップ付きの**プロセスマネージャー / サガ**
3. 真の不変条件が原子性を要求するときの**単一集約の再設計**

## トランザクションの所有者

**リポジトリアダプター**が `save(...)` のデータベーストランザクションを所有すべきだ。ユースケースはビジネス上の順序を所有し、アダプターはコミット/ロールバックを所有する。

ポートメソッドにトランザクションの所有権を文書化する。パラメータは [永続化、集約、イベント](/projects/kamae-py/persistence-events/#keep-repository-protocols-small) の**正規**ポートと一致する：

```python
class RequestStore(Protocol):
    async def save_en_route(...) -> None:
        """Persist state and outbox rows atomically.

        Opens the transaction, writes aggregate state, inserts events/outbox
        records, and commits. Raises on infrastructure failure or version conflict.
        """
        ...
```

テストが依然として原子性セマンティクスを強制するインメモリフェイクを使う場合を除き、`save_state` と `insert_events` を別々の公開リポジトリメソッドに分割しない。

`VersionConflict` をユースケースで `Err` にマップする — [エラーハンドリング](/projects/kamae-py/error-handling/#preferred-pattern-early-return) を参照。

## 楽観的 vs 悲観的並行性

| 戦略 | 使うとき | リポジトリシグナル |
| --- | --- | --- |
| **楽観的**（デフォルト） | ほとんどのライフサイクル遷移。競合は稀またはリトライ可能 | `expected_version`、条件付き `UPDATE`、一意制約 |
| **悲観的** | 在庫、残高、座席ホールド、強い競合 | `SELECT ... FOR UPDATE`、行ロック、シリアライザブル分離 |

楽観的ロックはfrozen状態モデルと相性が良い。バージョンを読み込み、純粋遷移を適用し、`expected_version` で保存する。

悲観的ロックはアダプターに属する。SQLロックの詳細を純粋遷移関数に漏らさない。

## 不変条件: アプリケーション vs データベース

両方のレイヤーを維持する：

- **純粋遷移**は型と関数が明確に表現できるルールを強制する。
- **データベース制約**は並行性下でも存続すべきルールを強制する（`UNIQUE`、`CHECK`、外部キー、非負金額）。

アプリケーションチェックは良い `Err` 値を生成する。2つのコマンドが競合するとき、データベース制約はバックストップである。

## 集約サイズの指針

小さく始める。良い集約は：

- 明確なルートIDを持つ
- 小さな状態共用体を持つ
- 1回のリポジトリ呼び出しで読み込み・保存できる
- 自身の履歴を記述するイベントを発行する

次のときに集約を分割する：

- 読み込み/保存が重くなりすぎる
- 無関係なライフサイクルが1つのblobモデルを共有している
- 異なるコマンドが異なる一貫性戦略を必要とする

アウトボックスと冪等性の詳細は、後述の「アウトボックスリレーとat-least-once配信」および「リトライを冪等にする」を参照する。


## リポジトリプロトコルは小さく保つ

楽観的ロック、冪等性、イベント永続化向けの**正規** `RequestResolver` と `RequestStore` 定義：

リポジトリプロトコルはORMの都合ではなくユースケースのニーズを表現すべきだ。広いCRUD操作への依存を呼び出し側から防ぐ必要があるときは、読み取りと書き込みのインターフェースを分割する。

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

アダプターは内部でSQLAlchemy、SQLModel、asyncpg、psycopg、Django ORMなどを使える。そのツールのモデル形状をデフォルトでドメインAPIにしてはならない。ORMエンティティとPydanticドメイン状態間のマッパー実装は [ORM アダプター](/projects/kamae-py/orm-adapters/) を読む。

## 楽観的ロック

<!-- constrained-by ./persistence-events.md#optimistic-vs-pessimistic-concurrency -->

**チェックリスト対応（12.1、12.4）:** 状態とともにバージョンを読み込み、純粋遷移を適用し、`expected_version` で保存する。データベース `UPDATE` は条件付きにすべきだ。

### 状態とバージョン列

永続化集約行に単調増加の `version` を含める（またはデータベースが並行性下で一意性を保証する場合のみ `updated_at` トークンから導出。稀）。

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

在庫や残高ホールド向けの悲観的ロック（`SELECT … FOR UPDATE`）はアダプターに属する。[永続化、集約、イベント](/projects/kamae-py/persistence-events/#optimistic-vs-pessimistic-concurrency) を読む。

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

1つの `async with conn.transaction()` ブロックが状態更新とアウトボックス挿入を包む。その間にコミットしない。

## 状態とイベントを原子性で永続化する

遷移がドメインイベントを発行するとき、集約状態とアウトボックス/イベント行を同一トランザクションで書く。呼び出し側が状態とイベントを別々に保存できるAPIは避ける。

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

保証：

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

データベースが強制できる不変条件にはデータベース制約を使う： 一意性、テナント所有外部キー、非負残高、有効ライフサイクル状態、冪等性キー、イベント一意性。

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

冪等性キー、重複排除レコード、一意制約、イベントID、またはインフラで利用可能なexactly-once処理保証を使う。リポジトリかハンドラープロトコルは冪等性キーが入る場所を示すべきだ。

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

イベントは長寿命の契約である。イベント名/型、バージョン、イベントID、発生タイムスタンプ、集約ID、明示的単位と精度のペイロードを含める。

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

ライブトラフィックを移行するとき：

1. **v1 と v2 の両方**を受け入れるコンシューマーをデプロイ。
2. v2（または移行中は両方）を発行するプロデューサーをデプロイ。
3. 必要ならオフラインジョブで履歴アウトボックス/アーカイブ行をバックフィル。
4. v1トラフィックがゼロであるメトリクスを確認した後のみv1サポートを削除。

新フィールドにPIIを含めるときは [PII と観測経路の保護](/projects/kamae-py/pii-protection/) に合わせる。保持とマスキングレビューが必要である。

## レビューで見るところ

1つのユースケースがトランザクションを所有し、状態とイベントがアウトボックス等でアトミックに永続化されているか。冪等キーなしの二重適用、version/CASなしの競合書き込み、集約ルート迂回の変更はないか（[テストデータ](/projects/kamae-py/test-data/)）。DB制約・狭いリポジトリ `Protocol`・イベント版管理・明示的な集約横断調整が足りているかも見る。楽観性で足りるのに `await` をまたぐ広い悲観ロックがないかも確認する。

