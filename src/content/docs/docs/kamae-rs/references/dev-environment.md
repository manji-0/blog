---
title: "Rust Development Environment"
sidebar:
  order: 10
---

<!-- constrained-by ./application-wiring.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./test-data.md -->

## Goal

Set up a workspace where domain code can be implemented and tested the way
Kamae expects: typed domain models, port-based use cases, constructor-based
fixtures, and the same checks reviewers and CI rely on.

This guide is for **application crates** that follow the skill. For editing the
skill package itself, see the repository root [`DEVELOPMENT.md`](/docs/kamae-rs/../../../DEVELOPMENT/).

## Toolchain

Install Rust with formatting, lint, and documentation components:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

Pin the toolchain when the team shares an MSRV or stable version:

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

Optional but useful for domain work:

| Tool | Purpose |
| --- | --- |
| [cargo-nextest](https://nexte.st/) | Faster test runs in large workspaces |
| [cargo-watch](https://github.com/watchexec/cargo-watch) | Re-run tests while editing domain code |
| [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov) | Coverage on touched modules during migration |

Keep domain crate builds fast. Prefer `cargo test -p domain-crate` over testing
the entire workspace while iterating on transitions or value objects.

## Recommended Crate Layout

Split responsibilities so domain logic stays free of I/O and framework types.

```text
my-service/
  Cargo.toml                 # workspace root
  crates/
    domain/                  # entities, value objects, transitions, domain errors
    application/             # use cases, port traits, use-case errors
    infrastructure/          # SQL/HTTP/queue adapters, outbox, telemetry wiring
    api/                     # Axum/tonic handlers, DTOs, composition root
  tests/                     # optional workspace integration tests
```

Single-crate projects can use modules instead of separate crates:

```text
src/
  domain/
  application/
  infrastructure/
  api/
  main.rs                    # composition root
```

Rules:

- `domain` must not depend on `sqlx`, `axum`, `tonic`, or other I/O crates.
- Handlers and `main` wire adapters; use cases depend on port traits only (see
  [`application-wiring.md`](/docs/kamae-rs/references/application-wiring/)).
- Keep DTOs next to the boundary that owns them (`api`, `infrastructure`), not
  inside `domain`.

## Baseline `Cargo.toml` Dependencies

Start from what the project already uses. When bootstrapping Kamae-style code,
these are common pairings:

```toml
[dependencies]
thiserror = "2"
serde = { version = "1", features = ["derive"] }
tracing = "0.1"

[dev-dependencies]
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
proptest = "1"
trybuild = "1"
```

Load crate guides from [`crate-guides/`](/docs/kamae-rs/references/crate-guides/) when the dependency
is present. Do not add crates to `domain` solely because a guide exists.

## Dev-Dependencies by Skill Topic

| Topic | Typical dev-dependencies | Notes |
| --- | --- | --- |
| Async use cases | `tokio`, `tokio-test` | Test async ports with `#[tokio::test]` |
| Property tests | `proptest`, `proptest-regressions` | See [`property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/) |
| Compile-fail state safety | `trybuild` | See [`test-data.md`](/docs/kamae-rs/references/test-data/) |
| HTTP boundary tests | `axum`, `tower`, `http-body-util` | Test handlers with fake use cases |
| Persistence integration | `testcontainers`, `sqlx` (test feature) | Optional; keep most domain tests on fakes |
| Fake time | `time` + injected clock trait | Avoid wall-clock flakiness |

Keep integration-test dependencies in the crate that owns the adapter, not in
`domain`.

## Test Layers

Run tests at the lowest layer that can prove the invariant.

| Layer | What to test | I/O |
| --- | --- | --- |
| Domain unit | constructors, transitions, domain errors | None |
| Use case | orchestration with fake ports | None |
| Adapter unit | SQL mapping, DTO `TryFrom`, redaction | Fake or in-memory |
| API/integration | handler -> use case -> adapter | Test DB or container optional |
| Property | input-wide laws | None in the property body |

```bash
# Fast loop while editing domain code
cargo test -p domain --lib

# Use case tests with fakes
cargo test -p application --lib

# Full workspace before push
cargo test --all-targets --all-features
```

Domain and use-case tests should not require Docker. Reserve containers for
adapter integration tests that truly need PostgreSQL, Redis, or similar.

## Fake Ports and Test Fixtures

Inject fakes at the composition root used by tests. Build fixtures through the
same constructors as production code (see [`test-data.md`](/docs/kamae-rs/references/test-data/)).

```rust
// application/tests/support/fakes.rs
pub struct FakeRequestStore {
    pub saved: Mutex<Vec<(EnRouteRequest, Vec<TaxiRequestEvent>)>>,
}

impl RequestStore for FakeRequestStore {
    async fn save_assigned(
        &self,
        state: &EnRouteRequest,
        events: &[TaxiRequestEvent],
    ) -> Result<(), RepositoryError> {
        self.saved.lock().unwrap().push((state.clone(), events.to_vec()));
        Ok(())
    }
}

pub fn assign_driver_use_case() -> AssignDriver<FakeResolver, FakeRequestStore> {
    AssignDriver::new(FakeResolver::default(), FakeRequestStore::default())
}
```

Guidelines:

- Share fixture helpers in `tests/support/` or `#[cfg(test)] mod test_support`.
- Use `expect` only in fixtures with a message that states the fixture invariant.
- Prefer one fake per port over a mega-mock that hides missing behavior.

## Optional Local Services

When adapter integration tests need real infrastructure, document one blessed
path for the team.

**docker-compose** (simple, checked into the repo):

```yaml
# compose.yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: my_service_test
    ports:
      - "5432:5432"
```

**testcontainers** (self-contained in tests):

- Good for CI parity when compose is not available.
- Slower; scope to `infrastructure` integration tests only.

Load migration SQL or schema before tests. Never point local dev databases at
production credentials.

## Environment and Secrets

- Commit `.env.example` with non-secret placeholders; keep `.env` out of git.
- Read secrets through config crates at startup, not inside domain code.
- Use [`pii-protection.md`](/docs/kamae-rs/references/pii-protection/) rules before logging locally.

```bash
# .env.example
DATABASE_URL=postgres://postgres:dev@localhost:5432/my_service_test
RUST_LOG=info,my_service=debug
```

For local tracing, `RUST_LOG` plus a `tracing-subscriber` layer in `main` is
enough. OpenTelemetry exporters are optional during domain development.

## Local Check Loop

Align local commands with [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/) and
[`ci-setup.md`](/docs/kamae-rs/references/ci-setup/). Use a fast path while editing and a full path
before opening a pull request.

**Fast path** (touched crate):

```bash
cargo fmt --all
cargo clippy -p domain -p application --all-targets -- -D warnings
cargo test -p domain -p application
```

**Full path** (pre-push):

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

When the project vendors or installs the kamae-rs plugin, run the review probe
on changed Rust files before requesting review:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

Treat probe output as review leads, not automatic failures. For first-time
project bootstrap, read [`local-validation.md`](/docs/kamae-rs/references/local-validation/).

## Editor and Agent Setup

**rust-analyzer**

- Set `rust-analyzer.check.command` to `clippy` when the machine can afford it.
- Enable `rust-analyzer.rustfmt.extraArgs` only if the project documents them.

**Kamae skill**

- Load the `kamae-rs` skill in Claude/Codex when implementing or refactoring
  domain code.
- Add project rules under `.claude/rules/` or `.codex/rules/` for crate
  preferences (see [`rules/README.md`](/docs/kamae-rs/../../../rules/README/)).
- Point agents at `Cargo.toml` first so crate guides and topic files load
  correctly.

**Watch mode** (optional):

```bash
cargo watch -x 'test -p domain --lib'
```

## Bootstrap Checklist for a New Domain Module

1. Create or identify the `domain` / `application` crate (or module).
2. Add `thiserror` domain errors and value-object constructors.
3. Write unit tests for valid/invalid construction before adding use cases.
4. Define port traits shaped by one use case, not by the database schema.
5. Implement the use case with generic port fields and fake adapters in tests.
6. Add DTO `TryFrom` at the API or infrastructure boundary.
7. Wire the use case in `main` or test bootstrap only.
8. Run the fast check loop; run the full path before push.
9. Run `kamae-rs-review` (or the probe + relevant checklists) on the diff.

For legacy codebases, climb the adoption ladder in
[`adoption.md`](/docs/kamae-rs/references/adoption/) instead of restructuring everything first.

## When Local Setup Differs from CI

Document differences explicitly in the project README or `CONTRIBUTING.md`:

- feature flags tested in CI but not locally
- optional Docker-only integration jobs
- MSRV job vs developer stable toolchain
- advisory Miri/fuzz jobs

Developers should know which failures block merge and which are scheduled
advisory checks (see [`ci-setup.md`](/docs/kamae-rs/references/ci-setup/)).
