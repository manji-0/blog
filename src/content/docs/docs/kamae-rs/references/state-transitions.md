---
title: "Rust State Transitions"
sidebar:
  order: 10
---

## Constrain Transitions by Source Type

When only one state may transition, accept that specific state instead of a wide enum.

```rust
pub struct WaitingRequest {
    request_id: RequestId,
    passenger_id: PassengerId,
}

pub struct EnRouteRequest {
    request_id: RequestId,
    passenger_id: PassengerId,
    driver_id: DriverId,
}

impl WaitingRequest {
    pub fn assign_driver(self, driver_id: DriverId) -> EnRouteRequest {
        EnRouteRequest {
            request_id: self.request_id,
            passenger_id: self.passenger_id,
            driver_id,
        }
    }
}
```

This makes invalid source states fail at compile time.

Keep a transition infallible only when every precondition is encoded in the
input types. If any rule depends on data not represented by the source state or
argument types, return a domain error:

```rust
pub enum DomainError {
    DriverCannotServeAccessibilityRequest,
}

impl WaitingRequest {
    pub fn assign_driver(
        self,
        driver: DriverAssignment,
    ) -> Result<Transition<EnRouteRequest, TaxiRequestEvent>, DomainError> {
        if self.requires_accessible_vehicle && !driver.accepts_accessibility_requests {
            return Err(DomainError::DriverCannotServeAccessibilityRequest);
        }

        Ok(Transition {
            state: EnRouteRequest {
                request_id: self.request_id,
                passenger_id: self.passenger_id,
                driver_id: driver.driver_id,
            },
            events: vec![TaxiRequestEvent::DriverAssigned {
                request_id: self.request_id,
                driver_id: driver.driver_id,
                occurred_at: OccurredAt::now(),
            }],
        })
    }
}
```

Do not hide this behind `panic!`, `unwrap()`, or comments such as "caller must
check first". If the compiler cannot enforce the precondition, the transition
signature should show that failure is possible.

## Why `self` by Value (Ownership Consumption)

Taking `self` instead of `&mut self` for state-changing transitions has concrete benefits:

1. **The old state cannot be reused.** After `waiting.assign_driver(driver)`, `waiting` is moved and will not compile if referenced again. This prevents double-assignment bugs without runtime flags.
2. **Transitions read as state replacement.** The returned struct is the new truth; there is no hidden mutation on a shared handle.
3. **Easier persistence mapping.** The use case receives an owned `EnRouteRequest` ready to pass to `save_assigned` without cloning out of a mutable aggregate.
4. **Clearer event pairing.** `Transition { state, events }` is built once from consumed inputs.

Use `&mut self` only when:

- The transition is a minor field update within the same state (e.g. refresh ETA).
- You are batching in-memory edits before a single save and the type system already prevents illegal state (rare).

Prefer `self` for lifecycle moves (`Waiting` -> `EnRoute` -> `InTrip`).

## Use Enums at Boundaries

Use an aggregate enum when callers need to store, load, or branch over all possible states.

```rust
pub enum TaxiRequest {
    Waiting(WaitingRequest),
    EnRoute(EnRouteRequest),
    InTrip(InTripRequest),
    Completed(CompletedRequest),
    Cancelled(CancelledRequest),
}
```

Use exhaustive `match` arms. Avoid `_` in domain matches unless the fallback is truly invariant to every future variant.

Keep aggregate boundaries explicit: load and save the request aggregate as a
whole, and keep cross-aggregate references as IDs or snapshots instead of
borrowing mutable state from another aggregate. A transition should protect the
invariants owned by its aggregate and call out to a use case or policy when it
needs facts owned elsewhere.

## Multiple Transition Targets

When one source state can move to several targets, return an enum of outcomes instead of a single struct type.

