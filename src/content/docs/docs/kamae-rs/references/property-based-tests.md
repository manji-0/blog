---
title: "Rust Property-Based Tests"
sidebar:
  order: 10
---

<!-- constrained-by ./test-data.md -->
<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->

## When Property Tests Earn Their Cost

Use property-based tests when an invariant should hold across many inputs and
example tables would be incomplete or tedious to maintain.

Good targets:

- value-object constructors and validation rules
- parse/format and DTO `TryFrom` round trips
- state-machine transition laws and rejection rules
- money, units, and timestamp boundary behavior
- idempotent handlers and projection replay
- redaction and safe `Display`/`Debug` contracts

Prefer ordinary unit tests when behavior is a small closed set of cases, when
the property is trivially true by construction, or when failure would not shrink
to a useful minimal example.

## Prefer `proptest` for Domain Crates

`proptest` is the default recommendation for server-side domain crates because
shrinking, regression files, and composable strategies fit invariant testing
well. Use `quickcheck` only when the project already standardizes on it.

Add `proptest` as a `[dev-dependency]`. Keep generators in `#[cfg(test)]`
modules or a `tests/support` module — not in production domain code.

```toml
[dev-dependencies]
proptest = "1"
```

## Generate Through Public Constructors

Generators must produce values the production path can construct. If a strategy
builds raw struct literals or sets private fields, the test may pass while real
callers still fail.

```rust
use proptest::prelude::*;

fn valid_request_id() -> impl Strategy<Value = RequestId> {
    "[1-9][0-9]{0,15}".prop_map(|s| RequestId::new(s).expect("strategy produces valid ids"))
}

proptest! {
    #[test]
    fn request_id_rejects_empty(input in "\\PC*") {
        prop_assume!(input.trim().is_empty());
        prop_assert!(RequestId::new(input).is_err());
    }

    #[test]
    fn request_id_accepts_non_empty(input in "[1-9][0-9]{0,15}") {
        prop_assert!(RequestId::new(input).is_ok());
    }
}
```

When invalid inputs matter, generate raw strings or DTOs and assert
`TryFrom`/constructor rejection — do not construct domain types around invalid
data.

## Encode Properties Explicitly

Name the law in the test and keep each property focused.

| Property kind | Example law |
| --- | --- |
| Round trip | `TryFrom::<Dto>::try_from(x.clone())?` then serialize equals original shape |
| Idempotence | applying the same command twice has no further effect |
| Invariant preservation | valid `Money` plus valid `Money` never produces negative result |
| Rejection | illegal transition always returns the same error variant |
| Projection replay | folding events in order equals loading snapshot plus tail |

```rust
proptest! {
    #[test]
    fn money_addition_is_commutative(a in money_strategy(), b in money_strategy()) {
        prop_assume!(a.currency() == b.currency());
        prop_assert_eq!(a.clone() + b.clone(), b + a);
    }
}
```

Use `prop_assume!` to discard inputs outside the precondition instead of
asserting vacuous success.

## Model State Machines as Strategies

For lifecycle rules, build strategies that only produce reachable states, then
assert transition outcomes.

```rust
fn waiting_request() -> impl Strategy<Value = WaitingRequest> {
    (valid_request_id(), valid_passenger_id())
        .prop_map(|(id, passenger)| WaitingRequest::new(id, passenger))
}

proptest! {
    #[test]
    fn assign_driver_advances_state(
        waiting in waiting_request(),
        driver in valid_driver_id(),
    ) {
        let outcome = waiting.assign_driver(driver)?;
        prop_assert!(matches!(outcome.state, EnRouteRequest { .. }));
    }
}
```

For illegal transitions, generate a source state and an action known to be
invalid, then assert a specific error variant — not `is_err()` alone.

## Keep Shrinking Domain-Safe

Shrinking should not produce values that bypass constructors. When a failure
shrinks to an empty string, zero money, or an impossible enum variant, fix the
strategy or add `prop_assume!` guards.

Store reproducible failures with `proptest-regressions` when a bug required a
non-obvious input:

```toml
[dev-dependencies]
proptest = "1"
proptest-regressions = "0.2"
```

```rust
proptest_regressions::proptest_regressions! {
    regressions = "path/to/regressions.txt"
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]
    #[test]
    fn regression_example(input in strategy()) {
        // ...
    }
}
```

Commit regression files when they encode real fixed bugs.

## Do Not Property-Test Non-Deterministic or I/O Boundaries by Default

Property tests belong on pure domain functions and deterministic adapters with
injected clocks or fixed fixtures.

Avoid by default:

- live database or network calls inside `proptest!`
- wall-clock time without a seeded clock strategy
- logging or metrics side effects as the property under test

Test DTO conversion, redaction, and error mapping with generated payloads.
Test repositories with fakes or in-memory ports, not uncontrolled I/O.

## Integrate with Existing Test Layers

| Layer | Property test role |
| --- | --- |
| Value object | constructor acceptance/rejection, round trips |
| Domain transition | laws, illegal transition errors |
| Use case | idempotency with fake ports, not real infra |
| Boundary DTO | malformed/generated payloads map to typed errors |
| Projection | replay order and checkpoint idempotency |

Keep example-based tests for readable scenarios and compile-fail tests for type
safety promises (see [`test-data.md`](/docs/kamae-rs/references/test-data/)).

## CI and Runtime Budget

Property tests multiply case counts. Defaults are usually enough for domain crates;
raise cases locally when debugging.

- Keep `ProptestConfig::with_cases` close to default in CI unless the crate is
  small and fast.
- Mark especially slow properties with `#[ignore]` only when documented and run in
  a separate CI job.
- Do not disable shrinking in CI to save time unless the team accepts harder
  reproduction.

## Detection Hints

When `Cargo.toml` includes `proptest` or `quickcheck`, load this guide together
with [`test-data.md`](/docs/kamae-rs/references/test-data/) and the topic guide for the invariant under
test (modeling, state transitions, boundaries, or persistence).
