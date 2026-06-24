---
title: "Rust Domain Macros and Boilerplate Reduction"
sidebar:
  order: 10
---

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./boundary-defense.md -->

## Prefer Types First, Macros Second

Macros should encode repeated, stable patterns — not hide missing domain
modeling. Before adding a derive or proc-macro crate, confirm the pattern
appears in at least three similar types and that hand-written code would drift.

Good macro targets:

- newtype `TryFrom`/`FromStr` with shared validation messages
- domain event structs needing `Clone`, `Debug`, and stable `name()`/`version()`
- ID newtypes wrapping a single validated string or integer

Poor macro targets:

- one-off business rules
- validation that differs per type
- hiding `unwrap` or panics inside generated code

## Use Existing Crates Before Internal Proc-Macros

| Need | Prefer | Notes |
| --- | --- | --- |
| Validated newtypes | [`nutype`](/docs/kamae-rs/references/crate-guides/nutype/), `garde`, `validator` | Keeps invariants visible in source |
| Simple derives | `derive_more`, standard `derive` | Transparent newtypes, display helpers |
| Repeated event metadata | internal `#[derive(DomainEvent)]` | Only when events share identical shape |

Introduce an internal proc-macro crate (for example `my_app_domain_macros`) when
the team owns the pattern and external crates cannot express the contract.

## Recommended Internal Macro Patterns

### `#[derive(NewtypeDomainId)]`

Generate validated constructors and conversions for opaque ID newtypes:

```rust
#[derive(NewtypeDomainId)]
#[newtype(validate = "trim_non_empty")]
pub struct RequestId(String);

// Expands to: new/try_new, as_str, TryFrom<String>, Display, Eq, Hash
```

Keep validation functions small and unit-tested in the macro crate. Do not
generate `Deserialize` on domain IDs unless the project explicitly accepts
serde-at-the-leaf with validation (see [`boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/)).

### `#[derive(DomainEvent)]`

Standardize event records used in outbox and projection pipelines:

```rust
#[derive(DomainEvent)]
#[event(name = "taxi.driver_assigned", version = 1)]
pub struct DriverAssigned {
    pub request_id: RequestId,
    pub driver_id: DriverId,
    pub occurred_at: OccurredAt,
}
```

Generated code should provide:

- `Clone`, `Debug` with redaction-friendly field visibility
- `fn name(&self) -> &'static str` and `fn version(&self) -> u32`
- optional `TryFrom<StoredEventEnvelope>` for projection handlers

Do not derive unrestricted `Serialize`/`Deserialize` on event payloads unless
the schema evolution story is documented (see
[`service-boundaries.md`](/docs/kamae-rs/references/service-boundaries/)).

## Declarative Macros for Repetitive Match Arms

When proc-macros are heavy, a `macro_rules!` helper can reduce duplication in
projection or error mapping code:

```rust
macro_rules! domain_event_match {
    ($event:expr, {
        $($name:literal => $handler:expr,)*
        _ => $fallback:expr,
    }) => {{
        match $event.name() {
            $($name => $handler,)*
            other => $fallback(other),
        }
    }};
}
```

Keep declarative macros local to the crate that owns the events. Avoid exporting
macro DSLs across service boundaries.

## Review Expectations for Generated Code

- Generated impls must not add `Default`, public fields, or silent coercion that
  bypasses invariants.
- `Debug` on events and IDs must remain safe for logs (see
  [`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/)).
- Document macro expansion in rustdoc on the type: which traits are derived and
  which validation runs at construction.

## When Not to Macro

- Cross-field validation (amount + currency, date range rules)
- State-machine transitions — keep these as explicit methods on state structs
- Infrastructure mapping (`FromRow`, gRPC messages) — use explicit DTO `TryFrom`
  so boundary rules stay readable in review
