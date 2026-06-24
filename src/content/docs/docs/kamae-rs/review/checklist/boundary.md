---
title: "Boundary Defense Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/boundary-defense.md`](/docs/kamae-rs/../../kamae-rs/references/boundary-defense/).

## 4.1 Is every external boundary converted through DTO -> domain? - High

Flag HTTP handlers, queue consumers, DB row mappers, file/config/env readers, or CLI parsers that pass raw data directly into domain logic without validated conversion.

Do not flag raw DTO/read-model construction when the value stays in the adapter layer, or direct domain construction inside a validating `TryFrom`/constructor path.

## 4.2 Is serde treated as validation? - High

Flag code that relies on `Deserialize` alone for domain invariants such as non-empty strings, valid IDs, positive amounts, ranges, or cross-field rules.

## 4.3 Are domain entities over-derived for external formats? - Medium

Flag `Deserialize`, `Serialize`, or `FromRow` on domain entities when separate DTOs/rows would protect invariants or redaction.

Do not flag `Serialize` on intentional read models, projections, or response-only DTOs.

## 4.4 Are DTO defaults and unknown fields intentional? - Medium

Flag inbound DTOs using broad `Default`, optional fields, or permissive unknown-field handling when missing or misspelled input could change business meaning. Prefer explicit defaults and `deny_unknown_fields` when compatibility does not require permissiveness.

## 4.5 Are authorization and tenant boundaries checked? - High

Flag handlers or use cases that trust path/body tenant IDs, actor IDs, or ownership claims without comparing them to authenticated context before domain operations.

## 4.6 Is validated leaf deserialization distinguished from aggregate parsing? - Medium

Flag `Deserialize` on aggregates, commands, or multi-field entities when a DTO plus `TryFrom` would enforce cross-field rules. Do not flag `#[serde(try_from = "...")]` on leaf value objects (IDs, email, slugs) when it delegates to the same constructor as normal code.
