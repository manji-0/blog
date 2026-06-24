---
title: "Unsafe Boundaries Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/unsafe-boundaries.md`](/docs/kamae-rs/../../kamae-rs/references/unsafe-boundaries/).

## 7.1 Is unsafe absent from domain logic? - High

Flag `unsafe` blocks, `unsafe fn`, `unsafe impl`, raw pointer dereferences, `MaybeUninit`, `transmute`, or unchecked indexing inside domain entities, value objects, state transitions, use cases, DTO conversion, PII wrappers, or repository traits.

Do not flag unsafe code isolated in adapter/infrastructure modules when it is hidden behind a safe API and does not bypass domain constructors, validation, authorization, or redaction.

## 7.2 Is unsafe contained behind a safe abstraction? - High

Flag public APIs that require callers to uphold undocumented aliasing, lifetime, bounds, initialization, FFI, or ownership preconditions. Prefer a safe function that checks preconditions before the unsafe block.

If the API must be `unsafe fn`, require a `# Safety` contract that names caller obligations.

## 7.3 Are safety invariants documented at the unsafe site? - Medium

Flag unsafe blocks without a nearby `SAFETY:` comment explaining the invariant, where it is established, and why aliasing, lifetimes, initialization, alignment, and bounds are valid.

Do not accept comments that merely restate the operation.

## 7.4 Can unsafe bypass domain construction or redaction? - High

Flag unsafe code that constructs domain values from raw data without the normal `TryFrom`, `FromStr`, or constructor path, or that exposes PII/secrets through logs, `Debug`, panic messages, FFI callbacks, metrics labels, or raw memory buffers.

## 7.5 Are unsafe boundaries tested with appropriate tools? - Medium

Flag unsafe wrappers without focused tests for normal inputs, boundary inputs, rejected constructors, mutation paths, null/invalid FFI handles, or error paths.

Suggest Miri, sanitizers, fuzzing, or property tests when the unsafe block owns memory, pointer aliasing, initialization, or FFI lifetime contracts. Do not require those tools for every small safe-domain change.
