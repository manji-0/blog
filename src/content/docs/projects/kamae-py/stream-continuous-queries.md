---
title: "ストリームと継続クエリ"
sidebar:
  order: 10
---

イベントを購読する側は少なくとも一度の配信と再起動を前提にする。メモリ上のbroadcastだけに頼ると再接続でイベントを落とし、チェックポイントなしでは重複処理とスキップの両方が起きうる。

権威ある状態変更はコマンド経路（[状態遷移](/projects/kamae-py/state-transitions/)）に留め、投影は読み取りモデルとして扱う。保存形式は [永続化、集約、イベント](/projects/kamae-py/persistence-events/)、スキーマ進化は [サービス境界](/projects/kamae-py/service-boundaries/) と整合させる。

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./aggregates.md -->
<!-- constrained-by ./service-boundaries.md -->

## event と変更フィードに async iterator を使う

event-sourcedまたはCQRS設計では、consumerがone-shotクエリではなく集約変更の継続フィードを必要とすることが多い。テスト可能な表面を持たない `while True: sleep; poll` ループではなく、port境界で `AsyncIterator[T]` としてモデル化する。

```python
from collections.abc import AsyncIterator
from typing import Protocol


class AggregateEventSource(Protocol):
    def subscribe(
        self,
        aggregate_id: RequestId,
        after: EventSequence | None,
    ) -> AsyncIterator[DomainEvent]: ...
```

ドメイン遷移はビジネスルールに対して同期のまま。Streamはread-side projection、outbox processor、ストレージをpoll/subscribeするintegration adapterに属する。

## コマンドパスと read stream を分離

| 関心 | 形状 | 備考 |
| --- | --- | --- |
| Write use case | `async def -> Result[..., E]` | 1コマンド、1トランザクション境界 |
| Aggregate replay | `AsyncIterator[DomainEvent]` | 1集約の順序付きevent |
| Continuous query / projection | `AsyncIterator[ReadModelRow]` | 派生state。write modelより遅れうる |
| Outbox dispatch | `AsyncIterator[OutboxRow]` | at-least-once配送。handlerは冪等 |

ドメイン遷移関数から `AsyncIterator` を公開しない。遷移からeventを出し、原子的に永続化し、adapterが永続ログをstreamとして公開する。

## persist 後に subscribe

event sequence、LSN、または `occurred_at` + tie-breakerなどdurable cursorからsubscriptionを開始する。consumer再接続時にeventを落とすin-memory broadcastを避ける。

```python
from pydantic import BaseModel, ConfigDict


class EventCursor(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True)

    aggregate_id: UUID
    after_sequence: int


async def stream_pending(
    conn: asyncpg.Connection,
    *,
    batch_size: int = 50,
) -> AsyncIterator[OutboxRow]:
    rows = await conn.fetch(
        """
        SELECT id, payload, event_id, sequence
        FROM outbox
        WHERE published_at IS NULL
        ORDER BY sequence
        LIMIT $1
        FOR UPDATE SKIP LOCKED
        """,
        batch_size,
    )
    for row in rows:
        yield OutboxRow.from_record(row)
```

projectionが追いついたら、projectionテーブルと同じ永続化技術にチェックポイントを保存し再起動後も安全に再開する。outbox relayの詳細は [永続化、集約、イベント](/projects/kamae-py/persistence-events/) を参照。

## バックプレッシャーとキャンセル

バックプレッシャーを適用しないstreamは、consumerが遅いときにメモリを枯渇させたり重複作業を増やす。

- ストレージpollとhandlerの間には `asyncio.Queue(maxsize=...)` など有界キューを優先
- タスクまたはHTTPリクエストがキャンセルされたらpollを止め、DBカーソルやロックを解放する
- iteratorエラーは、adapterがリトライ意味を文書化しない限りそのsubscriptionにとって終端とみなす

```python
async def bridge(
    source: AggregateEventSource,
    request_id: RequestId,
    cursor: EventSequence | None,
    queue: asyncio.Queue[DomainEvent | None],
) -> None:
    try:
        async for event in source.subscribe(request_id, cursor):
            await queue.put(event)
    finally:
        await queue.put(None)  # sentinel: producer finished or cancelled
```

event loopをブロックするCPUバウンド投影はコンポジションルートでオフロード — [並行処理](/projects/kamae-py/concurrency/) を参照。

## 投影は決定的かつ冪等

継続クエリはevent streamからread modelを再構築する。各handlerは：

1. event payloadを型付きドメインまたはintegration eventにパース
2. event IDまたは `(aggregate_id, sequence)` で冪等に更新を適用
3. 未知type/versionは [サービス境界](/projects/kamae-py/service-boundaries/) のスキーマ進化方針に従いスキップまたはdead-letter

```python
async def apply_event(
    store: ProjectionStore,
    event: StoredEvent,
) -> Result[None, ProjectionError]:
    if await store.already_applied(event.id):
        return Ok(None)

    match event.kind:
        case "driver_assigned":
            await store.mark_en_route(event.payload)
        case "unknown":
            return Err(
                ProjectionError.unsupported(
                    version=event.schema_version,
                    name=event.event_type,
                )
            )

    await store.record_checkpoint(event.id)
    return Ok(None)
```

## CQRS 境界を明示

read modelはクエリを速くするための非正規化ビューであり、第二のwrite modelではない。投影内で他集約を直接変更すると、コマンド経路を迂回した状態変更が増え、リトライや並行更新の見通しが立たなくなる。

write側のトランザクションスコープ、楽観的versioning、outboxの原子性は [集約とトランザクション境界](/projects/kamae-py/aggregates/) と [永続化、集約、イベント](/projects/kamae-py/persistence-events/) を参照。

## worker ランタイム

Celery、ARQ、RQ、Dramatiq、カスタムasyncio workerはstream consumerのコンポジションルートホストであり、ドメインモジュールではない。

| Host | Role | infrastructureに留める |
| --- | --- | --- |
| Celery / Dramatiq task | メッセージpull → DTO検証 → use caseまたはprojection呼び出し | リトライ、ack、routing key |
| ARQ / asyncio worker | outboxまたはbrokerをpoll → async iterator consumer | lease / SKIP LOCKED、heartbeat |
| Kafka / Redis Streams consumer | パーティションcursor → 型付きhandler | 冪等に適用したあと、offset commit |

`domain` パッケージからCeleryやbrokerクライアントをimportしない。FastAPI lifespanまたはworkerアプリファクトリーと並べてコンポジションルートで配線 — [アプリケーション配線](/projects/kamae-py/application-wiring/) を参照。

## 検出ヒント

`AsyncIterator` event port、outbox poller、projectionテーブル、Celery/ARQ consumer、`aiokafka`、Redis Streamsが導入されたとき、不透明なsleepループより型付きasync iterator portを優先する。subscription、projection、outbox processorに触れるdiffではpersistenceおよびservice-boundaryガイドも併せて読み込む。

## レビューで見るところ

プロジェクションがイベントIDや `(aggregate_id, sequence)` で冪等か。リード側ストリームが集約遷移や権威ある状態の永続化をしていないか。再起動後に再開できる永続カーソルはあるか。無制限バッファやコンシューマ脱落後も読み続けるストリームはないか。手書きの `while True: sleep; poll` より型付き `AsyncIterator` portの方が明確でないか。未対応イベント版でパニックや黙殺していないか（[サービス境界](/projects/kamae-py/service-boundaries/)）。
