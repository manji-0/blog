---
title: "CI Setup Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/ci-setup.md`](/docs/kamae-rs/../../kamae-rs/references/ci-setup/).

## 10.1 Do required checks cover reviewer assumptions? - High

Flag CI that allows domain code to merge without the checks reviewers rely on: package validation, `cargo fmt --check`, relevant `cargo clippy`, relevant tests, and rustdoc when public API contracts changed.

Downgrade when the repository is not a Rust crate or the changed files are documentation-only.

## 10.2 Are feature/package matrices representative? - Medium

Flag workflows that test only the default crate or default features when domain behavior, validation, persistence, or unsafe code changes across workspace members, feature flags, MSRV, database adapters, or target platforms.

Do not require a huge matrix when local code paths are feature-independent.

## 10.3 Are unsafe/security jobs tied to actual risk? - Medium

Flag unsafe-heavy, FFI, parser, or credential/PII-sensitive crates with no documented plan for Miri, sanitizers, fuzz/property tests, dependency audits, or secret scanning.

Do not require every optional safety job on every pull request. Scheduled, manual, or path-filtered jobs are acceptable when risk and cost are balanced.

## 10.4 Are advisory checks clearly advisory? - Low

Flag `continue-on-error`, ignored exit codes, or non-required checks that look mandatory in the workflow name or README.

Escalate when an advisory check is the only guard for unsafe soundness, PII leakage, persistence integrity, or public API docs.

## 10.5 Can developers reproduce CI locally? - Low

Flag CI that has no documented local equivalent for the core checks, especially when failure output is hard to reproduce.

Suggest a short local command list or script that runs package validation, formatting, linting, and tests for touched crates. Cross-check [`../../kamae-rs/references/quality-gates.md`](/docs/kamae-rs/../../kamae-rs/references/quality-gates/) for canonical commands and [`../../kamae-rs/references/dev-environment.md`](/docs/kamae-rs/../../kamae-rs/references/dev-environment/) for the recommended fast path and full pre-push loop.
