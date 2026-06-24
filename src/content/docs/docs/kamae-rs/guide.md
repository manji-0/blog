---
title: "Kamae Rust"
sidebar:
  order: 1
  label: "Guide"
---

Use this skill as a thin dispatcher. Read only the topic and crate guide files relevant to the current task.

## Step 0: Load Applicable Rules

Before any other step, read matching rule files in priority order:

1. `.claude/rules/*.md` and `.codex/rules/*.md` in the project root
2. `~/.claude/rules/*.md` and `~/.codex/rules/*.md`
3. `../../rules/defaults/*.md` relative to this `SKILL.md`

For each rule:

- Read YAML frontmatter. Skip it unless `applies-to` is `kamae-rs` or `*`.
- Group by `name`. The first tier above wins over later tiers; within a tier, the lexicographically last filename wins.
- Apply surviving `library-preference`, `convention`, and `override` rules throughout the task.

## Step 1: Detect Rust Context

Read `Cargo.toml` and the workspace members relevant to the edited files. Note these dependencies if present. Crates with guide files load the guide only when relevant; detection-only crates inform local conventions but do not require a guide.

- Error: `thiserror`, `anyhow`, `eyre`; detection-only: `snafu`
- Boundary/serialization: `serde`; detection-only: `serde_json`, `toml`, `config`
- Validation/newtype: `validator`, `garde`, `nutype`; detection-only: `derive_more`
- PII/secrets: `secrecy`; detection-only: `zeroize`
- Logging/tracing/metrics: `tracing`, `log`, `metrics`; monitoring export base: `opentelemetry`; optional pull exporter: `prometheus`
- Detection-only persistence: `sqlx`, `diesel`, `sea-orm`
- Detection-only async: `tokio`, `async-trait`, `futures`, `tokio-stream`, `async-stream`
- Detection-only RPC/messaging: `tonic`, `prost`, `lapin`, `rdkafka`
- Detection-only resilience: `tower`, `governor`
- Detection-only testing: `proptest`, `quickcheck`, `proptest-regressions`, `trybuild`

If a dependency is relevant, load the matching file under [`references/crate-guides/`](/docs/kamae-rs/references/crate-guides/). Crate guides cover crate-specific defaults only; prefer the matching topic guide under `references/` for full patterns. If no crate guide matches, use standard-library Rust idioms before introducing a new dependency.

## Step 2: Load Topic Guides

Read only the topic file(s) needed for the task. Some topic files include
`constrained-by` HTML comments at the top; load those related guides when
applying the primary topic.

- Application Wiring: [`references/application-wiring.md`](/docs/kamae-rs/references/application-wiring/)
- Aggregates and Transactions: [`references/aggregate-transactions.md`](/docs/kamae-rs/references/aggregate-transactions/)
- Gradual Adoption: [`references/adoption.md`](/docs/kamae-rs/references/adoption/)
- Domain Modeling: [`references/domain-modeling.md`](/docs/kamae-rs/references/domain-modeling/)
- State Transitions: [`references/state-transitions.md`](/docs/kamae-rs/references/state-transitions/)
- Error Handling: [`references/error-handling.md`](/docs/kamae-rs/references/error-handling/)
- Boundary Defense: [`references/boundary-defense.md`](/docs/kamae-rs/references/boundary-defense/)
- PII Protection: [`references/pii-protection.md`](/docs/kamae-rs/references/pii-protection/)
- Logging and Metrics: [`references/logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/)
- Unsafe Boundaries: [`references/unsafe-boundaries.md`](/docs/kamae-rs/references/unsafe-boundaries/)
- Formatting and Lints: [`references/fmt-lint.md`](/docs/kamae-rs/references/fmt-lint/)
- Quality Gates: [`references/quality-gates.md`](/docs/kamae-rs/references/quality-gates/)
- Rustdoc Contracts: [`references/rustdoc.md`](/docs/kamae-rs/references/rustdoc/)
- CI Setup: [`references/ci-setup.md`](/docs/kamae-rs/references/ci-setup/)
- Local Validation Setup: [`references/local-validation.md`](/docs/kamae-rs/references/local-validation/)
- Development Environment: [`references/dev-environment.md`](/docs/kamae-rs/references/dev-environment/)
- Skill Repository Setup: [`references/development-setup.md`](/docs/kamae-rs/references/development-setup/)
- Persistence and Events: [`references/persistence-events.md`](/docs/kamae-rs/references/persistence-events/)
- Streams and Continuous Queries: [`references/stream-continuous-queries.md`](/docs/kamae-rs/references/stream-continuous-queries/)
- Domain Macros: [`references/domain-macros.md`](/docs/kamae-rs/references/domain-macros/)
- Service Boundaries: [`references/service-boundaries.md`](/docs/kamae-rs/references/service-boundaries/)
- Test Data: [`references/test-data.md`](/docs/kamae-rs/references/test-data/)
- Property-Based Tests: [`references/property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/)

## Core Stance

Model invalid states and invalid transitions out of the type system where it is practical:

- Use enums, structs, newtypes, private fields, and `TryFrom`/`FromStr` constructors.
- Use `Result<T, E>` with domain-specific error enums in domain and use-case code.
- Avoid `panic!`, `unwrap()`, and `expect()` in domain code.
- Parse external data into DTOs first, then convert DTOs into domain types.
- Keep persistence models, API DTOs, and domain models separate unless the project has an explicit convention otherwise.
- Keep `unsafe` out of domain logic by default. When FFI, memory layout, or measured low-level performance requires it, hide it behind a small safe API with documented safety invariants.
- Keep `rustfmt` and `clippy` clean for touched Rust code. Treat lint suppressions as design decisions that need narrow scope and a reason.
- Document public domain APIs with rustdoc that states invariants, errors, state transitions, examples, and safety contracts where relevant.
- Keep CI aligned with the checks reviewers rely on: format, lint, tests, rustdoc, and optional unsafe/security probes.

These are strong defaults, not absolutes. If existing project conventions conflict, follow the convention and leave a brief explanation when the deviation affects domain safety.

## Examples

Read [`examples/taxi-request.rs`](/docs/kamae-rs/examples/taxi-request/) only when a concrete state-transition example would clarify the task. The example intentionally omits rustdoc; follow [`references/rustdoc.md`](/docs/kamae-rs/references/rustdoc/) for production public APIs.
