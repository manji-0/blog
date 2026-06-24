---
title: "Kamae Rust Review"
sidebar:
  order: 3
  label: "Review"
---

Review Rust code against the knowledge base in `../kamae-rs/`. Prioritize bugs, invalid states, data leaks, and missing tests over style.

## Step 0: Load Applicable Rules

Read matching rule files in priority order:

1. `.claude/rules/*.md` and `.codex/rules/*.md` in the project root
2. `~/.claude/rules/*.md` and `~/.codex/rules/*.md`
3. `../../rules/defaults/*.md` relative to this `SKILL.md`

Skip rules unless `applies-to` is `kamae-rs-review` or `*`. A `check-toggle` rule with `enabled: false` disables the named check. A `convention` rule changes review expectations.

## Review Procedure

1. Read [`../kamae-rs/SKILL.md`](/docs/kamae-rs/references/guide/).
2. Read `Cargo.toml` and relevant crate guides under `../kamae-rs/references/crate-guides/`.
3. If available, run `cargo run -p kamae-review-probe -- <changed Rust paths>` from the repository root (or `--manifest-path path/to/kamae-rs/Cargo.toml` in application crates). Treat the output as review leads, not findings.
4. Read the Rust files under review.
5. Choose checklist scope:
   - Full adversarial review: walk every checklist below in order.
   - Small/targeted diff: load only checklist files matched by the routing matrix, plus `tests.md` when behavior changes.
6. Report findings first, ordered by severity. Include `path:line`, risk, principle reference, evidence, and a concrete fix.

Example finding:

```text
High — src/application/assign_driver.rs:42
Principle: error-handling §Avoid Panics in Domain Code
Evidence: `waiting.unwrap()` after `find_waiting` returns `Option`; a missing row panics in production.
Fix: use `.ok_or(AssignDriverError::RequestNotFound { request_id })?` instead.
```

## Document Map

Checklist item numbers (`N.M`) match the checklist order below. Each checklist
links to its topic guide under `../kamae-rs/references/`.

| # | Checklist | Topic guide |
| --- | --- | --- |
| 1 | `domain-modeling.md` | `domain-modeling.md` |
| 2 | `state-transitions.md` | `state-transitions.md` |
| 3 | `error-handling.md` | `error-handling.md` |
| 4 | `boundary.md` | `boundary-defense.md` |
| 5 | `pii-protection.md` | `pii-protection.md` |
| 6 | `logging-metrics.md` | `logging-metrics.md` |
| 7 | `unsafe-boundaries.md` | `unsafe-boundaries.md` |
| 8 | `fmt-lint.md` | `fmt-lint.md` |
| 9 | `rustdoc.md` | `rustdoc.md` |
| 10 | `ci-setup.md` | `ci-setup.md` |
| 11 | `dev-environment.md` | `dev-environment.md` |
| 12 | `persistence-events.md` | `persistence-events.md` |
| 13 | `stream-continuous-queries.md` | `stream-continuous-queries.md` |
| 14 | `domain-macros.md` | `domain-macros.md` |
| 15 | `service-boundaries.md` | `service-boundaries.md` |
| 16 | `property-based-tests.md` | `property-based-tests.md` |
| 17 | `application-wiring.md` | `application-wiring.md` |
| 18 | `aggregate-transactions.md` | `aggregate-transactions.md` |
| 19 | `tests.md` | `test-data.md`, `property-based-tests.md` |

## Review Probe

The optional probe at [`../../crates/review-probe`](/docs/kamae-rs/../../crates/review-probe/) parses Rust files with `syn` and collects patterns that commonly route to Kamae checklists: unsafe boundaries, lint suppressions, panics, serde/row derives, PII terms, persistence/event code, async operational risks, and rustdoc contract gaps.

Use probe output only to choose what to inspect. Do not report a finding until you have read the relevant code and confirmed a reachable invariant break, leak, unsoundness risk, or project-policy violation.

## Review Routing Matrix