```rust
pub enum WaitingExit {
    EnRoute(EnRouteRequest),
    Cancelled(CancelledRequest),
}

impl WaitingRequest {
    pub fn cancel(self, reason: CancellationReason) -> Transition<CancelledRequest, TaxiRequestEvent> {
        Transition {
            state: CancelledRequest {
                request_id: self.request_id,
                passenger_id: self.passenger_id,
                reason,
            },
            events: vec![/* ... */],
        }
    }
}

// Dispatcher at the use-case boundary when the command could branch:
pub enum WaitingTransition {
    Assigned(Transition<EnRouteRequest, TaxiRequestEvent>),
    Cancelled(Transition<CancelledRequest, TaxiRequestEvent>),
}
```

Alternatively, keep separate methods (`assign_driver`, `cancel`) each consuming `WaitingRequest`; the compile-time guarantee is the same because only one can be called per value.

## Return Transition Outcomes Explicitly

When a transition emits events, return an outcome struct rather than mutating hidden state.

```rust
pub struct Transition<TState, TEvent> {
    pub state: TState,
    pub events: Vec<TEvent>,
}
```

`TransitionOutcome<S, E>` is the same idea: a type alias or tuple `(S, Vec<E>)` is fine when the team prefers minimal types.

```rust
pub type TransitionOutcome<S, E> = (S, Vec<E>);

impl WaitingRequest {
    pub fn assign_driver(
        self,
        driver_id: DriverId,
        clock: &dyn Clock,
    ) -> Result<TransitionOutcome<EnRouteRequest, TaxiRequestEvent>, DomainError> {
        let occurred_at = clock.now();
        let state = EnRouteRequest { /* ... */ };
        let events = vec![TaxiRequestEvent::DriverAssigned { /* ... */, occurred_at }];
        Ok((state, events))
    }
}
```

The use case destructures, persists via [`persistence-events.md`](/docs/kamae-rs/references/persistence-events/), and publishes events. Do not push events into a global buffer inside the transition method.

Prefer taking `self` by value for state-consuming transitions. Borrow only when the original state must remain available.

## Testability: Time and Randomness

Transitions that stamp `occurred_at` or draw lottery outcomes should not call `SystemTime::now()` or `thread_rng()` directly inside domain code when tests need determinism.

```rust
pub trait Clock {
    fn now(&self) -> OccurredAt;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> OccurredAt {
        OccurredAt::from_system_now()
    }
}

#[cfg(test)]
pub struct FixedClock(OccurredAt);

impl Clock for FixedClock {
    fn now(&self) -> OccurredAt {
        self.0
    }
}
```

Inject `&dyn Clock` or a generic `C: Clock` into transition methods or a small domain service. For random assignment, inject `&mut dyn RngCore` or a port `fn draw_driver(&mut self, candidates: &[DriverId]) -> Option<DriverId>`.

Tests pass `FixedClock` and a seeded RNG so event payloads and ordering are assertable.

## Loading and Dispatching

After load, match on the aggregate enum and delegate to state-specific logic:

```rust
pub fn assign_driver(
    request: TaxiRequest,
    driver_id: DriverId,
) -> Result<Transition<TaxiRequest, TaxiRequestEvent>, AssignDriverError> {
    match request {
        TaxiRequest::Waiting(waiting) => {
            let transition = waiting.assign_driver(driver_id)?;
            Ok(Transition {
                state: TaxiRequest::EnRoute(transition.state),
                events: transition.events,
            })
        }
        _ => Err(AssignDriverError::InvalidState),
    }
}
```

Invalid source states for a command become typed errors at the boundary match, not panics.

## Relation to Typestate and Aggregates

- **State structs + `self` consumption**: best default for server domains with clear lifecycle.
- **Typestate phantom markers**: when the same data shape exists across phases but operations differ; see [`domain-modeling.md`](/docs/kamae-rs/references/domain-modeling/#typestate-with-phantom-types).
- **Aggregate transactions**: use case loads versioned aggregate, runs pure transition, saves atomically; see [`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/).

## Review Signals

Flag when:

- Transition methods take `&mut TaxiRequest` and set a `status: String` field.
- `panic!` or `unwrap` encodes preconditions the type system could enforce.
- Events are appended to a global or `static` buffer inside transition code.
- `OccurredAt::now()` is hard-coded in transitions without a test seam.
- The same source state value is used for two transitions without move semantics.
