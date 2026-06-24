---
title: "Gradual Kamae Adoption"
sidebar:
  order: 10
---

## Default Stance

Apply Kamae to new code paths first. Tighten existing code where you already
touch it for a feature or bugfix. Do not block delivery on a full-domain rewrite.

When legacy conventions conflict, follow the local convention for untouched code
and document the new boundary clearly where old and new meet.

## Recognize Legacy Shapes

Common starting points in Rust server codebases:

- anemic structs with free functions or service modules
- ORM row types used as domain entities
- `String` IDs and status strings instead of newtypes
- `anyhow` or `unwrap` through business logic
- handlers that call SQL or HTTP directly

These are migration sources, not failures. Pick the smallest change that removes
the next likely bug.

## Adoption Ladder

Move one rung at a time. Each step should be reviewable on its own.

| Step | Change | Typical touch points | Risk |
| --- | --- | --- | --- |
| 0. Boundary only | DTO/row -> `TryFrom` for new endpoints or consumers | handlers, message consumers | Low |
| 1. IDs and value objects | `RequestId`, `Money`, `OccurredAt` newtypes | models used by the changed flow | Low |
| 2. Domain errors | `thiserror` enums in new use cases | application layer | Low |
| 3. Typed state | state structs/enums for one important aggregate | domain module for that aggregate | Medium |
| 4. Ports | small repository traits behind the new use case | application + infrastructure | Medium |
| 5. Transactions and versions | atomic save, outbox, optimistic version checks | persistence adapter | Medium–High |

Skip steps only when the codebase already satisfies them.

## Strangler-Fig a Feature, Not the Whole Crate

For a legacy module:

1. Add a new use-case struct for the changed workflow.
2. Keep old entry points calling legacy code until the new path is proven.
3. Route new API versions, flags, or commands to the new use case.
4. Delete the old path after parity tests pass.

```text
legacy handler -> legacy service -> DB
new handler    -> AssignDriver use case -> port -> adapter -> DB
```

Prefer one aggregate or one endpoint per migration slice.

## Step-by-Step Legacy Roadmap

Example: migrating `POST /requests/{id}/assign` in a monolithic axum + sqlx service.

### Phase 1 — Freeze behavior, add tests (week 1)

1. Capture current HTTP contract with integration tests (status codes, JSON shape).
2. Add logging/metrics around the legacy path to measure traffic.
3. Do not change behavior yet.

### Phase 2 — Boundary DTO (week 1–2)

1. Introduce `AssignDriverBody` and `AssignDriverDto` in an `api` module.
2. Replace direct field access in the handler with `AssignDriverCommand::try_from(dto)`.
3. Legacy service still receives strings; validation now lives in `TryFrom`.
4. Ship behind the same route; tests must stay green.

See [`boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/).

### Phase 3 — Newtypes on touched IDs (week 2)

1. Add `RequestId`, `DriverId` newtypes in a `domain` crate or module.
2. Change `TryFrom` to construct newtypes; legacy service accepts `.as_str()` at the seam.
3. Enable extra clippy on the new `domain` module only.

See [`domain-modeling.md`](/docs/kamae-rs/references/domain-modeling/).

### Phase 4 — Use case extraction (week 3)

1. Create `AssignDriverUseCase` with the legacy SQL inlined in a private method.
2. Handler calls `use_case.execute(cmd)` only.
3. Replace `anyhow` in this path with `AssignDriverError` (`thiserror`).

See [`error-handling.md`](/docs/kamae-rs/references/error-handling/).

### Phase 5 — Typed state for one aggregate (week 3–4)

1. Model `WaitingRequest` and `EnRouteRequest`; move assignment logic to `WaitingRequest::assign_driver(self, ...)`.
2. Legacy `status: String` remains in DB; adapter maps rows <-> state structs.
3. Add unit tests on transitions without HTTP.

See [`state-transitions.md`](/docs/kamae-rs/references/state-transitions/).

### Phase 6 — Repository port (week 4–5)

1. Define `RequestResolver` and `RequestStore` traits.
2. Move SQL from use case to `SqlxRequestStore`.
3. Use case depends on traits only; wire in `main`.

See [`persistence-events.md`](/docs/kamae-rs/references/persistence-events/) and [`application-wiring.md`](/docs/kamae-rs/references/application-wiring/).

### Phase 7 — Transactions, version, outbox (week 5–6)

1. Add `version` column and conditional `UPDATE`.
2. Wrap state save + outbox insert in one transaction.
3. Add idempotency key support for retried clients.

See [`aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/).

### Phase 8 — Remove legacy path (week 6+)

1. Confirm feature flag or route traffic is 100% on new path.
2. Delete legacy service function and dead `status` string checks.
3. Run `kamae-rs-review` on the migrated module.

Adjust pacing to team size. Each phase is an independent PR when possible.

## Keep Diffs Reviewable

Practical rules for team rollout:

- Do not mix mechanical refactors with behavior changes in one PR when avoidable.
- Add tests at the new boundary before deleting the old path.
- Introduce newtypes and DTO conversion on touched fields only; widen later.
- Enable extra clippy/rustdoc checks on the crate or module you are hardening.
- Leave a short comment or ADR only when old and new semantics differ.

## When to Stop Climbing the Ladder

Not every struct needs a state machine or repository trait. Stay at the current
rung when:

- the code is stable, low-risk, and rarely changes
- the aggregate has no meaningful lifecycle or invariants
- the team cannot yet test persistence or concurrency behavior credibly

Raise the rung when bugs, compliance needs, or concurrency show the current
shape is too weak.

## Agent and Reviewer Expectations

When migrating:

- load [`adoption.md`](/docs/kamae-rs/references/adoption/) for scope decisions
- load the target topic guide for the rung you are implementing
- use `kamae-rs-review` on the changed paths even if surrounding code is still legacy
- call out residual legacy risk explicitly instead of pretending the crate is fully migrated
