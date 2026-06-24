---
title: "Rustdoc Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/rustdoc.md`](/docs/kamae-rs/../../kamae-rs/references/rustdoc/).

## 9.1 Do public domain APIs document their contract? - Medium

Flag public domain newtypes, constructors, state types, transition methods, repository traits, DTO conversions, and adapter wrappers whose docs omit important invariants, valid inputs, units, lifecycle rules, side effects, or consistency guarantees.

Do not require rustdoc on private helpers unless they encode a subtle invariant that reviewers or maintainers are likely to misuse.

## 9.2 Are errors, panics, and safety contracts documented? - High

Flag public functions returning domain `Result` types when docs hide important error variants callers must handle. Flag production panics without a `# Panics` section.

Every `unsafe fn`, `unsafe trait`, or caller-upheld unsafe contract must have a `# Safety` section. Use the unsafe-boundaries checklist for the implementation soundness review.

## 9.3 Do examples show the safe path? - Medium

Flag examples that construct invariant-bearing values through private-field shortcuts, bypass DTO conversion, unwrap errors without explanation, leak PII, or show impossible state transitions.

Prefer examples that compile as doctests. Use `no_run`, `ignore`, or `compile_fail` only when there is a clear reason.

## 9.4 Are rustdoc links and doctests maintained? - Low

Flag broken intra-doc links, stale type names, examples that no longer compile, or docs that contradict current constructor/error/state behavior.

Escalate when stale docs can cause callers to bypass validation, mishandle an error variant, misuse unsafe code, or leak sensitive data.

## 9.5 Are documentation lints scoped appropriately? - Low

Flag public library crates that lack any way to catch broken intra-doc links. Suggest `#![deny(rustdoc::broken_intra_doc_links)]` where appropriate.

Do not require `#![warn(missing_docs)]` for application crates or generated/FFI bindings unless the project already has that policy. Safe wrappers around generated code still need contract docs.
