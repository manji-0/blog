---
title: "Domain Macros Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/domain-macros.md`](/docs/kamae-rs/../../kamae-rs/references/domain-macros/).

## 14.1 Do macros hide domain invariants? - High

Flag proc-macros or derives that add public fields, `Default`, silent coercion,
or validation that differs from hand-written domain rules.

## 14.2 Is generated Debug/Display safe for logs? - High

Cross-check [`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/). Flag generated
`Debug`/`Display` on IDs, events, or payloads that could expose PII or secrets.

## 14.3 Are macros justified by repetition? - Low

Flag new internal proc-macro crates for one or two types when `nutype`,
`TryFrom`, or explicit impls would be clearer in review.

## 14.4 Do event macros preserve version metadata? - Medium

Flag domain events without stable `name`/`version` (or equivalent) when they are
persisted, queued, or consumed across deploys.

## 14.5 Are Deserialize/FromRow derives avoided on macro-generated domain types? - Medium

Cross-check [`boundary.md`](/docs/kamae-rs/references/boundary/). Flag macro-generated serde or ORM
derives on invariant-bearing domain types unless the project documents an
explicit leaf-validation convention.
