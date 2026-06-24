---
title: "Quality Gates"
sidebar:
  order: 10
---

> **When to read:** Before finishing changes to domain, boundary, PII, persistence, tests, or sample code. **Canonical command list** for local and CI checks.
> **Related:** [`local-validation.md`](/docs/kamae-rs/references/local-validation/), [`ci-setup.md`](/docs/kamae-rs/references/ci-setup/), [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/).

## Baseline Commands

Prefer the repository's existing commands when present; otherwise use these defaults for touched Rust code:

```bash
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

For narrow changes, run the smallest command set that covers the touched crates and state the limitation:

```bash
cargo fmt --all
cargo clippy -p domain -p application --all-targets -- -D warnings
cargo test -p domain -p application
```

Use `cargo fmt --check` in CI; apply with `cargo fmt --all` locally when the format check fails.

For first-time local setup, read [`local-validation.md`](/docs/kamae-rs/references/local-validation/) and copy or merge templates from [`../assets/templates/`](/docs/kamae-rs/../assets/templates/). Installed skills include files under the skill directory, but do not reliably install this repository's root `Cargo.toml`, `rust-toolchain.toml`, `.github/`, or `scripts/`.

## Skill-Package and Review Probe Checks

Skill/plugin repositories should also run:

```bash
python3 scripts/validate_package.py
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

In the **kamae-rs** repository itself, use `scripts/validate_package.py` and `cargo run -p kamae-review-probe`. Example code lives in the workspace crate `kamae-rs-taxi-request` under `skills/kamae-rs/examples/`; run `cargo test --all-targets` from the repository root. See [`development-setup.md`](/docs/kamae-rs/references/development-setup/) for this repo's dev workflow.

Application crates that install the skill may add the probe to CI or pre-push hooks when domain directories change:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

## Clippy Signals That Matter for Domain Safety

Formatting keeps diffs reviewable so domain, boundary, PII, unsafe, and persistence changes are easier to inspect.

Pay special attention to patterns that can hide invalid states or operational failures:

- `unwrap`, `expect`, `panic!`, and unchecked indexing in domain/use-case code.
- `todo!`, `unimplemented!`, and `unreachable!` outside tests or proven invariants.
- `wildcard_enum_match_arm` and broad `_` arms over domain enums.
- `float_cmp`, suspicious arithmetic, and lossy casts in money, quantity, duration, or unit code.
- Broad `#[allow(...)]`, `#![allow(warnings)]`, and crate-level lint suppression.
- `await_holding_lock`, detached tasks, and ignored `Result`s in use cases or adapters.

Do not require every lint to be globally enabled. Use them as review signals when they appear in touched code or local configuration. See [`fmt-lint.md`](/docs/kamae-rs/references/fmt-lint/) for suppression rules.

## Rustdoc and Type Contracts

Run `cargo doc` with `-D warnings` when public domain APIs changed. Public constructors, transitions, repository ports, and safe wrappers around `unsafe` code should document invariants, errors, panics, and safety obligations.

Avoid weakening documentation around discriminated state enums, port traits, `Result` error semantics, boundary DTO conversion, and redaction behavior.

## Tests

Run focused tests for domain constructors, transitions, DTO conversion, PII redaction, unsafe wrappers, repository transactions, outbox behavior, and retry/idempotency paths.

| Concern | Where to test | Guide |
| --- | --- | --- |
| Fixtures and transition edges | unit/integration tests | [`test-data.md`](/docs/kamae-rs/references/test-data/) |
| Input-wide invariants | `proptest!` or `quickcheck!` | [`property-based-tests.md`](/docs/kamae-rs/references/property-based-tests/) |
| Compile-time state safety | `trybuild` | [`test-data.md`](/docs/kamae-rs/references/test-data/#test-compile-time-state-safety) |
| Fake ports and use cases | `application` tests | [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/#fake-ports-and-test-fixtures) |

Generated bindings, vendored code, or externally maintained snapshots can be exempt from the full lint bar, but safe wrappers around them still follow boundary validation, PII, and unsafe-boundary guidance.
