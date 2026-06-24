---
title: "Rust CI Setup"
sidebar:
  order: 10
---

> **Audience:** Projects installing the skill into their own repository. For the `kamae-rs` skill repo itself, read [`development-setup.md`](/docs/kamae-rs/references/development-setup/).
> **When to read:** Creating or updating GitHub Actions, branch protection guidance, or repository validation jobs.
> **Related:** [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/) (checks CI must run), [`local-validation.md`](/docs/kamae-rs/references/local-validation/).

## Default Stance

CI should enforce the same safety signals reviewers depend on: formatting, linting, tests, rustdoc, and package-specific validation. Keep the default pipeline boring and fast; add heavier checks only where their risk reduction is real.

Use the repository's existing commands first. If no CI exists, start with the smallest workflow that covers changed Rust domain code.

## Default GitHub Actions Workflow

CI should run the same checks as [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/). Pin the Rust toolchain with `rust-toolchain.toml` or `dtolnay/rust-toolchain@...` so local and CI builds use the same components.

When this skill is installed, use the bundled templates under [`../assets/templates/`](/docs/kamae-rs/../assets/templates/):

- [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) -> `.github/workflows/ci.yml` for ordinary Rust backend repositories.
- [`../assets/templates/github-ci-skill-package.yml`](../assets/templates/github-ci-skill-package.yml) -> `.github/workflows/ci.yml` for skill/plugin repositories.
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> `scripts/validate_package.py` when using the skill-package workflow.

You can copy them with the bundled script:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

The script is non-destructive by default; use `--dry-run` to preview and `--force` only when intentionally replacing files.

You can also add the Kamae review probe to CI or pre-push hooks:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/ --json
```

The probe is advisory by default. Use it to surface review leads for panics, unsafe code, serde derives, and PII terms — not as a required merge gate unless your team documents that policy.

After copying templates, replace `path/to/kamae-rs` in workflow steps with the installed skill path or vendor the `crates/review-probe` crate into your repository.

Recommended workflow for skill/plugin repositories:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  package:
    name: Skill package checks
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Validate skill package
        run: python3 scripts/validate_package.py

  rust:
    name: Rust checks
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: hashFiles('Cargo.toml') != ''

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Smoke review probe
        run: cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json

      - name: Format
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Test
        run: cargo test --all-targets --all-features

      - name: Docs
        run: RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

For ordinary backend repositories that are not skill packages, omit the `Validate skill package` step or use [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml).

## Minimum Rust Checks

For a Rust crate or workspace, prefer these jobs:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

Adjust `--all-features`, packages, or warning policy when the project has a known feature matrix. Do not introduce `-D warnings` across a legacy workspace unless the team is ready to fix existing warnings.

For this skill package, also run:

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

The example crate `kamae-rs-taxi-request` uses [`skills/kamae-rs/examples/Cargo.toml`](../examples/Cargo.toml) with `path = "taxi-request.rs"` so the sample compiles and tests in CI without duplicating source.

## What CI Should Protect

Keep these checks required for pull requests that touch domain, boundary, PII, persistence, event, test, or skill files:

- Package validation for plugin manifests, skill frontmatter, links, and Python script syntax (skill/plugin repos).
- `cargo fmt --check` on touched Rust code.
- Relevant `cargo clippy` for the workspace or changed crates.
- Tests covering constructors, transitions, boundary parsing, redaction, persistence retries, and event compatibility.
- `cargo doc` with `-D warnings` when public domain API contracts changed.

## Matrix Strategy

Use a matrix when domain behavior changes across:

- feature flags
- crates in a workspace
- MSRV and stable Rust
- database adapters or persistence backends
- target OS or architecture for FFI/unsafe code

Keep expensive matrix entries scheduled or manually triggered unless the risk justifies every pull request paying the cost.

## Unsafe and Security Checks

For unsafe-heavy crates, FFI wrappers, or memory-layout code, consider adding one or more optional jobs:

- `cargo miri test` for unsafe soundness and undefined behavior checks
- sanitizer builds for memory/thread issues
- fuzz/property tests for parsers, boundary conversion, and unsafe wrappers
- `cargo deny` or equivalent dependency policy checks
- secret scanning and dependency audit jobs when the repository handles credentials or PII

Do not require these jobs for every application crate by default. Tie them to risk: unsafe ownership, raw pointers, FFI lifetimes, parser trust boundaries, or compliance-sensitive data.

## Pinning and Updates

Pin action majors or immutable SHAs according to the repository's security policy. For higher supply-chain assurance, pin third-party actions by full commit SHA and keep the version comment beside it.

Update action pins intentionally, not as drive-by churn in unrelated domain changes.

## Branch Protection

Require the CI job before merge. If a full test suite is too slow, split fast domain checks from slower integration tests, but keep the fast job required.

For backend services with adapters, add separate jobs for database-backed integration tests, migration checks, or outbox relay tests when those risks are in scope.

## CI Review Rules

When adding or reviewing CI:

- Keep checks named after the risk they guard, not after vague quality labels.
- Fail fast for formatting and package validation.
- Run tests after linting only when lint output is likely to be actionable.
- Cache build artifacts only if the cache key is specific enough to avoid stale feature/toolchain results.
- Do not hide failing checks behind `continue-on-error` unless the workflow clearly marks them as advisory.
- Protect `main` with required checks that match the review policy.

## Local Parity

Document a local command that approximates CI. Reviewers should be able to run the same core checks before pushing:

```bash
python3 scripts/validate_package.py
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
```

If full parity is too slow, document the fast path and the full path separately.
See [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/) and [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/) for toolchain setup, test layers, and the recommended local check loop.
