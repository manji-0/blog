---
title: "Rust Streams and Continuous Queries"
sidebar:
  order: 10
---

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./aggregate-transactions.md -->

## Use Streams for Event and Change Feeds

In event-sourced or CQRS designs, consumers often need a continuous feed of
aggregate changes rather than a one-shot query. Model these feeds with
`futures::Stream` (or `tokio_stream::StreamExt` helpers) at the port boundary,
not as ad-hoc callback loops inside adapters.

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

Keep domain transitions synchronous. Streams belong in read-side projections,
outbox processors, and integration adapters that poll or subscribe to storage.

## Separate Command Path from Read Streams

| Concern | Shape | Notes |
| --- | --- | --- |
| Write use case | `async fn -> Result<(), E>` | One command, one transaction boundary |
| Aggregate replay | `Stream<Item = Result<DomainEvent, E>>` | Ordered events for one aggregate |
| Continuous query / projection | `Stream<Item = Result<ReadModelRow, E>>` | Derived state, may lag the write model |
| Outbox dispatch | `Stream<Item = Result<OutboxMessage, E>>` | At-least-once delivery; handlers must be idempotent |

Do not expose a `Stream` from a domain transition method. Emit events from the
transition, persist them atomically, then let adapters expose the persisted log
as a stream.

## Subscribe After Persisting

Start subscriptions from a durable cursor: event sequence, LSN, or
`occurred_at` plus tie-breaker. Avoid in-memory broadcast that can drop events
when a consumer reconnects.

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

When a projection catches up, store the checkpoint in the same persistence
technology as the projection table so restarts resume safely.

## Handle Backpressure and Cancellation

Streams that never apply backpressure can exhaust memory or duplicate work when
consumers are slow.

- Use bounded channels (`tokio::sync::mpsc` with explicit capacity) between
  storage polling and handlers when bridging to async tasks.
- Propagate cancellation: when a `JoinHandle` or HTTP request is dropped, stop
  polling and release DB cursors or locks.
- Treat `Stream::poll_next` errors as terminal for that subscription unless the
  adapter documents retry semantics.

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

## Projections Must Be Deterministic and Idempotent

Continuous queries rebuild read models from event streams. Each handler should:

1. Parse the event payload into a typed domain or integration event.
2. Apply the update idempotently using event ID or `(aggregate_id, sequence)`.
3. Skip or dead-letter events with unknown type/version according to the schema
   evolution policy (see [`service-boundaries.md`](/docs/kamae-rs/references/service-boundaries/)).

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

## Keep CQRS Boundaries Explicit

Read models may denormalize for queries, but they must not become a second write
model. Cross-aggregate updates in a projection should react to events, not
mutate other aggregates directly.

For transaction scope on the write side, optimistic versioning, and outbox
atomicity, see [`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/) and
[`persistence-events.md`](/docs/kamae-rs/references/persistence-events/).

## Detection Hints

When `Cargo.toml` includes `futures`, `tokio-stream`, `async-stream`, or
event-store clients, prefer typed `Stream` ports over manual `loop { sleep;
poll }` workers. Load this guide together with persistence and service-boundary
guides when the diff touches subscriptions, projections, or outbox processors.
