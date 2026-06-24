---
title: "State Transitions Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/state-transitions.md`](/docs/kamae-rs/../../kamae-rs/references/state-transitions/).

## 2.1 Do transition functions constrain source state by type? - Medium

Flag functions that accept a wide aggregate enum and then runtime-check the state when a specific state type could be accepted.

Do not flag aggregate enums at API, repository, serialization, or dispatch boundaries when they immediately delegate into typed state handlers.

## 2.2 Are domain matches exhaustive and future-proof? - Medium

Flag `match` expressions over domain enums that use `_` to hide future variants when each variant should be considered explicitly.

## 2.3 Are transitions pure unless side effects are explicit? - Medium

Flag state transitions that perform persistence, logging, or message publishing inside the transition method. Suggest returning state plus events and letting the use case coordinate effects.

## 2.4 Is ownership used to prevent stale states? - Low

Suggest consuming `self` for transitions that should make the source state unusable afterward.

## 2.5 Do mutators preserve invariants? - High

Flag setters or partial update methods that can violate cross-field rules, lifecycle restrictions, totals, timestamps, ownership, or tenant scope.

## 2.6 Are authorization and tenant checks enforced before transitions? - High

Flag use cases that transition state before proving the actor, tenant, account, or capability is allowed to do so.

## 2.7 Are concurrent transitions protected? - High

Flag lifecycle or balance changes that can race without optimistic locking, version checks, unique constraints, idempotency keys, or serializable transactions.

Cross-check [`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/) for versioned saves and transaction-boundary expectations.
