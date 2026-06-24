---
title: "Rust Formatting and Lints"
sidebar:
  order: 10
---

## Formatting Baseline

Run `cargo fmt` or `rustfmt` on touched Rust files before finishing a change. Formatting is not a style debate in Kamae: it keeps diffs reviewable so domain, boundary, PII, unsafe, and persistence changes are easier to inspect.

Do not hand-align code in ways `rustfmt` will undo. Prefer small helper functions or named value objects over formatting tricks that hide complex conditions.

## Clippy Baseline

Run `cargo clippy` for the relevant package or workspace when the project has a Rust crate available. Use the project's existing command if one exists.

Recommended default:

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

Adjust features, packages, or warning policy to match the repository. Do not introduce a stricter global lint policy casually in an unrelated change.

## Workspace Lint Unification

For workspaces with multiple domain crates, centralize lint policy so adapters and domain crates share the same bar.

### Root `Cargo.toml` — inherited lints (Rust 1.74+)

```toml
[workspace.lints.rust]
unsafe_code = "forbid"
missing_docs = "allow"  # enable per crate when ready

[workspace.lints.clippy]
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
todo = "warn"
wildcard_enum_match_arm = "warn"
float_cmp = "warn"

[package]
name = "booking-domain"
# ...

[lints]
workspace = true
```

Member crates use `[lints] workspace = true` to inherit. Tighten one crate (e.g. `booking-domain`) with additional `deny` lints without copying the full list.

### `clippy.toml` recommendations

Place at workspace root:

```toml
# Reject short, ambiguous names in public domain APIs
min-ident-chars-threshold = 2

# Catch accidental float usage in money-like names (project-specific)
disallowed-names = ["foo", "bar", "baz"]

# If the codebase standardizes on a money newtype:
# cognitive-complexity-threshold = 25
```

Add `disallowed-methods` or `disallowed-types` when the team bans `f64` for currency in domain crates (requires nightly or custom lint discipline via review).

Pair `clippy.toml` with CI running the same flags as local dev. See [`ci-setup.md`](/docs/kamae-rs/references/ci-setup/).

## Lints That Matter for Domain Safety

Pay special attention to lints and patterns that can hide invalid states or operational failures:

- `unwrap_used`, `expect_used`, `panic`, and unchecked indexing in domain/use-case code
- `todo`, `unimplemented`, and `unreachable` outside tests or proven invariants
- `large_enum_variant`, `result_large_err`, and needless cloning that may indicate awkward domain boundaries
- `float_cmp`, suspicious arithmetic, and lossy casts in money, quantity, duration, or unit code
- `wildcard_enum_match_arm` and broad `_` arms over domain enums
- `derive_partial_eq_without_eq`, broad `derive(Debug)`, and serialization derives on sensitive or invariant-bearing types
- `await_holding_lock`, detached tasks, and ignored `Result`s in use cases or adapters

Do not require every lint above to be globally enabled. Use them as review signals when they appear in touched code or local configuration.

## Suppression Rules

Keep `#[allow(...)]` as narrow as possible:

- Prefer item-level or expression-level allows over crate-level allows.
- Include a short reason when suppressing a lint that affects correctness, safety, PII, persistence, or error handling.
- Avoid blanket `#![allow(warnings)]`, `#![allow(clippy::all)]`, or broad module-level allows in production code.

Good:

```rust
#[allow(clippy::result_large_err, reason = "error enum preserves exhaustive domain handling")]
pub fn assign_driver(...) -> Result<..., AssignDriverError> { ... }
```

If the toolchain does not support `reason`, add a nearby comment.

## Generated and Third-Party Code

Do not force generated bindings, vendored code, or externally maintained snapshots through the same lint bar as domain code. Keep those files isolated and document the generation source.

Generated code may use broader allows, but safe wrappers around generated/FFI code still follow the unsafe boundary and boundary validation guidance.

## CI Expectations

Prefer CI jobs that run the baseline commands in [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/):

- `cargo fmt --all -- --check`
- `cargo clippy` with the repository's feature/package matrix
- tests relevant to domain constructors, transitions, boundary conversion, unsafe wrappers, and persistence behavior

When a project cannot run full workspace checks quickly, run the smallest package/feature set that covers the changed code and state the limitation. See [`ci-setup.md`](/docs/kamae-rs/references/ci-setup/) for workflow templates and branch protection.

## Common Crate Combinations

| Goal | Approach |
| --- | --- |
| Uniform domain bar | `[workspace.lints]` + `workspace = true` in each member |
| Stricter domain crate only | Override `unwrap_used = "deny"` in `booking-domain/Cargo.toml` |
| Generated prost/FFI | `#[allow(...)]` on generated module; lint the safe wrapper crate |
