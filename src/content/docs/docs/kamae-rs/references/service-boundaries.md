---
title: "Rust Service Boundaries"
sidebar:
  order: 10
---

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./persistence-events.md -->

## Treat Remote Services Like Any External Boundary

Microservice boundaries are DTO boundaries. Convert wire messages into domain
commands or integration events with `TryFrom`, the same way HTTP handlers and
queue consumers do inside a monolith.

```text
Protobuf/JSON message -> integration DTO -> TryFrom -> domain command or event
```

Do not import another service's generated protobuf types into domain crates.
Keep generated clients and servers in infrastructure or a dedicated `*-api`
crate; map into domain types at the adapter edge.

## gRPC and Protobuf Schema Evolution

Assume producers and consumers deploy independently. Every persisted or queued
protobuf message needs an explicit compatibility policy.

| Change | Compatibility | Preferred approach |
| --- | --- | --- |
| Add optional field | Backward compatible | New field with default; consumers ignore unknown fields |
| Add `oneof` variant | Forward compatible with care | Bump message version; old consumers skip unknown variants |
| Rename field | Breaking on the wire | Never rename field numbers; add new field and deprecate old |
| Change field type | Breaking | New message type or new `version` on envelope |
| Remove field | Breaking after deprecation | Reserve field number; dual-read during migration |

Wrap payloads in a versioned envelope when events cross service boundaries:

```rust
pub struct IntegrationEventEnvelope {
    pub event_type: EventTypeName,
    pub schema_version: u32,
    pub payload: prost::bytes::Bytes,
}
```

Consumers should:

1. Route on `event_type` and `schema_version`.
2. Deserialize into a version-specific DTO.
3. Convert DTO -> domain integration event with `TryFrom`.
4. Dead-letter or metric-count unknown versions instead of panicking.

## Message Queues and Async Integration

Queue consumers inherit at-least-once delivery. Handlers must be idempotent and
must not assume ordering across partitions unless the broker contract guarantees
it.

```rust
pub async fn handle_delivery(
    message: QueueMessageDto,
) -> Result<(), HandlerError> {
    let command = AssignDriverCommand::try_from(message.payload)?;
    if self.processed.exists(&command.idempotency_key).await? {
        return Ok(());
    }
    self.use_case.execute(command).await?;
    self.processed.record(command.idempotency_key).await?;
    Ok(())
}
```

Persist idempotency keys in the same store as side effects when possible. Align
with [`persistence-events.md`](/docs/kamae-rs/references/persistence-events/) for outbox publication.

## Resilience at the Adapter Layer

Circuit breakers, timeouts, retries, and rate limits belong in infrastructure
adapters — not in domain transitions or use-case business rules.

| Control | Where | Domain impact |
| --- | --- | --- |
| Timeout | gRPC/HTTP client builder | Map to typed `ClientError::Timeout` |
| Retry with backoff | adapter calling external API | Retry only idempotent reads or explicitly keyed writes |
| Circuit breaker | tower / client middleware | Surface `ClientError::Unavailable` to use case |
| Rate limit | gateway or outbound client | Map to `ClientError::RateLimited`; do not spin in domain code |

```rust
let response = self
    .billing_client
    .charge(request)
    .await
    .map_err(|e| match e {
        BillingClientError::Timeout => AssignDriverError::BillingTimeout,
        BillingClientError::Unavailable => AssignDriverError::BillingUnavailable,
        other => AssignDriverError::Billing(other),
    })?;
```

Use cases decide whether a failure is retryable or compensating; adapters
execute the policy.

## Correlation Across Services

Propagate `correlation_id`, `trace_id`, and tenant context on outbound calls and
queue messages. Set them on `tracing` spans at the ingress adapter and inject
into metadata headers or message attributes.

Do not treat distributed traces as domain audit logs. Persist business events
through the outbox when durability is required (see
[`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/)).

## Contract Testing

When two services share protobuf or JSON schemas:

- Check generated Rust types into CI or regenerate in a dedicated job.
- Run consumer-driven contract tests or breaking-change detection on `.proto`
  files before release.
- Keep fixture messages for each supported `schema_version` in tests.

## Detection Hints

When `Cargo.toml` includes `tonic`, `prost`, `lapin`, `rdkafka`, `aws-sdk-sqs`,
or similar clients, load this guide together with
[`boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/) and
[`stream-continuous-queries.md`](/docs/kamae-rs/references/stream-continuous-queries/) for consumers
and projections.
