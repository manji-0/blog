---
title: "Rust Test Data"
sidebar:
  order: 10
---

<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pii-protection.md -->

> **When to read:** Adding fixtures, factories, property-based tests, transition tests, boundary tests, or persistence retry tests.
> **Related:** [`state-transitions.md`](/docs/kamae-rs/references/state-transitions/), [`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/), [`property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/).

## Build Fixtures Through Public Paths

Fixtures should exercise the same constructors, `TryFrom` adapters, command builders, and transition functions as production code. Avoid raw struct literals that set private fields or bypass invariants unless the test is explicitly about corrupted input, migration compatibility, or deserialization hardening.

```rust
fn request_id(value: &str) -> RequestId {
    RequestId::new(value.to_owned()).expect("fixture request id is valid")
}
```

If a fixture helper uses a hard-coded value, name the invariant in the helper or assertion message.

Share helpers in `tests/support/`, `#[cfg(test)] mod test_support`, or crate-local `mod tests` modules. See [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/#fake-ports-and-test-fixtures) for fake port patterns.

## Cover State-Machine Edges

For important workflows, test:

- Successful transitions.
- Rejected transitions or preconditions.
- Authorization and tenant rejection before transition.
- Exhaustive error mapping at the handler or use-case boundary.
- Domain events emitted with expected event version and aggregate ID.

```rust
#[test]
fn assign_driver_rejects_non_waiting_state() {
    let en_route = en_route_fixture();
    let err = assign_driver(en_route, driver_id("d1"), Utc::now()).unwrap_err();
    assert!(matches!(err, AssignDriverError::InvalidState { .. }));
}
```

When compile-time state safety is a core promise, add compile-fail tests with `trybuild` (see below).

## Test Boundaries and Observability

Boundary tests should include unknown fields, malformed DTOs, missing required fields, defaulted fields, bad discriminator values, DB row rehydration, and validation error mapping.

Observability tests should verify redacted logs, safe error messages, safe metrics labels, and response DTO serialization when sensitive data is present.

For identifier policy, assert the tier rules from [`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/):

- Tier A/B values never appear in logs, traces, errors, or metric labels.
- Tier C/D values appear only as structured fields, never inside log message strings.
- Metric exports use Tier E labels only.

```rust
#[test]
fn api_error_does_not_echo_email() {
    let err = map_domain_error(DomainError::DuplicateEmail { email: email_fixture() });
    let body = err.into_response().into_body();
    let text = body_to_string(body);
    assert!(!text.contains("user@example.com"));
}
```

## Test Persistence and Retry Behavior

When persistence changes, cover DB constraint failures, optimistic-lock conflicts, transaction rollback, duplicate commands, idempotency keys, outbox insertion, and event version compatibility.

Use fake repositories for pure use-case tests and adapter/integration tests for transaction and constraint behavior. Keep domain and use-case tests free of Docker; reserve containers for infrastructure crates (see [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/#test-layers)).

## Test Compile-Time State Safety

For important state-machine guarantees, add compile-fail tests with `trybuild` when the project already uses it or when the invariant is central enough to justify the dependency.

```rust
// tests/compile_fail/assign_from_en_route.rs
fn main() {
    let _ = assign_driver(en_route_fixture(), driver_id("d1"), Utc::now());
}
```

```toml
# tests/compile_fail.rs
[package]
name = "domain-compile-fail"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
trybuild = "1"

[[test]]
name = "compile_fail"
harness = false
```

Use normal unit tests for successful transitions, error mapping, DTO conversion, and PII redaction behavior.

## Use Property-Based Tests for Stable Invariants

Use `proptest` (or the project's property-test library) when an invariant should hold across many inputs. PBT fits Kamae Rust well because transitions are pure functions and invariants are explicit.

```toml
[dev-dependencies]
proptest = "1"
```

Good PBT targets:

- Value-object constructors and validation rules.
- Parser/formatter and DTO `TryFrom` round trips.
- State-machine transition laws (see [`property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/#model-state-machines-as-strategies)).
- Money arithmetic, unit conversions, and timestamp boundary rules.
- Redaction helpers and safe `Display`/`Debug` serialization.

Generated values should still flow through public constructors or boundary adapters. A generator that fills private fields can accidentally test states production code cannot construct.

### State-Transition Laws

For each transition, test properties that should hold for every allowed input:

| Law | Example |
| --- | --- |
| Identity preserved | `result.request_id() == source.request_id()` |
| Discriminator changes correctly | `assign_driver(waiting, ...)` yields `EnRouteRequest` |
| Rejected paths stay unreachable | invalid source states never reach the transition function |
| Event count/shape | exactly one event and aggregate ID matches state |

Compose multi-step laws with chained transitions when the workflow has a small state space. Keep each property focused on one invariant so failures shrink cleanly.

### Round-Trip and Adapter Properties

```rust
proptest! {
    #[test]
    fn waiting_request_round_trip(state in waiting_request_strategy()) {
        let dto = WaitingRequestDto::from(&state);
        let parsed = WaitingRequest::try_from(dto)?;
        prop_assert_eq!(parsed, state);
    }
}
```

Prefer explicit strategies built from public constructors for constrained fields. See [`property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/) for shrinking, regression files, and CI budget.

## Test Layers

Run tests at the lowest layer that can prove the invariant:

| Layer | What to test | I/O |
| --- | --- | --- |
| Domain unit | constructors, transitions, domain errors | None |
| Use case | orchestration with fake ports | None |
| Adapter unit | SQL mapping, DTO `TryFrom`, redaction | Fake or in-memory |
| API/integration | handler -> use case -> adapter | Test DB or container optional |
| Property | input-wide laws | None in the property body |

Before opening a pull request, run the test commands in [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/).
