---
title: "Development Environment Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/dev-environment.md`](/docs/kamae-rs/../../kamae-rs/references/dev-environment/).

## 11.1 Is domain code free of I/O dependencies? - High

Flag `domain` crates or modules that depend on `sqlx`, `axum`, `tonic`, or other
infrastructure crates when the team claims a Kamae-style split.

## 11.2 Can domain and use-case tests run without Docker? - Medium

Flag workflows where basic transition or use-case tests require live databases
or external services when fake ports would suffice.

## 11.3 Are fixtures built through constructors? - Medium

Cross-check [`tests.md`](/docs/kamae-rs/references/tests/). Flag test helpers that bypass invariants
with public field literals or raw ORM rows in domain/use-case tests.

## 11.4 Is a documented local check loop available? - Low

Flag projects adopting Kamae conventions without a fast path and full pre-push
command list aligned with [`ci-setup.md`](/docs/kamae-rs/../../kamae-rs/references/ci-setup/).

## 11.5 Are secrets and PII kept out of committed env files? - High

Cross-check [`pii-protection.md`](/docs/kamae-rs/references/pii-protection/). Flag committed `.env`
files, real credentials in examples, or local setup docs that encourage logging
raw PII for debugging.

## 11.6 Does test layout match crate boundaries? - Medium

Flag domain tests that pull in HTTP servers or DB pools directly instead of
testing through fakes at the use-case layer or adapters at the infrastructure
layer.
