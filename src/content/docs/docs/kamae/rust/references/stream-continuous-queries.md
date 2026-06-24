---
title: "Rust ストリームと継続クエリ"
sidebar:
  order: 10
---

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./aggregate-transactions.md -->

## event と変更フィードに Stream を使う

event-sourced または CQRS 設計では、consumer が one-shot クエリではなく集約変更の継続フィードを必要とすることが多い。adapter 内の ad-hoc callback ループではなく、port 境界で `futures::Stream`（または `tokio_stream::StreamExt` ヘルパー）としてモデル化する。

```rust
use futures::Stream;
use std::pin::Pin;

pub type EventStream<E> = Pin<Box<dyn Stream<Item = Result<E, StreamError>> + Send>>;

pub trait AggregateEventSource {
    fn subscribe(
        &self,
        aggregate_id: RequestId,
        after: Option<EventSequence>,
    ) -> EventStream<DomainEvent>;
}
```

ドメイン遷移は同期のまま。Stream は read-side projection、outbox processor、ストレージを poll/subscribe する integration adapter に属する。

## コマンドパスと read stream を分離

| Concern | Shape | Notes |
| --- | --- | --- |
| Write use case | `async fn -> Result<(), E>` | 1 コマンド、1 トランザクション境界 |
| Aggregate replay | `Stream<Item = Result<DomainEvent, E>>` | 1 集約の順序付き event |
| Continuous query / projection | `Stream<Item = Result<ReadModelRow, E>>` | 派生 state。write model より遅れうる |
| Outbox dispatch | `Stream<Item = Result<OutboxMessage, E>>` | at-least-once 配送。handler は冪等 |

ドメイン遷移メソッドから `Stream` を公開しない。遷移から event を出し、原子的に persist し、adapter が永続ログを stream として公開する。

## persist 後に subscribe

event sequence、LSN、または `occurred_at` + tie-breaker など durable cursor から subscription を開始する。consumer 再接続時に event を落とす in-memory broadcast を避ける。

```rust
pub struct EventCursor {
    aggregate_id: RequestId,
    after_sequence: EventSequence,
}

impl OutboxReader {
    pub fn stream_pending(&self, batch_size: usize) -> EventStream<OutboxRow> {
        // Adapter polls DB or message log and yields rows as a Stream.
        self.poll_pending(batch_size)
    }
}
```

projection が追いついたら、projection テーブルと同じ persistence 技術に checkpoint を保存し、再起動時に安全再開する。

## バックプレッシャーとキャンセルを扱う

バックプレッシャーを適用しない stream は、consumer が遅いとメモリを使い尽くしたり重複作業を起こす。

- ストレージ poll と handler の間は明示容量の bounded channel（`tokio::sync::mpsc`）
- キャンセルを伝播: `JoinHandle` または HTTP リクエスト drop 時に poll を止め DB cursor または lock を解放
- `Stream::poll_next` エラーは、adapter がリトライ意味論を文書化しない限りその subscription では terminal

```rust
use futures::StreamExt;
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel(128);

tokio::spawn(async move {
    let mut stream = source.subscribe(request_id, cursor).await;
    while let Some(item) = stream.next().await {
        if tx.send(item).await.is_err() {
            break; // consumer dropped; stop reading
        }
    }
});
```

## projection は決定論的かつ冪等

継続クエリは event stream から read model を再構築する。各 handler は:

1. event payload を型付き domain または integration event にパース
2. event ID または `(aggregate_id, sequence)` で idempotent に更新適用
3. スキーマ進化ポリシーに従い未知 type/version をスキップまたは dead-letter（[`service-boundaries.md`](/docs/kamae/rust/references/service-boundaries/) 参照）

```rust
async fn apply_event(
    store: &mut ProjectionStore,
    event: StoredEvent,
) -> Result<(), ProjectionError> {
    if store.already_applied(&event.id)? {
        return Ok(());
    }

    match event.kind {
        EventKind::DriverAssigned(payload) => store.mark_en_route(payload)?,
        EventKind::Unknown { version, name } => return Err(ProjectionError::Unsupported { version, name }),
    }

    store.record_checkpoint(event.id)?;
    Ok(())
}
```

## CQRS 境界を明示

read model はクエリ向けに非正規化してよいが、第二の write model になってはならない。projection 内の集約横断更新は event に反応し、他集約を直接 mutate しない。

write 側のトランザクションスコープ、楽観的 versioning、outbox 原子性は [`aggregate-transactions.md`](/docs/kamae/rust/references/aggregate-transactions/) と [`persistence-events.md`](/docs/kamae/rust/references/persistence-events/) 参照。

## 検出ヒント

`Cargo.toml` に `futures`、`tokio-stream`、`async-stream`、event-store client があるとき、手動 `loop { sleep; poll }` worker より型付き `Stream` port を優先。subscription、projection、outbox processor に触れる diff では persistence と service-boundary ガイドと併せて読み込む。
