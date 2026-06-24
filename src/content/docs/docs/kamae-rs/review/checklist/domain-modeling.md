---
title: "Domain Modeling Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/domain-modeling.md`](/docs/kamae-rs/../../kamae-rs/references/domain-modeling/).

## 1.1 Are semantic primitives represented as newtypes? - High

Flag bare `String`, `&str`, integer, decimal, or UUID types used directly for distinct domain concepts such as user IDs, order IDs, email addresses, money amounts, quantities, or external references.

Suggest private-field newtypes with validating constructors.

Do not flag primitives used as local temporaries, private adapter fields, test literals, serialization-only DTO fields, or values that have no domain-specific invariant beyond their Rust type.

## 1.2 Can callers bypass invariants? - High

Flag public fields or public tuple fields on domain types that have invariants. Constructors must be the authoritative path.

Flag mutator methods that update only one field of a multi-field invariant, skip revalidation, or allow invalid intermediate states to escape.

Do not flag direct struct construction inside the canonical constructor, private test helpers, or DTO/row structs that are converted through validating domain constructors before use.

## 1.3 Are states modeled explicitly? - Medium

Flag a single struct with `status: String`/`enum` plus many optional fields when state-specific structs or enum variants would make required fields explicit.

## 1.4 Are DTOs, DB rows, and domain entities separated? - Medium

Flag domain entities carrying `Deserialize`, `FromRow`, or ORM derives when that lets external data bypass validation or couples domain invariants to storage shape.

Do not flag `Serialize` on intentional read models, projections, API response DTOs, or audited export types that cannot be deserialized back into domain state.

## 1.5 Is domain code organized by concept? - Low

Flag catch-all `types.rs`, `models.rs`, or `domain.rs` modules that aggregate unrelated concepts and separate behavior from data.

Do not flag cohesive modules with a narrow bounded-context purpose, generated schema modules, or compatibility shims kept intentionally thin.

## 1.6 Are money, time, and units explicit? - Medium

Flag amounts, quantities, durations, rates, and timestamps when code mixes units, currencies, time zones, or inclusive/exclusive ranges without types or named constructors.
