---
title: "Service Boundaries Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/service-boundaries.md`](/docs/kamae-rs/../../kamae-rs/references/service-boundaries/).

## 15.1 Are wire messages converted through DTO -> domain? - High

Flag handlers that pass protobuf, JSON, or queue payloads directly into domain
logic without `TryFrom` validation.

## 15.2 Do generated client types leak into domain crates? - Medium

Flag domain or use-case modules importing `tonic`/`prost` generated types
instead of mapping at the adapter edge.

## 15.3 Is protobuf/JSON schema evolution explicit? - High

Flag breaking field renames/removals, missing `schema_version`, or consumers that
panic on unknown event types or versions.

## 15.4 Are queue handlers idempotent? - High

Cross-check [`persistence-events.md`](/docs/kamae-rs/references/persistence-events/). Flag consumers
that apply side effects without idempotency keys or dedupe storage.

## 15.5 Are retries, breakers, and rate limits in adapters? - Medium

Flag retry loops, circuit-breaker state, or rate limiting inside domain
transitions or use-case business rules.

## 15.6 Is correlation context propagated on outbound calls? - Low

Flag cross-service calls or published messages that omit `correlation_id` or
trace context when the ingress request already carried it.
