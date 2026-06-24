---
title: "Streams and Continuous Queries Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/stream-continuous-queries.md`](/docs/kamae-rs/../../kamae-rs/references/stream-continuous-queries/).

## 13.1 Are change feeds modeled as Stream ports? - Medium

Flag hand-rolled `loop { sleep; query }` workers when a typed
`Stream<Item = Result<_, _>>` port would clarify backpressure, cancellation, and
test doubles.

## 13.2 Do subscriptions start from a durable cursor? - High

Flag in-memory-only broadcast or subscriptions that cannot resume after restart
without reprocessing or skipping events.

## 13.3 Are projection handlers idempotent? - High

Flag continuous-query or event handlers that apply side effects without
deduplicating on event ID, `(aggregate_id, sequence)`, or an equivalent
idempotency key.

## 13.4 Is backpressure handled? - Medium

Flag unbounded buffers between pollers and handlers, or streams that keep
reading after the consumer dropped.

## 13.5 Do read-side streams mutate write-model aggregates? - High

Flag projections that call aggregate transition methods or persist authoritative
state outside the command path.

## 13.6 Are unknown event versions handled explicitly? - Medium

Cross-check [`../../kamae-rs/references/service-boundaries.md`](/docs/kamae-rs/../../kamae-rs/references/service-boundaries/). Flag handlers that panic or silently ignore unsupported event types when events are stored asynchronously.
