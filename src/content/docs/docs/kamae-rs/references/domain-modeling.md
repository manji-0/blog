---
title: "Rust Domain Modeling"
sidebar:
  order: 10
---

## Represent Domain Concepts Explicitly

Use named structs, enums, and newtypes instead of primitive strings and numbers for semantically distinct values.

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RequestId(String);

impl RequestId {
    pub fn new(value: String) -> Result<Self, RequestIdError> {
        if value.trim().is_empty() {
            return Err(RequestIdError::Empty);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

Keep newtype fields private unless the value is deliberately transparent and has no invariant.

Model time, money, and units as explicit concepts. Prefer `OccurredAt`,
`ServiceDate`, `Money`, `CurrencyCode`, `DistanceMeters`, or
`DurationSeconds` over bare primitives whose unit, timezone, precision, or
rounding behavior is implicit. Avoid `f32`/`f64` for money.

## Prefer Enums for Variants and State

Use Rust enums for closed sets of states or domain alternatives. Prefer struct-like variants when each state carries different data.

```rust
pub enum TaxiRequest {
    Waiting(WaitingRequest),
    EnRoute(EnRouteRequest),
    InTrip(InTripRequest),
    Completed(CompletedRequest),
    Cancelled(CancelledRequest),
}
```

Use separate state structs when transitions should accept only a specific source state.

## Define Aggregate Boundaries

An aggregate owns the invariants that must change atomically. Put transition
methods on the state or aggregate that owns the rule, and reference other
aggregates by ID unless a use case has loaded a stable snapshot for a decision.

For transaction scope, versioning, and cross-aggregate coordination, see
[`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/).

Avoid "god" aggregates that collect unrelated entities only to make access
convenient. Also avoid transitions that mutate two aggregate roots in memory and
then rely on callers to persist both correctly; use a use case plus explicit
domain events for cross-aggregate coordination.

## Keep Construction Honest

Use `new`, `try_new`, `TryFrom`, or `FromStr` to enforce invariants at construction time. Do not expose public fields that let callers bypass those invariants.

Accept direct struct literals only for simple data with no invariants or for test-only builders kept in test modules.

## Derive Traits Deliberately

Do not derive `Default` for invariant-bearing domain types unless there is a
real domain default. "Empty" IDs, zero money, or the first enum variant are
usually invalid or misleading defaults.

Derive `Clone` narrowly. It is usually fine for small immutable value objects
and DTOs, but broad `Clone` on aggregates and entities can hide ownership
mistakes or make stale copies easy to persist.

Do not derive unrestricted `Serialize` or `Deserialize` on domain types that
have private invariants. Use DTOs, row structs, or serde `try_from` on leaf
value objects so deserialization still runs validation.

## Keep Domain Models Separate

Avoid using the same struct for API JSON, DB rows, and domain entities. External shapes often contain optional or denormalized fields that should not leak into the domain model.

Use this flow:

```text
API/DB/env raw data -> DTO/row struct -> TryFrom -> domain type
```

See [`boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/).

## Organize by Concept

Prefer one domain concept per file or module: type, constructors, methods, and tests together. Avoid catch-all `types.rs` or `models.rs` modules that split types from behavior.

## Typestate with Phantom Types

When illegal states must be impossible at compile time, encode lifecycle phase as a type parameter with zero-sized phantom markers.

```rust
use std::marker::PhantomData;

pub struct Draft;
pub struct Submitted;
pub struct Approved;

pub struct ExpenseReport<State> {
    report_id: ReportId,
    amount: Money,
    _state: PhantomData<State>,
}

impl ExpenseReport<Draft> {
    pub fn submit(self) -> Result<ExpenseReport<Submitted>, SubmitError> {
        if self.amount.is_zero() {
            return Err(SubmitError::EmptyAmount);
        }
        Ok(ExpenseReport {
            report_id: self.report_id,
            amount: self.amount,
            _state: PhantomData,
        })
    }
}

impl ExpenseReport<Submitted> {
    pub fn approve(self, approver: ApproverId) -> ExpenseReport<Approved> {
        ExpenseReport {
            report_id: self.report_id,
            amount: self.amount,
            _state: PhantomData,
        }
    }
}
```

Use typestate when:

- The set of available operations changes sharply by phase.
- Mixing states in one struct would require many `Option` fields or runtime checks.

Prefer separate state structs (see [`state-transitions.md`](/docs/kamae-rs/references/state-transitions/)) when each state carries different fields and transitions are the main API. Typestate and state structs compose: `ExpenseReport<Submitted>` can wrap a `SubmittedReport` struct.

## `#[non_exhaustive]` on Domain Enums

`#[non_exhaustive]` tells downstream crates they must include a wildcard arm when matching your enum. Use it for:

- Public library crates that publish domain enums as extension points.
- Integration-facing event or status enums where new variants ship without a major breaking change for matchers in other repos.

Avoid `#[non_exhaustive]` when:

- The enum is internal to one service crate and all `match` sites are in the same workspace.
- Exhaustive matching is a safety property (e.g. every `TaxiRequest` variant must be handled in billing).

Inside a single domain crate, prefer exhaustive `match` without `non_exhaustive` so the compiler forces updates when you add a variant.

## Money and Quantities

Do not use `f32`/`f64` for money. Prefer `rust_decimal::Decimal` or an integer minor-unit representation wrapped in a newtype.

```rust
use rust_decimal::Decimal;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Money {
    amount_minor: i64,
    currency: CurrencyCode,
}

impl Money {
    pub fn from_minor(amount_minor: i64, currency: CurrencyCode) -> Result<Self, MoneyError> {
        if amount_minor < 0 {
            return Err(MoneyError::Negative);
        }
        Ok(Self { amount_minor, currency })
    }

    pub fn add(self, other: Money) -> Result<Money, MoneyError> {
        if self.currency != other.currency {
            return Err(MoneyError::CurrencyMismatch);
        }
        Ok(Money {
            amount_minor: self
                .amount_minor
                .checked_add(other.amount_minor)
                .ok_or(MoneyError::Overflow)?,
            currency: self.currency,
        })
    }
}
```

For non-money quantities (distance, weight), use unit-bearing newtypes (`DistanceMeters`, `WeightGrams`) so addition across units does not compile.

## `From` and `TryFrom` Between Newtypes

Design conversion along dependency direction: wire/DB types convert into domain types, not the reverse in domain modules.

| Conversion | Prefer |
| --- | --- |
| Same meaning, validated target | `TryFrom<Source> for Target` |
| Lossless, always valid | `From<Source> for Target` |
| Domain to wire for responses | `From<Domain> for ResponseDto` in adapter or `impl` next to DTO |
| Domain to DB row | `From<&Domain> for Row` in persistence adapter |

```rust
impl TryFrom<String> for PassengerId {
    type Error = PassengerIdError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        PassengerId::new(value)
    }
}

impl From<RequestId> for String {
    fn from(id: RequestId) -> Self {
        id.into_inner()
    }
}
```

Do not implement `TryFrom<Domain> for Dto` in the domain crate if it creates a dependency on transport types. Keep outbound mapping in the adapter layer.

## Manual `Eq`, `Hash`, and `Ord`

Derive `Eq`, `Hash`, and `Ord` when all fields support them and semantics match derived behavior.

Implement manually when:

- A struct contains `f64` but you need equality on a rounded or discrete view.
- Ordering is domain-specific (e.g. `Priority` is not lexicographic on its fields).
- You must ignore derived/cache fields in equality.

```rust
#[derive(Clone, Debug)]
pub struct FareEstimate {
    distance_m: DistanceMeters,
    duration_s: DurationSeconds,
    confidence: f64, // derived score, not part of identity
}

impl PartialEq for FareEstimate {
    fn eq(&self, other: &Self) -> bool {
        self.distance_m == other.distance_m && self.duration_s == other.duration_s
    }
}

impl Eq for FareEstimate {}

impl Hash for FareEstimate {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.distance_m.hash(state);
        self.duration_s.hash(state);
    }
}
```

Do not derive `Hash`/`Eq` on types that contain secrets or PII you might accidentally use as map keys in logs; see [`pii-protection.md`](/docs/kamae-rs/references/pii-protection/).

## Test Builders

Keep production constructors strict. In `#[cfg(test)]` modules or `tests/support`, use builders with sensible defaults and fluent overrides.

```rust
#[cfg(test)]
mod support {
    use super::*;

    #[derive(Default)]
    pub struct WaitingRequestBuilder {
        request_id: Option<RequestId>,
        passenger_id: Option<PassengerId>,
    }

    impl WaitingRequestBuilder {
        pub fn with_passenger(mut self, passenger_id: PassengerId) -> Self {
            self.passenger_id = Some(passenger_id);
            self
        }

        pub fn build(self) -> WaitingRequest {
            WaitingRequest::new(
                self.request_id
                    .unwrap_or_else(|| RequestId::new("req-test-1".into()).unwrap()),
                self.passenger_id
                    .unwrap_or_else(|| PassengerId::new("pax-test-1".into()).unwrap()),
            )
            .unwrap()
        }
    }
}

#[test]
fn assign_driver_moves_to_en_route() {
    let waiting = WaitingRequestBuilder::default()
        .with_passenger(PassengerId::new("pax-42".into()).unwrap())
        .build();
    let en_route = waiting.assign_driver(DriverId::new("drv-9".into()).unwrap());
    assert_eq!(en_route.driver_id().as_str(), "drv-9");
}
```

Builders are for tests and fixtures only. Do not expose `Default` on domain entities just to simplify tests.

## Common Crate Combinations

| Stack | Modeling pattern |
| --- | --- |
| `nutype` + `thiserror` | Validated newtypes with generated guards; see [`crate-guides/nutype.md`](/docs/kamae-rs/references/crate-guides/nutype/) |
| `rust_decimal` + newtypes | `Money`, `TaxRate` with checked arithmetic |
| `serde(try_from)` + newtypes | Leaf value objects at JSON boundary; see [`boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/) |
| `proptest` + builders | Generate valid domain instances via `Arbitrary` on primitives then `try_new`; see [`property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/) |

## Review Signals

Flag when:

- `String` or `i64` carries business meaning without a newtype.
- `Default` on IDs, money, or state enums produces invalid sentinels.
- `f64` appears in money or billing fields.
- Domain structs derive `Deserialize` or `FromRow` without a documented exception.
- Tests construct domain objects with public field literals that bypass invariants.