| Diff signal | Load checklists |
| --- | --- |
| New/changed domain types, value objects, enums, constructors, mutators, monetary/time/unit fields | `domain-modeling.md`, `state-transitions.md`, `tests.md` |
| State-machine transitions, lifecycle/status changes, optimistic locking, command handlers | `state-transitions.md`, `aggregate-transactions.md`, `persistence-events.md`, `tests.md` |
| `Result`, error enums, panics, `unwrap`/`expect`, infrastructure error mapping | `error-handling.md`, `tests.md` |
| `async fn` use cases, `.await?`, port calls, `try_join`, lock usage across await | `error-handling.md`, `application-wiring.md`, `tests.md` |
| Use-case structs, handler wiring, repository traits, adapter injection | `application-wiring.md`, `persistence-events.md`, `tests.md` |
| HTTP/queue/CLI/config/DB input, DTOs, serde derives/defaults, row mapping | `boundary.md`, `domain-modeling.md`, `tests.md` |
| PII/secrets/tokens, logging, tracing, metrics, errors, `Debug`/`Display` | `pii-protection.md`, `logging-metrics.md`, `tests.md` |
| `unsafe`, `unsafe fn`, `unsafe impl`, FFI, raw pointers, `MaybeUninit`, `transmute`, safe wrappers | `unsafe-boundaries.md`, `boundary.md`, `tests.md` |
| `rustfmt`, `clippy`, lint configuration, `#[allow]`, warnings, CI quality gates | `fmt-lint.md`, nearby concern checklist, `tests.md` |
| Rustdoc, public API docs, `# Errors`, `# Panics`, `# Safety`, doctests, intra-doc links | `rustdoc.md`, nearby concern checklist, `tests.md` |
| CI workflows, required checks, GitHub Actions, cargo fmt/clippy/test/doc jobs, advisory checks | `ci-setup.md`, `fmt-lint.md`, `tests.md` |
| Dev environment, crate layout, fake ports, local test loop, docker-compose, `.env.example` | `dev-environment.md`, `application-wiring.md`, `tests.md` |
| Repositories, transactions, DB constraints, outbox/events, retries/idempotency | `persistence-events.md`, `aggregate-transactions.md`, `state-transitions.md`, `tests.md` |
| `Stream`, projections, outbox polling, continuous queries, event subscriptions | `stream-continuous-queries.md`, `persistence-events.md`, `service-boundaries.md`, `tests.md` |
| proc-macro, derive macro, `macro_rules!`, generated newtype/event impls | `domain-macros.md`, `domain-modeling.md`, `boundary.md`, `tests.md` |
| gRPC/Protobuf, tonic/prost, message queues, cross-service contracts | `service-boundaries.md`, `boundary.md`, `persistence-events.md`, `tests.md` |
| `#[source]`, `#[from]`, error chain logging, duplicate error logs | `error-handling.md`, `logging-metrics.md`, `tests.md` |
| `proptest`, `quickcheck`, `proptest!`, custom strategies, property regressions | `property-based-tests.md`, `tests.md`, nearby domain checklist |
| Test-only helpers, builders, fixtures, compile-fail coverage | `tests.md` |

Use nearby checklists when a diff crosses concerns. Do not load unrelated files just to restate generic advice.

## Checklist Order

- [`checklist/domain-modeling.md`](/docs/kamae-rs/review/checklist/domain-modeling/)
- [`checklist/state-transitions.md`](/docs/kamae-rs/review/checklist/state-transitions/)
- [`checklist/error-handling.md`](/docs/kamae-rs/review/checklist/error-handling/)
- [`checklist/boundary.md`](/docs/kamae-rs/review/checklist/boundary/)
- [`checklist/pii-protection.md`](/docs/kamae-rs/review/checklist/pii-protection/)
- [`checklist/logging-metrics.md`](/docs/kamae-rs/review/checklist/logging-metrics/)
- [`checklist/unsafe-boundaries.md`](/docs/kamae-rs/review/checklist/unsafe-boundaries/)
- [`checklist/fmt-lint.md`](/docs/kamae-rs/review/checklist/fmt-lint/)
- [`checklist/rustdoc.md`](/docs/kamae-rs/review/checklist/rustdoc/)
- [`checklist/ci-setup.md`](/docs/kamae-rs/review/checklist/ci-setup/)
- [`checklist/dev-environment.md`](/docs/kamae-rs/review/checklist/dev-environment/)
- [`checklist/persistence-events.md`](/docs/kamae-rs/review/checklist/persistence-events/)
- [`checklist/stream-continuous-queries.md`](/docs/kamae-rs/review/checklist/stream-continuous-queries/)
- [`checklist/domain-macros.md`](/docs/kamae-rs/review/checklist/domain-macros/)
- [`checklist/service-boundaries.md`](/docs/kamae-rs/review/checklist/service-boundaries/)
- [`checklist/property-based-tests.md`](/docs/kamae-rs/review/checklist/property-based-tests/)
- [`checklist/application-wiring.md`](/docs/kamae-rs/review/checklist/application-wiring/)
- [`checklist/aggregate-transactions.md`](/docs/kamae-rs/review/checklist/aggregate-transactions/)
- [`checklist/tests.md`](/docs/kamae-rs/review/checklist/tests/)

## Severity Classes

- High: likely runtime failure, impossible state admitted, unvalidated external data, or PII leak.
- Medium: weak domain contract, non-exhaustive error/state handling, persistence consistency risk.
- Low: maintainability, idiom, or test-quality issue that does not immediately compromise correctness.

Escalate when the diff touches external boundaries, authorization/tenant isolation, money, irreversible lifecycle transitions, persistence/event atomicity, secrets, unsafe soundness, FFI, misleading public API docs, CI gates that can let broken domain code merge, lint suppressions that hide correctness risks, or production observability. Downgrade when the risk is compile-time contained, test-only, startup-only, internal to a trusted adapter, generated code, private helper docs, advisory CI, or blocked by a nearby invariant not visible at the flagged line. Do not report a finding without evidence that a realistic caller can reach the bad state or leak.

Required evidence:

- Show the bypass path or missing guard, not only the smell.
- Name the invariant or domain rule being broken.
- Confirm whether existing constructors, validators, DB constraints, auth checks, or tests already cover it.
- Prefer "no issue" over speculative style findings.

If no issues are found, say so clearly and mention residual risk or test gaps.
