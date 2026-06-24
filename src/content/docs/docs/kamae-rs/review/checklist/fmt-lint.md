---
title: "Formatting and Lints Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/fmt-lint.md`](/docs/kamae-rs/../../kamae-rs/references/fmt-lint/).

## 8.1 Is touched Rust code formatted? - Low

Flag touched Rust files that would fail `cargo fmt --check` or `rustfmt --check`, unless they are generated or vendored code.

Formatting findings should stay Low unless poor formatting hides a risky domain, unsafe, PII, persistence, or boundary change.

## 8.2 Are lint results clean for the relevant package? - Medium

Flag new warnings or skipped lint gates when the repository normally runs `cargo clippy`, `cargo check`, or equivalent CI for the touched package.

Do not require a new global `-D warnings` policy in a repo that does not use it. Instead, recommend running the existing local command and fixing warnings in touched code.

## 8.3 Are lint suppressions narrow and justified? - Medium

Flag broad `#![allow(warnings)]`, `#![allow(clippy::all)]`, module-level suppressions, or unexplained `#[allow(...)]` around domain, boundary, PII, unsafe, persistence, or error-handling code.

Downgrade for generated, vendored, or compatibility code when the source is documented and isolated.

## 8.4 Do suppressed lints hide domain safety risks? - High

Flag suppression or ignored warnings involving panics, unchecked indexing, broad enum matches, lossy casts, floating-point money/quantity comparisons, ignored `Result`s, `await_holding_lock`, unsafe blocks, PII `Debug`, or boundary deserialization.

Escalate when the suppression can admit invalid state, data loss, PII leakage, unsoundness, or missed persistence failure.

## 8.5 Are formatting/lint gates represented in CI or package validation? - Low

Flag packages with Rust source changes but no documented way to run formatting and lint checks. Suggest `cargo fmt --check` and the project's relevant `cargo clippy` command.

Do not block small documentation-only changes on missing Rust CI.
