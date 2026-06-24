---
title: "Rust Persistence and Domain Events"
sidebar:
  order: 10
---

## Separate Repositories by Responsibility

Use repository traits to express domain needs, not ORM convenience. Keep read and write interfaces small.

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

Prefer native `async fn` in traits for internal traits on Rust 1.75+ when
callers use static dispatch and do not need `dyn Trait`. Use `async_trait` when
the project must support an older MSRV, a framework requires trait objects, or
the repository is intentionally stored behind `Box<dyn RequestStore + Send +
Sync>`. The tradeoff is explicit: native traits avoid macro expansion and
boxing in the static-dispatch path; `async_trait` gives ergonomic dynamic
dispatch by boxing returned futures.

## Persist State and Events Atomically

When transitions emit domain events, save state changes and outbox rows in the same transaction. Avoid APIs that let callers save state and events in separate operations.

For aggregate roots, optimistic versioning, pessimistic locking, and use-case
transaction boundaries, see [`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/).

## Keep Event Records Immutable

Model events as explicit structs or enums. Include identifiers, timestamp, aggregate id, event name/type, and payload. Generate events in the use-case/domain layer, not inside repository persistence code.

Use typed timestamps, money, and units in event payloads. For example, prefer
`OccurredAt`, `Money`, `DistanceMeters`, or `CurrencyCode` value objects over
bare `String`, `i64`, or `f64` fields. Event records are long-lived contracts;
make units and precision obvious at the type boundary.

## Expose Persisted Events as Streams When Needed

When read models, integrations, or operators subscribe to change feeds, expose
persisted events or outbox rows through `futures::Stream` ports rather than
pushing ad-hoc polling loops into use cases. See
[`stream-continuous-queries.md`](/docs/kamae-rs/references/stream-continuous-queries/) for backpressure,
checkpoints, and projection idempotency.

## Transaction Management with `sqlx`

The use case names the operation; the adapter owns `BEGIN` / `COMMIT` / `ROLLBACK`.

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

Rules:

- Do not hold a transaction open across unrelated `.await` work (external HTTP, long computation).
- Roll back on any error before commit; do not partially insert outbox rows outside the same transaction as state.
- Map `sqlx` errors to `RepositoryError` in the adapter, not in domain code.

## Outbox Table Schema

A minimal transactional outbox stores enough to publish reliably after commit:

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

Insert outbox rows in the same transaction as aggregate state. A background worker reads unpublished rows, publishes to a bus, then marks `published_at`. Processors must be idempotent because publish may retry.

## Event Serde Representation

Prefer an explicit enum with a tagged representation for stored and published events:

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

`#[serde(tag = "event_type")]` (internally tagged) gives a stable discriminator in JSON without a separate wrapper struct. For versioned event evolution:

- Add new variants; avoid reusing old `event_type` strings with different payload shapes.
- Keep leaf fields as value objects or DTOs that serde can round-trip.
- Store `payload` as JSONB in the outbox and deserialize back to `TaxiRequestEvent` in consumers.

For externally published contracts, consider a separate integration DTO if the public schema differs from the internal enum.

## Optimistic Locking with `version`

Attach a monotonic `version` (or `updated_at` with equality check) to the aggregate root. Load returns the current version; save checks it.

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

Expose `ConcurrentModification` as a typed use-case error so HTTP handlers can return 409 and queue consumers can retry with a fresh load. See [`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/#optimistic-concurrency-is-the-default).

## Idempotency Keys on Retry

Commands that may retry (HTTP clients, queue consumers, outbox processors) should carry an `IdempotencyKey` or `CommandId`. Persist it with the state change or in a dedupe table inside the same transaction.

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

Retry flow:

1. Client sends `Idempotency-Key` header or message attribute.
2. Use case passes key to `save_*`.
3. Adapter checks dedupe table inside the transaction before applying the transition.
4. On duplicate key, commit without re-applying and return success (or the original outcome).
5. On `ConcurrentModification`, reload and either retry the transition or surface conflict.

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

Pass the same idempotency key on every retry of the same logical command. Generate a new key only for a new business action.

## Row Mapping and Boundary Defense

Persistence adapters still follow DTO -> domain conversion. See [`boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/#database-rows-sqlxfromrow). Corrupt or legacy rows should fail in the adapter with `RepositoryError::CorruptRow`, not produce invalid domain state.

## Common Crate Combinations

| Stack | Persistence pattern |
| --- | --- |
| `sqlx` + `thiserror` | `FromRow` row structs, typed `RepositoryError`, transactions in adapter |
| `sqlx` + `serde_json` | Outbox `payload JSONB` serialized from `TaxiRequestEvent` enum |
| `sqlx` + domain events | Single transaction: `UPDATE` aggregate + `INSERT` outbox rows |
| `tokio` + outbox worker | Poll unpublished rows, publish, mark `published_at`; idempotent consumers |

## Review Signals

Flag when:

- State and outbox writes use separate public repository methods without a shared transaction.
- Events are constructed inside SQL mapping code instead of transition outcomes.
- `version` is incremented without a conditional `WHERE version = $expected`.
- Retries re-apply transitions without idempotency or version checks.
- Event payloads use bare `f64` for money or untyped `String` for enums.
