---
title: "Rust Aggregates and Transaction Boundaries"
sidebar:
  order: 10
---

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./application-wiring.md -->

## Default Stance

One aggregate root owns the invariants that must change together. A use case
loads that aggregate, runs a pure transition, then persists the result inside one
transaction boundary when the storage model allows it.

Cross-aggregate rules use IDs, snapshots, domain events, or a follow-up use case.
Do not mutate two aggregate roots in memory and hope the caller saves both.

## Represent the Aggregate Root

Pick one primary representation per aggregate:

- **State struct family** for typed transitions (`WaitingRequest`,
  `EnRouteRequest`, ...).
- **Aggregate enum** for load/save and dispatch (`TaxiRequest`).
- **Root struct** when one entity clearly owns the lifecycle and child value
  objects do not have independent mutation paths.

The root is the only entry point that may change aggregate invariants. Child
entities inside the aggregate are updated through root methods or consumed state
transitions, not by external mutation.

## Keep the Use Case as the Transaction Boundary

The use case should own this sequence:

```text
begin/load -> authorize -> transition (pure) -> save state + events -> commit
```

Domain code does not begin or commit transactions. Ports expose operations that
the adapter implements atomically.

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

If state and outbox/event rows must stay consistent, the `save_*` port method
should perform both writes in one database transaction.

## Optimistic Concurrency Is the Default

For contested aggregates, attach a monotonic `version` or `updated_at` check to
the aggregate root. The load port returns the current version; the save port
rejects stale writes.

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

Typical flow:

1. Load `Versioned<WaitingRequest>`.
2. Run the pure transition on `value`.
3. Save with `expected_version = version`.
4. Map a zero-row update or version mismatch to `ConcurrentModification`.

Expose conflicts as typed use-case errors so callers can retry or surface a 409.

## Use Pessimistic Locking Narrowly

`SELECT ... FOR UPDATE`, row locks, or equivalent are for short, well-bounded
critical sections such as inventory reservation, seat holds, or ledger postings
where optimistic retries are unsafe or too expensive.

Rules:

- Acquire the lock inside the adapter transaction, not in domain code.
- Keep the locked section small; do not hold locks across `.await` unless the
  runtime and pool strategy are explicitly designed for it.
- Prefer a domain-specific port such as `reserve_inventory_for_update` over
  leaking SQL locking details upward.

## Coordinate Across Aggregates Without a God Aggregate

When one command touches multiple roots:

| Situation | Preferred approach |
| --- | --- |
| One root owns the decision; others only need facts | Load snapshots or query read models by ID |
| Both roots must change and one failure must roll back the other | Single use case, explicit ordering, saga/outbox, or one transactional boundary if the datastore supports it |
| Eventually consistent is acceptable | Domain event + downstream consumer |

Do not hide cross-aggregate orchestration inside a repository adapter. The use
case should name the business steps.

## Idempotency Belongs Near the Boundary

Commands that may retry (HTTP clients, queue consumers, outbox processors)
should carry a `CommandId` or idempotency key. Persist it with the state change
or in a dedupe table so a duplicate delivery does not apply the transition twice.

Treat idempotency as part of the transaction story, not as an afterthought in
the handler.
